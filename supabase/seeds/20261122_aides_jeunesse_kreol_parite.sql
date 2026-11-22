-- 2026-11-22 : alignement FR / créole réunionnais des fiches révisées.
BEGIN;
UPDATE public.aides_reunion
SET description_kreol = CASE
 WHEN id IN (29,41) THEN 'Pass Sport i rédui frais inscription dann club ou structure partenaire. Fodré vérifi bann conditions campagne, âge, quotient familial ou handicap. Pa in versement larzan direct.'
 WHEN id IN (30,42) THEN 'Pass Culture 2026 : à 15-16 an, bann offres gratuites. À 17 an, in crédit 50 EUR ; à 18 an, 150 EUR, parfois in bonus 50 EUR selon conditions. Krédi la pa échangeab kont larzan.'
 WHEN id=44 THEN 'CAF La Rényon i pé finans in parti formation BAFA/BAFD. Selon étape BAFA : 100 EUR stage général, 300 EUR approfondissement externat, 400 EUR internat au maximum, sous conditions. Pa automatique.'
 WHEN id=76 THEN 'Plan 5 000 licences Département i pé finance inscription club ziska 100 EUR pou marmay moins de 21 an si bann conditions, notamment parents RSA, lé remplies. Vérifi campagne.'
 WHEN id=38 THEN 'CAF i pé propose bann aides vacances selon out dossier ek campagne. Vérifi dann out espace CAF, pa d aide automatique.'
 WHEN id=40 THEN 'Pass Colo lé in aide pou in séjour colonie, selon laz marmay ek situation famiy. Vérifi conditions CAF La Rényon.'
 WHEN id=62 THEN 'CAF La Rényon i pé aide finance bann séjours vacances famille sous conditions, parfois jusqu à 80 pour cent facture selon centre et durée. Vérifi out droits.'
 ELSE description_kreol END,
 demarches_fr = CASE
 WHEN id IN (29,41) THEN 'Consulter la campagne et la FAQ officielles Pass Sport 2026-2027, vérifier le code éventuel, les conditions personnelles et que le club est partenaire avant inscription.'
 WHEN id=44 THEN 'Consulter la page BAFA/BAFD de la CAF de La Réunion, choisir le stage concerné et préparer la demande selon les pièces exigées. Vérifier le barème de la session.'
 WHEN id=62 THEN 'Vérifier son droit aux aides au temps libre dans son compte CAF et les séjours partenaires 2026 ; confirmer durée, plafond et reste à charge avant réservation.'
 ELSE demarches_fr END,
 demarches_kreol = CASE
 WHEN id IN (29,41) THEN 'Guette campagne Pass Sport 2026-2027 ek FAQ officielle pou vérifi code, critères ek club partenaire avan inscription.'
 WHEN id=44 THEN 'Guette page CAF La Rényon BAFA/BAFD, stage concerné, bann pièces à fournir ek montants actuels avan déposé.'
 WHEN id=62 THEN 'Vérifi out compte CAF ek bann séjours partenaires, durée, montant aide ek reste à payer avan réserve.'
 ELSE demarches_kreol END,
 condition_famille = CASE
 WHEN id IN (29,41) THEN 'Bénéficiaires sous critères de la campagne 2026-2027 (âge, situation sociale, handicap, quotient familial selon cas) : vérifier auprès du site officiel.'
 ELSE condition_famille END
WHERE id IN (29,41,30,42,44,76,38,40,62);
COMMIT;