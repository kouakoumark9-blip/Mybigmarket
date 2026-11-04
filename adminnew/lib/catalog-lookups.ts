/** Listes de choix des formulaires du catalogue (API v1, et base pour vendeurs et groupes de clients). */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getAdminDb } from "@/lib/db";
import { adminCustomerGroups, adminUsers } from "@/lib/db/schema";
import { adminApi, adminApiList } from "@/lib/admin-api";
import { flattenCategories, type AttributeGroup, type Brand, type CategoryNode, type TaxGroup, type Warehouse } from "@/lib/api-types";

export async function categoryOptions() {
  return flattenCategories(await adminApi<CategoryNode[]>("GET", "/admin/categories/tree"));
}

export async function brandOptions() {
  return (await adminApiList<Brand>("/admin/brands", { limit: 200 })).data;
}

export async function taxGroupOptions() {
  return adminApi<TaxGroup[]>("GET", "/admin/tax-rule-groups");
}

export async function attributeGroupOptions() {
  return adminApi<AttributeGroup[]>("GET", "/admin/attribute-groups");
}

export async function warehouseOptions() {
  return adminApi<Warehouse[]>("GET", "/admin/warehouses");
}

/** Vendeurs actifs (comptes boutique au rôle vendeur ou administrateur). */
export async function sellerOptions() {
  return getAdminDb().select({ id: adminUsers.id, name: adminUsers.name, email: adminUsers.email })
    .from(adminUsers).where(and(inArray(adminUsers.role, ["seller", "admin"]), eq(adminUsers.status, "active"))).orderBy(asc(adminUsers.name)).limit(500);
}

export async function customerGroupOptions() {
  return getAdminDb().select({ id: adminCustomerGroups.id, name: adminCustomerGroups.name }).from(adminCustomerGroups)
    .where(and(eq(adminCustomerGroups.isActive, true), isNull(adminCustomerGroups.deletedAt))).orderBy(asc(adminCustomerGroups.sortOrder), asc(adminCustomerGroups.name));
}
