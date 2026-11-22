-- Amorçage du répertoire distinct depuis les organismes déjà documentés dans aides_reunion.
-- Ne valide ni l'activité réelle ni l'éligibilité. Source retenue = fiche d'aide existante.
WITH g AS (
 SELECT
   'catalogue-aides:'||md5(lower(btrim(organisme))) AS source_key,
   (array_agg(organisme ORDER BY id))[1] AS nom,
   CASE WHEN count(DISTINCT nullif(btrim(commune),''))=1
     THEN max(nullif(btrim(commune),'')) ELSE null END AS commune,
   CASE WHEN count(DISTINCT nullif(btrim(zone_couverte),''))=1
     THEN max(nullif(btrim(zone_couverte),'')) ELSE 'La Réunion : périmètre exact de chaque service à vérifier' END AS zone_couverte,
   array_remove(array_agg(DISTINCT categorie),null) AS domaines,
   bool_or(actif AND statut_verification IN ('source_confirmee','operateur_reference_2026')) AS source_aide_disponible,
   min(coalesce(nullif(source_verification,''),nullif(lien_officiel,'')))
     FILTER (WHERE coalesce(nullif(source_verification,''),nullif(lien_officiel,'')) LIKE 'https://%') AS source_url,
   max(date_verification) AS date_source
 FROM public.aides_reunion
 WHERE nullif(btrim(organisme),'') IS NOT NULL
 GROUP BY lower(btrim(organisme))
)
INSERT INTO public.structures_solidaires_reunion
(source_key,nom,commune,zone_couverte,domaines,nature_structure,statut_referencement,service_aide_valide,source_url,date_source)
SELECT source_key,nom,commune,zone_couverte,domaines,
 CASE
  WHEN nom ~* '(^CCAS |^CAF |^Conseil d.partemental|^Ville |^Mairie |^D.partement |^Acad.mie |^Institut r.gional du travail social|^Caisse |^Universit.)' THEN 'service_public'
  WHEN nom ~* '(collectif|communit.)' THEN 'collectif'
  WHEN nom ~* '(UDAF|UNAFAM|f.d.ration|union|r.seau)' THEN 'reseau'
  WHEN nom ~* '(association|croix.rouge|secours|emma.s|comit.|soci.t. de saint.vincent|afm.t.l.thon|adapei|apajh|france alzheimer|aap.j)' THEN 'association'
  ELSE 'a_qualifier'
 END,
 'catalogue_aides',false,source_url,date_source FROM g
ON CONFLICT (source_key) DO UPDATE SET
  domaines=excluded.domaines,
  commune=excluded.commune,
  zone_couverte=excluded.zone_couverte,
  source_url=coalesce(excluded.source_url,public.structures_solidaires_reunion.source_url),
  date_source=coalesce(excluded.date_source,public.structures_solidaires_reunion.date_source),
  updated_at=now()
WHERE public.structures_solidaires_reunion.statut_referencement='catalogue_aides';
INSERT INTO public.structures_solidaires_aides(structure_id,aide_id)
SELECT s.id,a.id
FROM public.aides_reunion a
JOIN public.structures_solidaires_reunion s
  ON s.source_key='catalogue-aides:'||md5(lower(btrim(a.organisme)))
WHERE a.organisme IS NOT NULL AND btrim(a.organisme)<>'' AND a.actif
ON CONFLICT (structure_id,aide_id) DO NOTHING;
SELECT
  (SELECT count(*) FROM public.structures_solidaires_reunion) as structures,
  (SELECT count(*) FROM public.structures_solidaires_aides) as liens,
  (SELECT count(*) FROM public.structures_solidaires_reunion WHERE nature_structure='association') as associations_qualifiees,
  (SELECT count(*) FROM public.structures_solidaires_reunion WHERE nature_structure='service_public') as services_publics,
  (SELECT count(*) FROM public.structures_solidaires_reunion WHERE service_aide_valide) as statuts_service_valide;
