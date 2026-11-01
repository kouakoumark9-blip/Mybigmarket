"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getAdminDb } from "@/lib/db";
import {
  adminAddresses,
  adminCustomerConsents,
  adminCustomerGroups,
  adminCustomers,
  adminOrders,
  adminUsers,
  employeeAuditLogs,
} from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import {
  anonymizedIdentity,
  groupDiscountBasisPoints,
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  normalizePhone,
  validateAddress,
  addressSignature,
} from "@/lib/customer-rules";

/**
 * Clients, groupes et adresses — module 5.
 *
 * Règles verrouillées (ne pas régresser) :
 *  - un client ne se supprime jamais physiquement : corbeille, puis anonymisation
 *    possible seulement si plus aucune commande n'est ouverte ;
 *  - l'e-mail d'un client est unique et sert d'identité de connexion : il est
 *    normalisé en minuscules avant toute comparaison ;
 *  - une adresse par défaut est exclusive par usage et par client (index
 *    partiels en base, doublés ici pour un message clair) ;
 *  - une adresse en doublon (même destinataire, même rue, même pays) est refusée ;
 *  - toute écriture est auditée dans la transaction ;
 *  - la remise de groupe est stockée en points de base et bornée à 100 %.
 */

const revalidateAll = () => {
  revalidatePath("/clients");
  revalidatePath("/clients/groupes");
  revalidatePath("/clients/corbeille");
};

const groupSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9_-]{2,60}$/),
  name: z.string().trim().min(2).max(100),
  discountPercent: z.coerce.number().min(0).max(100),
  priceDisplayMethod: z.enum(["tax_excluded", "tax_included"]),
  showPrices: z.union([z.literal("on"), z.literal("")]).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  description: z.string().trim().max(500).optional(),
});

const customerSchema = z.object({
  email: z.string().trim().max(190),
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(32).optional(),
  companyName: z.string().trim().max(190).optional(),
  taxNumber: z.string().trim().max(80).optional(),
  customerGroupId: z.union([z.literal(""), z.coerce.number().int().positive()]).optional(),
  preferredLanguage: z.string().trim().regex(/^[a-z]{2}$/),
  preferredCurrency: z.string().trim().regex(/^[A-Z]{3}$/),
  segment: z.enum(["individual", "business", "reseller"]),
  internalNote: z.string().trim().max(2000).optional(),
  newsletter: z.union([z.literal("on"), z.literal("")]).optional(),
});

const addressSchema = z.object({
  customerId: z.string().uuid(),
  label: z.string().trim().max(80).optional(),
  firstName: z.string().trim().max(100),
  lastName: z.string().trim().max(100),
  companyName: z.string().trim().max(190).optional(),
  phone: z.string().trim().max(32),
  line1: z.string().trim().max(190),
  line2: z.string().trim().max(190).optional(),
  city: z.string().trim().max(120),
  region: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(24).optional(),
  countryCode: z.string().trim().max(2),
  deliveryInstructions: z.string().trim().max(240).optional(),
  isDefaultShipping: z.union([z.literal("on"), z.literal("")]).optional(),
  isDefaultBilling: z.union([z.literal("on"), z.literal("")]).optional(),
});


/** Commandes encore en cours pour un client : bloque corbeille et anonymisation. */
async function countOpenOrders(
  tx: Parameters<Parameters<ReturnType<typeof getAdminDb>["transaction"]>[0]>[0],
  customerId: string,
): Promise<number> {
  const rows = await tx.select({ id: adminOrders.id })
    .from(adminOrders)
    .innerJoin(adminCustomers, eq(adminCustomers.userId, adminOrders.buyerId))
    .where(and(
      eq(adminCustomers.id, customerId),
      sql`${adminOrders.status} not in ('delivered', 'cancelled', 'refunded', 'closed')`,
    ))
    .limit(1);
  return rows.length;
}

const idSchema = z.object({ id: z.string().uuid() });
const numIdSchema = z.object({ id: z.coerce.number().int().positive() });

