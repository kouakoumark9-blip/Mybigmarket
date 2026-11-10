-- Préparation de la base des tests de bout en bout (jamais en production) :
-- un produit de test commandable, dans la catégorie « Lits 2 places », pour tester le parcours d'achat.
INSERT INTO "products" ("seller_id","category_id","title","slug","short_description","description","price_xof","quantity","lead_time_days","availability","status","published_at","is_placeholder","internal_note")
SELECT (SELECT "id" FROM "users" WHERE "email"='boutique@mybigmarket.ci'),(SELECT "id" FROM "categories" WHERE "slug"='lits/lits-2-places'),
  'Lit 2 places en bois (produit de test)','lit-2-places-test-e2e','Lit double 140 x 190 cm en bois.','Lit 2 places en bois, produit utilisé uniquement par les tests automatiques.',95000,50,5,'in_stock_abidjan','approved',now(),false,'Produit de test, jamais en production'
WHERE NOT EXISTS (SELECT 1 FROM "products" WHERE "slug"='lit-2-places-test-e2e');
