-- BudgetKazPei
-- Enrichissement ciblÃ© Aides & Droits : Pass'Sport + Plan 5 000 licences
-- Sources officielles vÃ©rifiÃ©es le 2026-08-22 :
-- https://www.pass.sports.gouv.fr/
-- https://www.departement974.fr/aide/aide-plan-5000-licences
--
-- IMPORTANT :
-- - Pass'Sport 2026-2027 est rÃ©fÃ©rencÃ© mais son montant et ses critÃ¨res ne sont
--   volontairement PAS figÃ©s tant que la campagne officielle n'est pas publiÃ©e.
-- - Le Plan 5 000 licences est documentÃ© par le DÃ©partement de La RÃ©union :
--   jeunes de moins de 21 ans, parents bÃ©nÃ©ficiaires du RSA, jusqu'Ã  100 â‚¬,
--   licence + cotisation, cumul possible avec Pass'Sport.
-- - age_min / age_max ne sont pas utilisÃ©s ici : le profil BudgetKazPei porte
--   l'Ã¢ge du titulaire du compte et non l'Ã¢ge de chaque enfant.

do $migration$
declare
  id_default text;
  id_nullable text;
  id_identity text;
  pass_sport_exists boolean;
  plan_5000_exists boolean;
begin
  if to_regclass('public.aides_reunion') is null then
    raise exception 'Table public.aides_reunion introuvable';
  end if;

  select exists (
    select 1
    from public.aides_reunion
    where regexp_replace(lower(coalesce(nom, '')), '[^a-z0-9]+', '', 'g') = 'passsport'
  ) into pass_sport_exists;

  select exists (
    select 1
    from public.aides_reunion
    where regexp_replace(lower(coalesce(nom, '')), '[^a-z0-9]+', '', 'g') = 'plan5000licences'
  ) into plan_5000_exists;

  -- SÃ©curitÃ© : si l'id est obligatoire et sans gÃ©nÃ©ration automatique,
  -- on refuse l'insertion plutÃ´t que d'inventer un identifiant incompatible.
  if not pass_sport_exists or not plan_5000_exists then
    select column_default, is_nullable, is_identity
      into id_default, id_nullable, id_identity
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'aides_reunion'
      and column_name = 'id';

    if found
      and id_default is null
      and coalesce(id_nullable, 'NO') = 'NO'
      and coalesce(id_identity, 'NO') <> 'YES'
    then
      raise exception
        'aides_reunion.id est obligatoire sans valeur par dÃ©faut : audit du type id requis avant insertion';
    end if;
  end if;

  -- PASS'SPORT
  update public.aides_reunion
  set
    nom = 'Pass''Sport',
    nom_kreol = 'Pass''Sport',
    description =
      'Aide nationale qui rÃ©duit tout ou partie des frais d''inscription dans une structure sportive partenaire. La campagne 2026-2027 est annoncÃ©e prochainement : montant et critÃ¨res exacts Ã  vÃ©rifier sur le site officiel avant de conclure Ã  l''Ã©ligibilitÃ©.',
    description_fr =
      'Aide nationale qui rÃ©duit tout ou partie des frais d''inscription dans une structure sportive partenaire. La campagne 2026-2027 est annoncÃ©e prochainement : montant et critÃ¨res exacts Ã  vÃ©rifier sur le site officiel avant de conclure Ã  l''Ã©ligibilitÃ©.',
    description_kreol =
      'In aide nasyonal pou rÃ©duit in parti ou tout frais inscription dann in structure sportif partenaire. Kampagn 2026-2027 lÃ© annoncÃ© prochainement : montant ek critÃ¨res exacts lÃ© pou vÃ©rifiÃ© su site officiel avan di in moun lÃ© Ã©ligible.',
    demarches_fr =
      'Consulter le site officiel Pass''Sport lors de l''ouverture de la campagne 2026-2027, vÃ©rifier les critÃ¨res applicables et s''assurer que la structure sportive est partenaire avant l''inscription.',
    demarches_kreol =
      'Kan kampagn 2026-2027 i ouvre, vÃ©rifie bann critÃ¨res su site officiel Pass''Sport ek vÃ©rifie structure sportif la lÃ© partenaire avan inscription.',
    montant_min = null,
    montant_max = null,
    categorie = 'sport',
    condition_famille =
      'Campagne 2026-2027 : conditions officielles Ã  confirmer lors de son lancement.',
    lien = 'https://www.pass.sports.gouv.fr/',
    lien_officiel = 'https://www.pass.sports.gouv.fr/',
    besoin_enfant = false,
    score_priorite = 90
  where regexp_replace(lower(coalesce(nom, '')), '[^a-z0-9]+', '', 'g') = 'passsport';

  if not found then
    insert into public.aides_reunion (
      nom,
      nom_kreol,
      description,
      description_fr,
      description_kreol,
      demarches_fr,
      demarches_kreol,
      montant_min,
      montant_max,
      categorie,
      condition_famille,
      lien,
      lien_officiel,
      besoin_enfant,
      score_priorite
    )
    values (
      'Pass''Sport',
      'Pass''Sport',
      'Aide nationale qui rÃ©duit tout ou partie des frais d''inscription dans une structure sportive partenaire. La campagne 2026-2027 est annoncÃ©e prochainement : montant et critÃ¨res exacts Ã  vÃ©rifier sur le site officiel avant de conclure Ã  l''Ã©ligibilitÃ©.',
      'Aide nationale qui rÃ©duit tout ou partie des frais d''inscription dans une structure sportive partenaire. La campagne 2026-2027 est annoncÃ©e prochainement : montant et critÃ¨res exacts Ã  vÃ©rifier sur le site officiel avant de conclure Ã  l''Ã©ligibilitÃ©.',
      'In aide nasyonal pou rÃ©duit in parti ou tout frais inscription dann in structure sportif partenaire. Kampagn 2026-2027 lÃ© annoncÃ© prochainement : montant ek critÃ¨res exacts lÃ© pou vÃ©rifiÃ© su site officiel avan di in moun lÃ© Ã©ligible.',
      'Consulter le site officiel Pass''Sport lors de l''ouverture de la campagne 2026-2027, vÃ©rifier les critÃ¨res applicables et s''assurer que la structure sportive est partenaire avant l''inscription.',
      'Kan kampagn 2026-2027 i ouvre, vÃ©rifie bann critÃ¨res su site officiel Pass''Sport ek vÃ©rifie structure sportif la lÃ© partenaire avan inscription.',
      null,
      null,
      'sport',
      'Campagne 2026-2027 : conditions officielles Ã  confirmer lors de son lancement.',
      'https://www.pass.sports.gouv.fr/',
      'https://www.pass.sports.gouv.fr/',
      false,
      90
    );
  end if;

  -- PLAN 5 000 LICENCES - DEPARTEMENT DE LA REUNION
  update public.aides_reunion
  set
    nom = 'Plan 5 000 licences',
    nom_kreol = 'Plan 5 000 licences',
    description =
      'Aide du DÃ©partement de La RÃ©union pour les jeunes de moins de 21 ans dont les parents sont bÃ©nÃ©ficiaires du RSA. Elle peut financer jusqu''Ã  100 â‚¬ du coÃ»t de l''inscription en club, licence et cotisation comprises. Elle est cumulable avec Pass''Sport et d''autres aides similaires.',
    description_fr =
      'Aide du DÃ©partement de La RÃ©union pour les jeunes de moins de 21 ans dont les parents sont bÃ©nÃ©ficiaires du RSA. Elle peut financer jusqu''Ã  100 â‚¬ du coÃ»t de l''inscription en club, licence et cotisation comprises. Elle est cumulable avec Pass''Sport et d''autres aides similaires.',
    description_kreol =
      'Aide DÃ©partement La RÃ©nyon pou bann jeunes moins de 21 an kan zot parent lÃ© bÃ©nÃ©ficiaire RSA. Aide la i pÃ© monte ziska 100 â‚¬ pou inscription dann club, licence ek cotisation compris. Li pÃ© cumule ek Pass''Sport ek lezot aides similaires.',
    demarches_fr =
      'PrÃ©parer une attestation CAF de moins de 3 mois, un justificatif d''identitÃ© de l''enfant et un justificatif de domicile de moins de 3 mois du responsable lÃ©gal. DÃ©poser le formulaire d''inscription et les piÃ¨ces auprÃ¨s du club ; le club vÃ©rifie l''Ã©ligibilitÃ© puis la ligue ou le comitÃ© et le CROS traitent le remboursement.',
    demarches_kreol =
      'PrÃ©pare attestation CAF moins de 3 mois, justificatif identitÃ© marmay ek justificatif domicile moins de 3 mois responsable lÃ©gal. Donne formulaire ek papye au club ; club la i vÃ©rifie Ã©ligibilitÃ©, aprÃ© ligue ou comitÃ© ek CROS i traite remboursement.',
    montant_min = null,
    montant_max = 100,
    categorie = 'sport',
    condition_famille =
      'Jeune de moins de 21 ans dont les parents sont bÃ©nÃ©ficiaires du RSA.',
    lien = 'https://www.departement974.fr/aide/aide-plan-5000-licences',
    lien_officiel = 'https://www.departement974.fr/aide/aide-plan-5000-licences',
    besoin_enfant = true,
    score_priorite = 85
  where regexp_replace(lower(coalesce(nom, '')), '[^a-z0-9]+', '', 'g') = 'plan5000licences';

  if not found then
    insert into public.aides_reunion (
      nom,
      nom_kreol,
      description,
      description_fr,
      description_kreol,
      demarches_fr,
      demarches_kreol,
      montant_min,
      montant_max,
      categorie,
      condition_famille,
      lien,
      lien_officiel,
      besoin_enfant,
      score_priorite
    )
    values (
      'Plan 5 000 licences',
      'Plan 5 000 licences',
      'Aide du DÃ©partement de La RÃ©union pour les jeunes de moins de 21 ans dont les parents sont bÃ©nÃ©ficiaires du RSA. Elle peut financer jusqu''Ã  100 â‚¬ du coÃ»t de l''inscription en club, licence et cotisation comprises. Elle est cumulable avec Pass''Sport et d''autres aides similaires.',
      'Aide du DÃ©partement de La RÃ©union pour les jeunes de moins de 21 ans dont les parents sont bÃ©nÃ©ficiaires du RSA. Elle peut financer jusqu''Ã  100 â‚¬ du coÃ»t de l''inscription en club, licence et cotisation comprises. Elle est cumulable avec Pass''Sport et d''autres aides similaires.',
      'Aide DÃ©partement La RÃ©nyon pou bann jeunes moins de 21 an kan zot parent lÃ© bÃ©nÃ©ficiaire RSA. Aide la i pÃ© monte ziska 100 â‚¬ pou inscription dann club, licence ek cotisation compris. Li pÃ© cumule ek Pass''Sport ek lezot aides similaires.',
      'PrÃ©parer une attestation CAF de moins de 3 mois, un justificatif d''identitÃ© de l''enfant et un justificatif de domicile de moins de 3 mois du responsable lÃ©gal. DÃ©poser le formulaire d''inscription et les piÃ¨ces auprÃ¨s du club ; le club vÃ©rifie l''Ã©ligibilitÃ© puis la ligue ou le comitÃ© et le CROS traitent le remboursement.',
      'PrÃ©pare attestation CAF moins de 3 mois, justificatif identitÃ© marmay ek justificatif domicile moins de 3 mois responsable lÃ©gal. Donne formulaire ek papye au club ; club la i vÃ©rifie Ã©ligibilitÃ©, aprÃ© ligue ou comitÃ© ek CROS i traite remboursement.',
      null,
      100,
      'sport',
      'Jeune de moins de 21 ans dont les parents sont bÃ©nÃ©ficiaires du RSA.',
      'https://www.departement974.fr/aide/aide-plan-5000-licences',
      'https://www.departement974.fr/aide/aide-plan-5000-licences',
      true,
      85
    );
  end if;
end
$migration$;