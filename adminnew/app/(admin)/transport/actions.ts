"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminDb } from "@/lib/db";
import {
  adminShippingDiscountTiers,
  adminShippingMethods,
  adminShippingRates,
  adminShippingZones,
  employeeAuditLogs,
} from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";

/**
 * Transport — module 4.
 *
 * Règles verrouillées ici :
 *  - aucune suppression physique : `deleted_at` (corbeille) sur méthodes,
 *    zones et tranches, restauration et archivage explicites ;
 *  - une tranche dont les bornes se chevauchent est refusée : le moteur de
 *    devis ne doit jamais avoir à arbitrer deux tarifs concurrents ;
 *  - passer une méthode en « tarifs réels » alors que ses tranches sont encore
 *    marquées « exemple » est refusé (sinon on facturerait des tarifs fictifs) ;
 *  - toute écriture est auditée dans la même transaction.
 */

const revalidateAll = () => {
  revalidatePath("/transport");
  revalidatePath("/transport/methodes");
  revalidatePath("/transport/zones");
  revalidatePath("/transport/tarifs");
  revalidatePath("/transport/paliers");
  revalidatePath("/transport/simulateur");
};

const units = z.coerce.number().min(0).max(1_000_000);
const optionalUnits = z.union([z.literal(""), z.coerce.number().min(0).max(1_000_000)]).transform((value) => (value === "" ? null : value));

const methodSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9_-]{2,30}$/),
  name: z.string().trim().min(2).max(120),
  mode: z.enum(["air", "sea"]),
  billableBasis: z.enum(["weight", "volume", "both"]),
  volumetricDivisor: z.coerce.number().int().min(1000).max(20000),
  minimumBillableWeightKg: z.coerce.number().min(0).max(1000),
  seaMinimumVolumeM3: z.coerce.number().min(0).max(1000),
  minimumChargeXof: z.coerce.number().int().min(0).max(100_000_000),
  insurancePercent: z.coerce.number().min(0).max(100),
  customsHandlingXof: z.coerce.number().int().min(0).max(100_000_000),
  fragileSurchargeXof: z.coerce.number().int().min(0).max(100_000_000),
  freeAboveXof: z.coerce.number().int().min(0).max(1_000_000_000),
  freeAboveWeightGrams: z.coerce.number().int().min(0).max(10_000_000),
  outOfRangeBehavior: z.enum(["disable", "use_highest"]),
  maxPackageWeightGrams: z.coerce.number().int().min(0).max(1_000_000),
  maxPackageLengthCm: z.coerce.number().int().min(0).max(2000),
  transitDaysMin: z.coerce.number().int().min(0).max(365),
  transitDaysMax: z.coerce.number().int().min(0).max(365),
  deliveryTimeLabel: z.string().trim().max(120).optional(),
});

const zoneSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9_]{2,40}$/),
  name: z.string().trim().min(2).max(120),
  countryCodes: z.string().trim().max(400),
  regionCodes: z.string().trim().max(600).optional(),
  cityNames: z.string().trim().max(600).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  notes: z.string().trim().max(500).optional(),
});

const rateSchema = z.object({
  methodId: z.string().uuid(),
  zoneId: z.string().uuid(),
  minimumBillableUnits: units,
  maximumBillableUnits: optionalUnits,
  rateXofPerUnit: z.coerce.number().int().min(0).max(100_000_000),
  minimumChargeXof: z.coerce.number().int().min(0).max(100_000_000),
  handlingFeeXof: z.coerce.number().int().min(0).max(100_000_000),
  customsFeeXof: z.coerce.number().int().min(0).max(100_000_000),
  transitDaysMin: optionalUnits,
  transitDaysMax: optionalUnits,
  label: z.string().trim().max(120).optional(),
});

const tierSchema = z.object({
  methodId: z.string().uuid(),
  zoneId: z.union([z.literal(""), z.string().uuid()]).optional(),
  minimumBillableUnits: units,
  discountPercent: z.coerce.number().min(0).max(100),
  label: z.string().trim().max(120).optional(),
});

const idSchema = z.object({ id: z.string().uuid() });

const splitList = (value: string | undefined, transform: (item: string) => string) =>
  (value || "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map(transform)
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 200);