export async function saveGroupAction(formData: FormData) {
  const { employeeId } = await requireEmployee("customers.manage");
  const id = String(formData.get("id") || "");
  const parsed = groupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/clients/groupes${id ? `?edit=${id}&` : "?"}notice=invalid`);
  const data = parsed.data;
  const basisPoints = groupDiscountBasisPoints({ discountBasisPoints: Math.round(data.discountPercent * 100), isActive: true });

  let notice = "saved";
  await getAdminDb().transaction(async (tx) => {
    const values = {
      code: data.code,
      name: data.name,
      discountBasisPoints: basisPoints,
      description: data.description || "",
      priceDisplayMethod: data.priceDisplayMethod,
      showPrices: data.showPrices === "on",
      sortOrder: data.sortOrder,
      updatedAt: new Date(),
    };
    if (id) {
      const numericId = Number(id);
      if (!Number.isInteger(numericId)) {
        notice = "invalid";
        return;
      }
      const [updated] = await tx.update(adminCustomerGroups).set(values)
        .where(and(eq(adminCustomerGroups.id, numericId), isNull(adminCustomerGroups.deletedAt)))
        .returning({ id: adminCustomerGroups.id });
      if (!updated) {
        notice = "missing";
        return;
      }
      await tx.insert(employeeAuditLogs).values({
        actorEmployeeId: employeeId, action: "customer_group.updated", entityType: "customer_group",
        entityId: String(numericId), details: { code: data.code, name: data.name, basisPoints },
      });
      return;
    }
    const [created] = await tx.insert(adminCustomerGroups)
      .values({ ...values, isActive: true })
      .onConflictDoNothing().returning({ id: adminCustomerGroups.id });
    if (!created) {
      notice = "duplicate-code";
      return;
    }
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "customer_group.created", entityType: "customer_group",
      entityId: String(created.id), details: { code: data.code, name: data.name, basisPoints },
    });
  });
  revalidateAll();
  redirect(`/clients/groupes?notice=${notice}`);
}

export async function toggleGroupAction(formData: FormData) {
  const { employeeId } = await requireEmployee("customers.manage");
  const parsed = numIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) redirect("/clients/groupes?notice=invalid");
  let notice = "toggled";
  await getAdminDb().transaction(async (tx) => {
    const [group] = await tx.select({ id: adminCustomerGroups.id, name: adminCustomerGroups.name, isActive: adminCustomerGroups.isActive })
      .from(adminCustomerGroups)
      .where(and(eq(adminCustomerGroups.id, parsed.data.id), isNull(adminCustomerGroups.deletedAt))).limit(1);
    if (!group) {
      notice = "missing";
      return;
    }
    await tx.update(adminCustomerGroups).set({ isActive: !group.isActive, updatedAt: new Date() }).where(eq(adminCustomerGroups.id, group.id));
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId,
      action: group.isActive ? "customer_group.disabled" : "customer_group.enabled",
      entityType: "customer_group", entityId: String(group.id),
      details: { name: group.name, active: !group.isActive },
    });
  });
  revalidateAll();
  redirect(`/clients/groupes?notice=${notice}`);
}

export async function setDefaultGroupAction(formData: FormData) {
  const { employeeId } = await requireEmployee("customers.manage");
  const parsed = numIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) redirect("/clients/groupes?notice=invalid");
  let notice = "default";
  await getAdminDb().transaction(async (tx) => {
    await tx.update(adminCustomerGroups).set({ isDefault: false, updatedAt: new Date() }).where(eq(adminCustomerGroups.isDefault, true));
    const [updated] = await tx.update(adminCustomerGroups).set({ isDefault: true, updatedAt: new Date() })
      .where(and(eq(adminCustomerGroups.id, parsed.data.id), isNull(adminCustomerGroups.deletedAt)))
      .returning({ id: adminCustomerGroups.id, name: adminCustomerGroups.name });
    if (!updated) {
      notice = "missing";
      return;
    }
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "customer_group.set_default", entityType: "customer_group",
      entityId: String(updated.id), details: { name: updated.name },
    });
  });
  revalidateAll();
  redirect(`/clients/groupes?notice=${notice}`);
}

export async function saveCustomerAction(formData: FormData) {
  const { employeeId } = await requireEmployee("customers.update");
  const id = String(formData.get("id") || "");
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/clients${id ? `?edit=${id}&` : "?"}notice=invalid`);
  const data = parsed.data;

  const email = normalizeEmail(data.email);
  if (!isValidEmail(email)) redirect(`/clients${id ? `?edit=${id}&` : "?"}notice=bad-email`);
  if (data.phone && !isValidPhone(data.phone)) redirect(`/clients${id ? `?edit=${id}&` : "?"}notice=bad-phone`);

  let notice = "saved";
  await getAdminDb().transaction(async (tx) => {
    const [clash] = await tx.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
    if (clash && clash.id !== id) {
      notice = "email-taken";
      return;
    }

    const groupId = data.customerGroupId || null;
    let groupCode = "default";
    if (groupId) {
      const [group] = await tx.select({ code: adminCustomerGroups.code })
        .from(adminCustomerGroups)
        .where(and(eq(adminCustomerGroups.id, groupId), isNull(adminCustomerGroups.deletedAt))).limit(1);
      if (!group) {
        notice = "group-missing";
        return;
      }
      groupCode = group.code;
    }

    if (id) {
      const [current] = await tx.select({ id: adminCustomers.id, userId: adminCustomers.userId }).from(adminCustomers)
        .where(and(eq(adminCustomers.id, id), isNull(adminCustomers.deletedAt))).limit(1);
      if (!current) {
        notice = "missing";
        return;
      }
      await tx.update(adminUsers).set({
        name: data.name,
        email,
        phone: data.phone ? normalizePhone(data.phone) : null,
        updatedAt: new Date(),
      }).where(eq(adminUsers.id, current.userId));
      await tx.update(adminCustomers).set({
        companyName: data.companyName || null,
        taxNumber: data.taxNumber || null,
        customerGroup: groupCode,
        customerGroupId: groupId,
        preferredLanguage: data.preferredLanguage,
        preferredCurrency: data.preferredCurrency,
        segment: data.segment,
        internalNote: data.internalNote || "",
        newsletterConsentAt: data.newsletter === "on" ? new Date() : null,
        newsletterOptOutAt: data.newsletter === "on" ? null : new Date(),
        updatedAt: new Date(),
        version: sql`${adminCustomers.version} + 1`,
      }).where(eq(adminCustomers.id, id));
      await tx.insert(employeeAuditLogs).values({
        actorEmployeeId: employeeId, action: "customer.updated", entityType: "customer",
        entityId: id, details: { email, name: data.name, group: groupCode, segment: data.segment },
      });
      return;
    }

    const userId = randomUUID();
    const customerId = randomUUID();
    await tx.insert(adminUsers).values({
      id: userId,
      name: data.name,
      email,
      phone: data.phone ? normalizePhone(data.phone) : null,
      role: "buyer",
      status: "active",
      passwordHash: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await tx.insert(adminCustomers).values({
      id: customerId,
      userId,
      companyName: data.companyName || null,
      taxNumber: data.taxNumber || null,
      customerGroup: groupCode,
      customerGroupId: groupId,
      preferredLocale: `${data.preferredLanguage}-CI`,
      preferredLanguage: data.preferredLanguage,
      createdAt: new Date(),
      updatedAt: new Date(),
      preferredCurrency: data.preferredCurrency,
      segment: data.segment,
      internalNote: data.internalNote || "",
      newsletterConsentAt: data.newsletter === "on" ? new Date() : null,
      lastActivityAt: new Date(),
    });
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "customer.created", entityType: "customer",
      entityId: customerId, details: { email, name: data.name, group: groupCode, segment: data.segment },
    });
  });
  revalidateAll();
  redirect(`/clients?notice=${notice}`);
}

