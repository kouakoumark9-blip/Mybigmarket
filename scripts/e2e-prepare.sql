-- Préparation de la base des tests de bout en bout (jamais en production) :
-- une des fiches fictives devient commandable pour tester le parcours d'achat.
UPDATE products SET is_placeholder = false WHERE slug = 'friteuse-a-air-4-5-l-fictif';
