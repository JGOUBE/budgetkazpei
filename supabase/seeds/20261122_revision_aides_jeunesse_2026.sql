-- Revue de 9 fiches jeunesse/famille/sport sur sources officielles consultées 22/11/2026.
-- Les montants propres à un âge/stage ne deviennent pas un faux montant global.
BEGIN;
UPDATE public.aides_reunion
SET description_fr = CASE
 WHEN id IN (29,41) THEN 'Pass Sport : réduction immédiate sur une inscription dans une structure sportive partenaire pour les jeunes éligibles selon la campagne, le quotient familial et/ou les critères sociaux et de handicap. Les tranches d âge ne sont pas à elles seules une preuve d éligibilité.'
 WHEN id IN (30,42) THEN 'Pass Culture 2026 : dès 15-16 ans, accès aux offres culturelles gratuites ; crédit personnel de 50 EUR à 17 ans et 150 EUR à 18 ans, avec éventuel complément de 50 EUR à 18 ans sous critères. Crédit non convertible en espèces et utilisable selon les délais du dispositif.'
 WHEN id=44 THEN 'Aide CAF de La Réunion au BAFA et au BAFD : une partie de la formation peut être financée. Page CAF : BAFA jusqu à 100 EUR pour le stage général, 300 EUR pour approfondissement en externat et 400 EUR en internat, selon stage et conditions. Ces plafonds ne sont pas cumulables automatiquement.'
 WHEN id=76 THEN 'Plan 5 000 licences : aide du Département de La Réunion pour la licence et cotisation en club jusqu à 100 EUR, destinée selon la fiche officielle notamment aux jeunes de moins de 21 ans dont les parents bénéficient du RSA. Cumul possible avec des dispositifs similaires ; vérifier l ouverture de la campagne.'
 WHEN id=38 THEN 'VACAF et aides aux vacances : selon situation et campagne CAF de La Réunion, un financement partiel peut exister pour les familles. Vérifier la notification CAF et les centres ou séjours partenaires ; aucune aide automatique ni montant forfaitaire promis.'
 WHEN id=40 THEN 'Pass Colo : aide à certains séjours en colonie pour familles et enfants répondant aux règles du dispositif. À La Réunion, la CAF mentionne notamment les familles avec un enfant âgé de 11 ans. Confirmer la campagne et les conditions CAF.'
 WHEN id=62 THEN 'Aides au temps libre de la CAF de La Réunion : sous conditions, séjours des familles et enfants auprès des centres partenaires. La page CAF indique un financement pouvant aller jusqu à 80 % de la facture pour des séjours de 3 à 10 nuits par an ; montant restant et droits à vérifier.'
 ELSE description_fr END,
 description = CASE
 WHEN id IN (29,41) THEN 'Pass Sport : réduction sur inscription en club partenaire sous conditions de la campagne.'
 WHEN id IN (30,42) THEN 'Pass Culture : offres gratuites à 15-16 ans ; crédits individuels à 17 et 18 ans, sous les règles en vigueur.'
 WHEN id=44 THEN 'BAFA/BAFD : aide CAF de La Réunion variable selon stage et conditions.'
 WHEN id=76 THEN 'Plan 5 000 licences du Département : aide jusqu à 100 EUR selon critères et campagne.'
 WHEN id=38 THEN 'VACAF : aides aux vacances selon les droits notifiés par la CAF et ses partenaires.'
 WHEN id=40 THEN 'Pass Colo : réduction sur séjour en colonie selon âge et situation du foyer.'
 WHEN id=62 THEN 'Aide CAF de La Réunion pour certains séjours en centres de vacances partenaires.'
 ELSE description END,
 type_dispositif = CASE
  WHEN id IN (29,41,38,40,62,76) THEN 'reduction_tarifaire'
  WHEN id IN (30,42) THEN 'credit_culturel'
  WHEN id=44 THEN 'aide_financiere' ELSE type_dispositif END,
 age_min = CASE WHEN id IN (30,42) THEN 15 WHEN id IN (29,41) THEN 6 WHEN id=44 THEN 16 ELSE age_min END,
 age_max = CASE WHEN id IN (30,42) THEN 20 WHEN id IN (29,41) THEN 30 WHEN id=76 THEN 20 ELSE age_max END,
 statut_verification='source_confirmee',
 date_verification=DATE '2026-11-22',
 source_verification = CASE
 WHEN id IN (29,41) THEN 'https://www.pass.sports.gouv.fr/v2/une-question'
 WHEN id IN (30,42) THEN 'https://pass.culture.fr/cgu-utilisateurs'
 WHEN id=44 THEN 'https://www.caf.fr/allocataires/caf-de-la-reunion/offre-de-service/vie-professionnelle/le-bafa-ou-le-bafd-vous-tente-votre-caf-peut-vous-aider'
 WHEN id=76 THEN 'https://www.departement974.fr/aide/aide-plan-5000-licences'
 WHEN id=38 THEN 'https://www.caf.fr/allocataires/caf-de-la-reunion/offre-de-service/vie-personnelle/preparez-vos-vacances-avec-les-aides-au-temps-libre'
 WHEN id=40 THEN 'https://www.caf.fr/allocataires/caf-de-la-reunion/offre-de-service/vie-personnelle'
 WHEN id=62 THEN 'https://www.caf.fr/allocataires/caf-de-la-reunion/offre-de-service/vie-personnelle/preparez-vos-vacances-avec-les-aides-au-temps-libre'
 ELSE source_verification END,
 periode_validite = CASE
 WHEN id IN (29,41) THEN 'Principes campagne Pass Sport 2026-2027 ; critères et dates de validité à vérifier avant inscription'
 WHEN id IN (30,42) THEN 'Crédits du Pass Culture et conditions consultés en novembre 2026 ; pas de versement en espèces'
 WHEN id=44 THEN 'Barème BAFA/BAFD présenté sur la page CAF Réunion consultée en novembre 2026 ; confirmation auprès CAF nécessaire'
 WHEN id=76 THEN 'Page Département consultée en novembre 2026 ; validité de la campagne du club à confirmer'
 WHEN id=38 THEN 'Aides vacances sous campagne annuelle CAF ; droits à confirmer dans espace CAF'
 WHEN id=40 THEN 'Pass Colo 2026 ; conditions et période à confirmer auprès CAF'
 WHEN id=62 THEN 'Aides temps libre CAF Réunion, page consultée novembre 2026 ; organisme et dates à vérifier'
 ELSE periode_validite END,
 lien_officiel = CASE
 WHEN id IN (29,41) THEN 'https://www.pass.sports.gouv.fr/v2/accueil'
 WHEN id IN (30,42) THEN 'https://pass.culture.fr/'
 WHEN id IN (44,76,38,40,62) THEN lien_officiel
 ELSE lien_officiel END
WHERE id IN (29,41,30,42,44,76,38,40,62);
COMMIT;