/**
 * Mise à la corbeille d'un client. Refusée s'il reste une commande ouverte :
 * on ne doit pas perdre le contact d'une livraison en cours.
 */
export async function trashCustomerAction(formData: FormData) {
  const { employeeId } = await requireEmployee("customers.update");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) redirect("/clients?notice=invalid");
  let notice = "trashed";
  await getAdminDb().transaction(async (tx) => {
    const openOrders = await countOpenOrders(tx, parsed.data.id);
    if (openOrders > 0) {
      notice = "open-orders";
      return;
    }
    const [updated] = await tx.update(adminCustomers).set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(adminCustomers.id, parsed.data.id), isNull(adminCustomers.deletedAt)))
      .returning({ id: adminCustomers.id });
    if (!updated) {
      notice = "missing";
      return;
    }
    await tx.update(adminUsers).set({ status: "suspended", updatedAt: new Date() })
      .where(eq(adminUsers.id, (await tx.select({ userId: adminCustomers.userId }).from(adminCustomers).where(eq(adminCustomers.id, updated.id)).limit(1))[0].userId));
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "customer.trashed", entityType: "customer",
      entityId: updated.id, details: { openOrders },
    });
  });
  revalidateAll();
  redirect(`/clients?notice=${notice}`);
}

export async function restoreCustomerAction(formData: FormData) {
  const { employeeId } = await requireEmployee("customers.manage");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) redirect("/clients/corbeille?notice=invalid");
  let notice = "restored";
  await getAdminDb().transaction(async (tx) => {
    const [updated] = await tx.update(adminCustomers).set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(adminCustomers.id, parsed.data.id), sql`${adminCustomers.deletedAt} is not null`))
      .returning({ id: adminCustomers.id, userId: adminCustomers.userId });
    if (!updated) {
      notice = "missing";
      return;
    }
    await tx.update(adminUsers).set({ status: "active", updatedAt: new Date() }).where(eq(adminUsers.id, updated.userId));
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "customer.restored", entityType: "customer",
      entityId: updated.id, details: {},
    });
  });
  revalidateAll();
  redirect(`/clients/corbeille?notice=${notice}`);
}

