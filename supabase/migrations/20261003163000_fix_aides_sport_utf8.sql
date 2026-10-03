-- BudgetKazPei
-- Répare les textes d'aides sport enregistrés avec un double encodage UTF-8.
-- Migration ciblée et non destructive : uniquement les lignes Pass'Sport et Plan 5 000 licences.

update public.aides_reunion
set
  nom = 'Pass''Sport',
  nom_kreol = 'Pass''Sport',
  description = 'Aide nationale qui réduit tout ou partie des frais d''inscription dans une structure sportive partenaire. La campagne 2026-2027 est annoncée prochainement : montant et critères exacts à vérifier sur le site officiel avant de conclure à l''éligibilité.',
  description_fr = 'Aide nationale qui réduit tout ou partie des frais d''inscription dans une structure sportive partenaire. La campagne 2026-2027 est annoncée prochainement : montant et critères exacts à vérifier sur le site officiel avant de conclure à l''éligibilité.',
  description_kreol = 'In aide nasyonal pou réduit in parti ou tout frais inscription dann in structure sportif partenaire. Kampagn 2026-2027 lé annoncé prochainement : montant ek critères exacts lé pou vérifié su site officiel avan di in moun lé éligible.',
  demarches_fr = 'Consulter le site officiel Pass''Sport lors de l''ouverture de la campagne 2026-2027, vérifier les critères applicables et s''assurer que la structure sportive est partenaire avant l''inscription.',
  demarches_kreol = 'Kan kampagn 2026-2027 i ouvre, vérifie bann critères su site officiel Pass''Sport ek vérifie structure sportif la lé partenaire avan inscription.',
  condition_famille = 'Campagne 2026-2027 : conditions officielles à confirmer lors de son lancement.'
where regexp_replace(lower(coalesce(nom, '')), '[^a-z0-9]+', '', 'g') = 'passsport';

update public.aides_reunion
set
  nom = 'Plan 5 000 licences',
  nom_kreol = 'Plan 5 000 licences',
  description = 'Aide du Département de La Réunion pour les jeunes de moins de 21 ans dont les parents sont bénéficiaires du RSA. Elle peut financer jusqu''à 100 € du coût de l''inscription en club, licence et cotisation comprises. Elle est cumulable avec Pass''Sport et d''autres aides similaires.',
  description_fr = 'Aide du Département de La Réunion pour les jeunes de moins de 21 ans dont les parents sont bénéficiaires du RSA. Elle peut financer jusqu''à 100 € du coût de l''inscription en club, licence et cotisation comprises. Elle est cumulable avec Pass''Sport et d''autres aides similaires.',
  description_kreol = 'Aide Département La Rényon pou bann jeunes moins de 21 an kan zot parent lé bénéficiaire RSA. Aide la i pé monte ziska 100 € pou inscription dann club, licence ek cotisation compris. Li pé cumule ek Pass''Sport ek lezot aides similaires.',
  demarches_fr = 'Préparer une attestation CAF de moins de 3 mois, un justificatif d''identité de l''enfant et un justificatif de domicile de moins de 3 mois du responsable légal. Déposer le formulaire d''inscription et les pièces auprès du club ; le club vérifie l''éligibilité puis la ligue ou le comité et le CROS traitent le remboursement.',
  demarches_kreol = 'Prépare attestation CAF moins de 3 mois, justificatif identité marmay ek justificatif domicile moins de 3 mois responsable légal. Donne formulaire ek papye au club ; club la i vérifie éligibilité, apré ligue ou comité ek CROS i traite remboursement.',
  condition_famille = 'Jeune de moins de 21 ans dont les parents sont bénéficiaires du RSA.'
where regexp_replace(lower(coalesce(nom, '')), '[^a-z0-9]+', '', 'g') = 'plan5000licences';