export async function saveMethodAction(formData: FormData) {
  const { employeeId } = await requireEmployee("shipping.manage");
  const id = String(formData.get("id") || "");
  const parsed = methodSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/transport/methodes${id ? `?edit=${id}&` : "?"}notice=invalid`);
  if (parsed.data.transitDaysMax < parsed.data.transitDaysMin) redirect(`/transport/methodes?notice=transit-order`);

  const data = parsed.data;
  let notice = "saved";
  await getAdminDb().transaction(async (tx) => {
    const values = {
      code: data.code,
      name: data.name,
      mode: data.mode,
      billableBasis: data.billableBasis,
      volumetricDivisor: data.volumetricDivisor,
      minimumBillableWeightKg: String(data.minimumBillableWeightKg),
      seaMinimumVolumeM3: String(data.seaMinimumVolumeM3),
      minimumChargeXof: data.minimumChargeXof,
      insurancePercent: String(data.insurancePercent),
      customsHandlingXof: data.customsHandlingXof,
      fragileSurchargeXof: data.fragileSurchargeXof,
      freeAboveXof: data.freeAboveXof,
      freeAboveWeightGrams: data.freeAboveWeightGrams,
      outOfRangeBehavior: data.outOfRangeBehavior,
      maxPackageWeightGrams: data.maxPackageWeightGrams,
      maxPackageLengthCm: data.maxPackageLengthCm,
      transitDaysMin: data.transitDaysMin,
      transitDaysMax: data.transitDaysMax,
      deliveryTimeLabel: data.deliveryTimeLabel || `${data.transitDaysMin}–${data.transitDaysMax} jours`,
    };

    if (id) {
      const [updated] = await tx.update(adminShippingMethods).set(values)
        .where(and(eq(adminShippingMethods.id, id), isNull(adminShippingMethods.deletedAt)))
        .returning({ id: adminShippingMethods.id });
      if (!updated) {
        notice = "missing";
        return;
      }
      await tx.insert(employeeAuditLogs).values({
        actorEmployeeId: employeeId, action: "shipping.method.updated", entityType: "shipping_method",
        entityId: id, details: { code: data.code, name: data.name, mode: data.mode },
      });
      return;
    }

    const [created] = await tx.insert(adminShippingMethods).values({ id: randomUUID(), ...values, isActive: false, sampleRatesOnly: true })
      .onConflictDoNothing().returning({ id: adminShippingMethods.id });
    if (!created) {
      notice = "duplicate-code";
      return;
    }
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "shipping.method.created", entityType: "shipping_method",
      entityId: created.id, details: { code: data.code, name: data.name, mode: data.mode, active: false },
    });
  });
  revalidateAll();
  redirect(`/transport/methodes?notice=${notice}`);
}

/**
 * Activation d'une méthode. Refus si la grille est incomplète ou encore
 * constituée de tarifs d'exemple : on ne met jamais en vente un barème fictif.
 */
export async function toggleMethodAction(formData: FormData) {
  const { employeeId } = await requireEmployee("shipping.manage");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) redirect("/transport/methodes?notice=invalid");

  let notice = "toggled";
  await getAdminDb().transaction(async (tx) => {
    const [method] = await tx.select({ id: adminShippingMethods.id, name: adminShippingMethods.name, isActive: adminShippingMethods.isActive })
      .from(adminShippingMethods)
      .where(and(eq(adminShippingMethods.id, parsed.data.id), isNull(adminShippingMethods.deletedAt))).limit(1);
    if (!method) {
      notice = "missing";
      return;
    }

    if (!method.isActive) {
      const [counts] = await tx.select({
        rates: sql<number>`count(*) filter (where ${adminShippingRates.sampleOnly} = false)`,
        samples: sql<number>`count(*) filter (where ${adminShippingRates.sampleOnly} = true)`,
      }).from(adminShippingRates).where(and(eq(adminShippingRates.shippingMethodId, method.id), isNull(adminShippingRates.deletedAt), eq(adminShippingRates.isActive, true)));
      const realRates = Number(counts?.rates || 0);
      const sampleRates = Number(counts?.samples || 0);
      if (realRates === 0) {
        notice = sampleRates > 0 ? "needs-real-rates" : "needs-rates";
        return;
      }
    }

    await tx.update(adminShippingMethods).set({
      isActive: !method.isActive,
      sampleRatesOnly: !method.isActive ? false : true,
      updatedAt: new Date(),
    }).where(eq(adminShippingMethods.id, method.id));
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId,
      action: method.isActive ? "shipping.method.disabled" : "shipping.method.enabled",
      entityType: "shipping_method", entityId: method.id,
      details: { name: method.name, active: !method.isActive },
    });
  });
  revalidateAll();
  redirect(`/transport/methodes?notice=${notice}`);
}

export async function trashMethodAction(formData: FormData) {
  const { employeeId } = await requireEmployee("shipping.manage");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) redirect("/transport/methodes?notice=invalid");
  let notice = "trashed";
  await getAdminDb().transaction(async (tx) => {
    const [updated] = await tx.update(adminShippingMethods)
      .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
      .where(and(eq(adminShippingMethods.id, parsed.data.id), isNull(adminShippingMethods.deletedAt)))
      .returning({ id: adminShippingMethods.id, name: adminShippingMethods.name });
    if (!updated) {
      notice = "missing";
      return;
    }
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "shipping.method.trashed", entityType: "shipping_method",
      entityId: updated.id, details: { name: updated.name },
    });
  });
  revalidateAll();
  redirect(`/transport/methodes?notice=${notice}`);
}

export async function restoreMethodAction(formData: FormData) {
  const { employeeId } = await requireEmployee("shipping.manage");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) redirect("/transport/corbeille?notice=invalid");
  let notice = "restored";
  await getAdminDb().transaction(async (tx) => {
    // Restauration toujours désactivée : il faut réactiver explicitement après vérification.
    const [updated] = await tx.update(adminShippingMethods)
      .set({ deletedAt: null, isActive: false, updatedAt: new Date() })
      .where(and(eq(adminShippingMethods.id, parsed.data.id), sql`${adminShippingMethods.deletedAt} is not null`))
      .returning({ id: adminShippingMethods.id, name: adminShippingMethods.name });
    if (!updated) {
      notice = "missing";
      return;
    }
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "shipping.method.restored", entityType: "shipping_method",
      entityId: updated.id, details: { name: updated.name, active: false },
    });
  });
  revalidateAll();
  redirect(`/transport/corbeille?notice=${notice}`);
}

export async function saveZoneAction(formData: FormData) {
  const { employeeId } = await requireEmployee("shipping.manage");
  const id = String(formData.get("id") || "");
  const parsed = zoneSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/transport/zones${id ? `?edit=${id}&` : "?"}notice=invalid`);
  const countryCodes = splitList(parsed.data.countryCodes, (item) => item.toUpperCase());
  if (!countryCodes.length) redirect("/transport/zones?notice=needs-country");

  const values = {
    code: parsed.data.code,
    name: parsed.data.name,
    countryCodes,
    regionCodes: splitList(parsed.data.regionCodes, (item) => item.toUpperCase()),
    cityNames: splitList(parsed.data.cityNames, (item) => item),
    sortOrder: parsed.data.sortOrder,
    notes: parsed.data.notes || "",
  };

  let notice = "saved";
  await getAdminDb().transaction(async (tx) => {
    if (id) {
      const [updated] = await tx.update(adminShippingZones).set(values)
        .where(and(eq(adminShippingZones.id, id), isNull(adminShippingZones.deletedAt)))
        .returning({ id: adminShippingZones.id });
      if (!updated) {
        notice = "missing";
        return;
      }
      await tx.insert(employeeAuditLogs).values({
        actorEmployeeId: employeeId, action: "shipping.zone.updated", entityType: "shipping_zone",
        entityId: id, details: { code: values.code, name: values.name, countryCodes },
      });
      return;
    }
    const [created] = await tx.insert(adminShippingZones).values({ id: randomUUID(), ...values, isActive: true })
      .onConflictDoNothing().returning({ id: adminShippingZones.id });
    if (!created) {
      notice = "duplicate-code";
      return;
    }
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "shipping.zone.created", entityType: "shipping_zone",
      entityId: created.id, details: { code: values.code, name: values.name, countryCodes },
    });
  });
  revalidateAll();
  redirect(`/transport/zones?notice=${notice}`);
}