/**
 * Droit à l'effacement : anonymisation définitive, jamais de suppression.
 * Les commandes, factures et paiements liés doivent rester intacts.
 */
export async function anonymizeCustomerAction(formData: FormData) {
  const { employeeId } = await requireEmployee("customers.manage");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) redirect("/clients/corbeille?notice=invalid");
  let notice = "anonymized";
  await getAdminDb().transaction(async (tx) => {
    const [customer] = await tx.select({ id: adminCustomers.id, userId: adminCustomers.userId, anonymizedAt: adminCustomers.anonymizedAt })
      .from(adminCustomers).where(eq(adminCustomers.id, parsed.data.id)).limit(1);
    if (!customer) {
      notice = "missing";
      return;
    }
    if (customer.anonymizedAt) {
      notice = "already-anonymized";
      return;
    }
    const openOrders = await countOpenOrders(tx, customer.id);
    if (openOrders > 0) {
      notice = "open-orders";
      return;
    }

    const identity = anonymizedIdentity(customer.id);
    await tx.update(adminUsers).set({
      name: identity.name,
      email: identity.email,
      phone: null,
      status: "suspended",
      anonymizedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(adminUsers.id, customer.userId));
    await tx.update(adminCustomers).set({
      companyName: null,
      taxNumber: null,
      internalNote: "",
      newsletterConsentAt: null,
      newsletterOptOutAt: new Date(),
      anonymizedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(adminCustomers.id, customer.id));
    // Les adresses sont neutralisées mais conservées : une facture doit rester justifiable.
    await tx.update(adminAddresses).set({
      label: "Adresse anonymisée",
      firstName: "Client",
      lastName: "Anonymisé",
      companyName: null,
      phone: "",
      line1: "—",
      line2: null,
      deliveryInstructions: null,
      isActive: false,
      isDefaultShipping: false,
      isDefaultBilling: false,
      deletedAt: new Date(),
    }).where(eq(adminAddresses.customerId, customer.id));
    await tx.insert(adminCustomerConsents).values({
      customerId: customer.id,
      purpose: "data_processing",
      granted: false,
      source: "admin",
      createdAt: new Date(),
    });
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "customer.anonymized", entityType: "customer",
      entityId: customer.id, details: { openOrders },
    });
  });
  revalidateAll();
  redirect(`/clients/corbeille?notice=${notice}`);
}

