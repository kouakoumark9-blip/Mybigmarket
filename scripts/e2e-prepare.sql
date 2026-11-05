-- Préparation de la base des tests de bout en bout (jamais en production) :
-- paiement Wave actif en Côte d'Ivoire, servi par le prestataire simulé (ALLOW_MOCK_PAYMENTS=true, sans clés réelles).
UPDATE payment_methods SET is_active = true WHERE code = 'wave';
UPDATE payment_country_rules SET is_allowed = true
WHERE country_code = 'CI' AND payment_method_id = (SELECT id FROM payment_methods WHERE code = 'wave');