export async function toggleZoneAction(formData: FormData) {
  const { employeeId } = await requireEmployee("shipping.manage");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) redirect("/transport/zones?notice=invalid");
  let notice = "toggled";
  await getAdminDb().transaction(async (tx) => {
    const [zone] = await tx.select({ id: adminShippingZones.id, name: adminShippingZones.name, isActive: adminShippingZones.isActive })
      .from(adminShippingZones)
      .where(and(eq(adminShippingZones.id, parsed.data.id), isNull(adminShippingZones.deletedAt))).limit(1);
    if (!zone) {
      notice = "missing";
      return;
    }
    await tx.update(adminShippingZones).set({ isActive: !zone.isActive }).where(eq(adminShippingZones.id, zone.id));
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId,
      action: zone.isActive ? "shipping.zone.disabled" : "shipping.zone.enabled",
      entityType: "shipping_zone", entityId: zone.id, details: { name: zone.name, active: !zone.isActive },
    });
  });
  revalidateAll();
  redirect(`/transport/zones?notice=${notice}`);
}

export async function setDefaultZoneAction(formData: FormData) {
  const { employeeId } = await requireEmployee("shipping.manage");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) redirect("/transport/zones?notice=invalid");
  let notice = "default";
  await getAdminDb().transaction(async (tx) => {
    // Une seule zone par défaut : on remet tout à zéro avant de désigner.
    await tx.update(adminShippingZones).set({ isDefault: false }).where(eq(adminShippingZones.isDefault, true));
    const [updated] = await tx.update(adminShippingZones).set({ isDefault: true })
      .where(and(eq(adminShippingZones.id, parsed.data.id), isNull(adminShippingZones.deletedAt)))
      .returning({ id: adminShippingZones.id, name: adminShippingZones.name });
    if (!updated) {
      notice = "missing";
      return;
    }
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "shipping.zone.set_default", entityType: "shipping_zone",
      entityId: updated.id, details: { name: updated.name },
    });
  });
  revalidateAll();
  redirect(`/transport/zones?notice=${notice}`);
}