export async function saveAddressAction(formData: FormData) {
  const { employeeId } = await requireEmployee("customers.update");
  const id = String(formData.get("id") || "");
  const parsed = addressSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/clients/adresses?customer=${formData.get("customerId")}&notice=invalid`);
  const data = parsed.data;

  const validation = validateAddress({ ...data, isDefaultShipping: data.isDefaultShipping === "on", isDefaultBilling: data.isDefaultBilling === "on" });
  if (!validation.valid) {
    const fields = validation.issues.map((issue) => issue.field).join(",");
    redirect(`/clients/adresses?customer=${data.customerId}&notice=invalid&fields=${encodeURIComponent(fields)}`);
  }
  const address = validation.value;

  let notice = "saved";
  await getAdminDb().transaction(async (tx) => {
    const [customer] = await tx.select({ id: adminCustomers.id }).from(adminCustomers)
      .where(and(eq(adminCustomers.id, data.customerId), isNull(adminCustomers.deletedAt))).limit(1);
    if (!customer) {
      notice = "customer-missing";
      return;
    }

    // Doublon : même destinataire à la même adresse.
    const siblings = await tx.select({
      id: adminAddresses.id, firstName: adminAddresses.firstName, lastName: adminAddresses.lastName,
      line1: adminAddresses.line1, line2: adminAddresses.line2, city: adminAddresses.city,
      countryCode: adminAddresses.countryCode, phone: adminAddresses.phone,
    }).from(adminAddresses).where(and(eq(adminAddresses.customerId, data.customerId), isNull(adminAddresses.deletedAt)));
    const signature = addressSignature(address);
    const duplicate = siblings.find((sibling) => sibling.id !== id && addressSignature(sibling) === signature);
    if (duplicate) {
      notice = "duplicate";
      return;
    }

    const values = {
      label: address.label,
      firstName: address.firstName,
      lastName: address.lastName,
      companyName: address.companyName,
      phone: address.phone,
      phoneNormalized: normalizePhone(address.phone),
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      region: address.region,
      postalCode: address.postalCode,
      countryCode: address.countryCode,
      deliveryInstructions: data.deliveryInstructions || null,
      isDefaultShipping: address.isDefaultShipping,
      isDefaultBilling: address.isDefaultBilling,
      isActive: true,
      updatedAt: new Date(),
    };

    // Une seule adresse par défaut par usage : on retire l'ancienne avant de poser la nouvelle.
    if (values.isDefaultShipping) {
      await tx.update(adminAddresses).set({ isDefaultShipping: false, updatedAt: new Date() })
        .where(and(eq(adminAddresses.customerId, data.customerId), eq(adminAddresses.isDefaultShipping, true)));
    }
    if (values.isDefaultBilling) {
      await tx.update(adminAddresses).set({ isDefaultBilling: false, updatedAt: new Date() })
        .where(and(eq(adminAddresses.customerId, data.customerId), eq(adminAddresses.isDefaultBilling, true)));
    }

    if (id) {
      const [updated] = await tx.update(adminAddresses).set(values)
        .where(and(eq(adminAddresses.id, id), isNull(adminAddresses.deletedAt)))
        .returning({ id: adminAddresses.id });
      if (!updated) {
        notice = "missing";
        return;
      }
      await tx.insert(employeeAuditLogs).values({
        actorEmployeeId: employeeId, action: "customer_address.updated", entityType: "customer_address",
        entityId: id, details: { customerId: data.customerId, city: address.city, countryCode: address.countryCode },
      });
      return;
    }

    const [created] = await tx.insert(adminAddresses).values({ id: randomUUID(), customerId: data.customerId, ...values })
      .returning({ id: adminAddresses.id });
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "customer_address.created", entityType: "customer_address",
      entityId: created.id, details: { customerId: data.customerId, city: address.city, countryCode: address.countryCode },
    });
  });
  revalidateAll();
  redirect(`/clients/adresses?customer=${data.customerId}&notice=${notice}`);
}

export async function trashAddressAction(formData: FormData) {
  const { employeeId } = await requireEmployee("customers.update");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  const customerId = String(formData.get("customerId") || "");
  if (!parsed.success) redirect(`/clients/adresses?customer=${customerId}&notice=invalid`);
  let notice = "trashed";
  await getAdminDb().transaction(async (tx) => {
    const [updated] = await tx.update(adminAddresses)
      .set({ deletedAt: new Date(), isActive: false, isDefaultShipping: false, isDefaultBilling: false, updatedAt: new Date() })
      .where(and(eq(adminAddresses.id, parsed.data.id), isNull(adminAddresses.deletedAt)))
      .returning({ id: adminAddresses.id });
    if (!updated) {
      notice = "missing";
      return;
    }
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "customer_address.trashed", entityType: "customer_address",
      entityId: updated.id, details: { customerId },
    });
  });
  revalidateAll();
  redirect(`/clients/adresses?customer=${customerId}&notice=${notice}`);
}
