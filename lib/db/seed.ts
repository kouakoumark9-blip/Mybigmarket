import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { hashPassword } from "@/server/core/auth/password";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { categories as categoryRows, sellerProfiles, users, products, pickupPoints } from "@/lib/db/schema";
import { categories as demoCategories, getProductDescription, products as demoProducts, sellers as demoSellers } from "@/lib/demo-data";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") throw new Error("Le seed démo est bloqué en production. ALLOW_DEMO_SEED=true pour l’autoriser explicitement.");
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password || password.length < 10) throw new Error("Définissez SEED_DEMO_PASSWORD avec au moins 10 caractères dans votre environnement local.");
  const db = getDb();
  const passwordHash = await hashPassword(password);
  const now = new Date();

  await db.insert(categoryRows).values(demoCategories.map((item, index) => ({ name: item.name, slug: item.slug, sortOrder: index, isActive: true }))).onConflictDoUpdate({ target: categoryRows.slug, set: { isActive: true } });
  const categoryMap = new Map((await db.select().from(categoryRows)).map((item) => [item.slug, item.id]));

  const admin = { name: "Administration mybigmarket", email: "admin@mybigmarket.example", role: "admin" as const };
  await db.insert(users).values({ ...admin, passwordHash }).onConflictDoUpdate({ target: users.email, set: { name: admin.name, role: "admin", status: "active", passwordHash, updatedAt: now } });
  const sellerIds = new Map<string, string>();
  for (const seller of demoSellers) {
    const email = `${seller.slug}@demo.mybigmarket.example`;
    await db.insert(users).values({ name: seller.name, email, passwordHash, role: "seller", status: "active" }).onConflictDoUpdate({ target: users.email, set: { name: seller.name, role: "seller", status: "active", passwordHash, updatedAt: now } });
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) throw new Error(`Seed user missing: ${email}`);
    sellerIds.set(seller.slug, user.id);
    await db.insert(sellerProfiles).values({ userId: user.id, university: seller.university, cityChina: seller.city, verificationStatus: "approved", ratingAvg: seller.rating.toFixed(2), ratingCount: seller.orders, updatedAt: now }).onConflictDoUpdate({ target: sellerProfiles.userId, set: { university: seller.university, cityChina: seller.city, verificationStatus: "approved", ratingAvg: seller.rating.toFixed(2), ratingCount: seller.orders, updatedAt: now } });
  }

  for (const [index, item] of demoProducts.entries()) {
    const sellerId = sellerIds.get(item.sellerSlug);
    const categoryId = categoryMap.get(item.categorySlug);
    if (!sellerId || !categoryId) throw new Error(`Missing seller or category for ${item.slug}`);
    const description = getProductDescription(item);
    await db.insert(products).values({ sellerId, categoryId, title: item.title, slug: item.slug, description, priceXof: item.priceXof, quantity: item.quantity, minimumQuantity: item.minimumQuantity, leadTimeDays: item.leadTimeDays, status: "approved", isFeatured: index < 8, updatedAt: now }).onConflictDoUpdate({ target: products.slug, set: { sellerId, categoryId, title: item.title, description, priceXof: item.priceXof, quantity: item.quantity, minimumQuantity: item.minimumQuantity, leadTimeDays: item.leadTimeDays, status: "approved", isFeatured: index < 8, updatedAt: now } });
  }

  await db.insert(pickupPoints).values([
    { name: "Point mybigmarket Plateau (démo)", city: "Abidjan", address: "Plateau, Abidjan", phone: null, openingHours: "À confirmer", isActive: true },
    { name: "Point mybigmarket Cocody (démo)", city: "Abidjan", address: "Cocody, Abidjan", phone: null, openingHours: "À confirmer", isActive: true },
  ]).onConflictDoNothing();
  console.log("Seed terminé : 1 admin, 3 vendeurs vérifiés, 3 catégories, 20 produits, 2 points relais de démonstration.");
  console.log("Comptes de test : admin@mybigmarket.example et seller-slug@demo.mybigmarket.example. Même mot de passe de démonstration pour tous; changez-le immédiatement.");
}

main().catch((error) => { console.error(error); process.exit(1); });