export async function trashZoneAction(formData: FormData) {
  const { employeeId } = await requireEmployee("shipping.manage");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) redirect("/transport/zones?notice=invalid");
  let notice = "trashed";
  await getAdminDb().transaction(async (tx) => {
    const [updated] = await tx.update(adminShippingZones)
      .set({ deletedAt: new Date(), isActive: false, isDefault: false })
      .where(and(eq(adminShippingZones.id, parsed.data.id), isNull(adminShippingZones.deletedAt)))
      .returning({ id: adminShippingZones.id, name: adminShippingZones.name });
    if (!updated) {
      notice = "missing";
      return;
    }
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "shipping.zone.trashed", entityType: "shipping_zone",
      entityId: updated.id, details: { name: updated.name },
    });
  });
  revalidateAll();
  redirect(`/transport/zones?notice=${notice}`);
}

/** Détecte un chevauchement avec une autre tranche active du même couple méthode/zone. */
async function findOverlap(
  tx: Parameters<Parameters<ReturnType<typeof getAdminDb>["transaction"]>[0]>[0],
  methodId: string,
  zoneId: string,
  minimum: number,
  maximum: number | null,
  excludeId?: string,
): Promise<boolean> {
  const rows = await tx.select({
    id: adminShippingRates.id,
    minimum: adminShippingRates.minimumBillableUnits,
    maximum: adminShippingRates.maximumBillableUnits,
  }).from(adminShippingRates)
    .where(and(eq(adminShippingRates.shippingMethodId, methodId), eq(adminShippingRates.shippingZoneId, zoneId), isNull(adminShippingRates.deletedAt)));
  const high = (value: number) => maximum === null || maximum >= value;
  return rows.some((row) => {
    if (excludeId && row.id === excludeId) return false;
    const otherMin = Number(row.minimum);
    const otherMax = row.maximum === null || row.maximum === undefined ? null : Number(row.maximum);
    const otherHigh = otherMax === null || otherMax >= minimum;
    return high(otherMin) && otherHigh;
  });
}

export async function saveRateAction(formData: FormData) {
  const { employeeId } = await requireEmployee("shipping.manage");
  const id = String(formData.get("id") || "");
  const parsed = rateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/transport/tarifs?notice=invalid");
  const data = parsed.data;
  if (data.maximumBillableUnits !== null && data.maximumBillableUnits < data.minimumBillableUnits) {
    redirect("/transport/tarifs?notice=bad-range");
  }
  if (data.transitDaysMin !== null && data.transitDaysMax !== null && data.transitDaysMax < data.transitDaysMin) {
    redirect("/transport/tarifs?notice=bad-transit");
  }

  let notice = "saved";
  await getAdminDb().transaction(async (tx) => {
    const overlap = await findOverlap(tx, data.methodId, data.zoneId, data.minimumBillableUnits, data.maximumBillableUnits, id || undefined);
    if (overlap) {
      notice = "overlap";
      return;
    }
    const values = {
      shippingMethodId: data.methodId,
      shippingZoneId: data.zoneId,
      minimumBillableUnits: String(data.minimumBillableUnits),
      maximumBillableUnits: data.maximumBillableUnits === null ? null : String(data.maximumBillableUnits),
      rateXofPerUnit: data.rateXofPerUnit,
      minimumChargeXof: data.minimumChargeXof,
      handlingFeeXof: data.handlingFeeXof,
      customsFeeXof: data.customsFeeXof,
      transitDaysMin: data.transitDaysMin === null ? null : Math.round(data.transitDaysMin),
      transitDaysMax: data.transitDaysMax === null ? null : Math.round(data.transitDaysMax),
      label: data.label || "",
      // Une tranche saisie à la main est une tranche réelle, pas un exemple.
      sampleOnly: false,
      isActive: true,
      updatedAt: new Date(),
    };
    if (id) {
      const [updated] = await tx.update(adminShippingRates).set(values)
        .where(and(eq(adminShippingRates.id, id), isNull(adminShippingRates.deletedAt)))
        .returning({ id: adminShippingRates.id });
      if (!updated) {
        notice = "missing";
        return;
      }
      await tx.insert(employeeAuditLogs).values({
        actorEmployeeId: employeeId, action: "shipping.rate.updated", entityType: "shipping_rate",
        entityId: id, details: { methodId: data.methodId, zoneId: data.zoneId, minimum: data.minimumBillableUnits, maximum: data.maximumBillableUnits, rate: data.rateXofPerUnit },
      });
      return;
    }
    const [created] = await tx.insert(adminShippingRates).values({ id: randomUUID(), ...values }).returning({ id: adminShippingRates.id });
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "shipping.rate.created", entityType: "shipping_rate",
      entityId: created.id, details: { methodId: data.methodId, zoneId: data.zoneId, minimum: data.minimumBillableUnits, maximum: data.maximumBillableUnits, rate: data.rateXofPerUnit },
    });
  });
  revalidateAll();
  redirect(`/transport/tarifs?notice=${notice}`);
}

export async function trashRateAction(formData: FormData) {
  const { employeeId } = await requireEmployee("shipping.manage");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) redirect("/transport/tarifs?notice=invalid");
  let notice = "trashed";
  await getAdminDb().transaction(async (tx) => {
    const [updated] = await tx.update(adminShippingRates)
      .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
      .where(and(eq(adminShippingRates.id, parsed.data.id), isNull(adminShippingRates.deletedAt)))
      .returning({ id: adminShippingRates.id });
    if (!updated) {
      notice = "missing";
      return;
    }
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "shipping.rate.trashed", entityType: "shipping_rate",
      entityId: updated.id, details: {},
    });
  });
  revalidateAll();
  redirect(`/transport/tarifs?notice=${notice}`);
}

export async function saveTierAction(formData: FormData) {
  const { employeeId } = await requireEmployee("shipping.manage");
  const id = String(formData.get("id") || "");
  const parsed = tierSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/transport/paliers?notice=invalid");
  const data = parsed.data;

  let notice = "saved";
  await getAdminDb().transaction(async (tx) => {
    const values = {
      shippingMethodId: data.methodId,
      shippingZoneId: data.zoneId ? data.zoneId : null,
      minimumBillableUnits: String(data.minimumBillableUnits),
      discountPercent: String(data.discountPercent),
      label: data.label || `${data.discountPercent} % dès ${data.minimumBillableUnits}`,
      isActive: true,
    };
    if (id) {
      const [updated] = await tx.update(adminShippingDiscountTiers).set(values)
        .where(eq(adminShippingDiscountTiers.id, id)).returning({ id: adminShippingDiscountTiers.id });
      if (!updated) {
        notice = "missing";
        return;
      }
      await tx.insert(employeeAuditLogs).values({
        actorEmployeeId: employeeId, action: "shipping.tier.updated", entityType: "shipping_discount_tier",
        entityId: id, details: { ...values },
      });
      return;
    }
    const [created] = await tx.insert(adminShippingDiscountTiers).values({ id: randomUUID(), ...values }).returning({ id: adminShippingDiscountTiers.id });
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "shipping.tier.created", entityType: "shipping_discount_tier",
      entityId: created.id, details: { ...values },
    });
  });
  revalidateAll();
  redirect(`/transport/paliers?notice=${notice}`);
}

export async function deleteTierAction(formData: FormData) {
  const { employeeId } = await requireEmployee("shipping.manage");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) redirect("/transport/paliers?notice=invalid");
  let notice = "deleted";
  await getAdminDb().transaction(async (tx) => {
    // Les paliers n'ont pas de corbeille : ils ne portent aucun historique
    // commercial, contrairement aux méthodes, zones et tranches.
    const [deleted] = await tx.delete(adminShippingDiscountTiers)
      .where(eq(adminShippingDiscountTiers.id, parsed.data.id))
      .returning({ id: adminShippingDiscountTiers.id });
    if (!deleted) {
      notice = "missing";
      return;
    }
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "shipping.tier.deleted", entityType: "shipping_discount_tier",
      entityId: deleted.id, details: {},
    });
  });
  revalidateAll();
  redirect(`/transport/paliers?notice=${notice}`);
}
