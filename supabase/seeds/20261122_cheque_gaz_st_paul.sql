-- Chèque gaz solidaire Saint-Paul, annonce municipale octobre 2026.
-- Ne pas présumer reconduction, montant universel ni éligibilité.
DO $aid$ BEGIN
  PERFORM pg_advisory_xact_lock(84690123);
  LOCK TABLE public.aides_reunion IN SHARE ROW EXCLUSIVE MODE;
  PERFORM setval(pg_get_serial_sequence('public.aides_reunion','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM public.aides_reunion), (SELECT last_value FROM public.aides_reunion_id_seq)),true);
  IF NOT EXISTS(SELECT 1 FROM public.aides_reunion WHERE lower(nom)=lower('Chèque gaz solidaire — CCAS de Saint-Paul'))
  THEN
    INSERT INTO public.aides_reunion (
      nom,categorie,commune,organisme,type_dispositif,zone_couverte,
      description,description_fr,description_kreol,demarches_fr,demarches_kreol,
      lien,lien_officiel,source_verification,date_verification,periode_validite,
      statut_verification,score_priorite,actif
    ) VALUES (
      'Chèque gaz solidaire — CCAS de Saint-Paul','energie','Saint-Paul','CCAS de Saint-Paul',
      'reduction_tarifaire','Saint-Paul',
      'Dispositif communal annoncé en octobre 2026 : aide supplémentaire de 8 euros par bouteille de gaz sous conditions. Ne pas en déduire un droit automatique ou un versement en espèces.',
      'Aide annoncée par la Ville de Saint-Paul à hauteur de 8 euros par bouteille de gaz pour certains bénéficiaires, selon conditions municipales. Règlement, disponibilité et renouvellement à vérifier au CCAS.',
      'Aide gaz Saint-Paul annoncée octobre 2026 pou sertin ménaz. Vérifi bann conditions directement kot CCAS.',
      'Contacter le CCAS de Saint-Paul, vérifier les critères en vigueur, la forme de remise et le circuit de demande ; ne pas effectuer de calcul de droits sur la seule base du montant annoncé.',
      'Kontakte CCAS Saint-Paul pou konèt bann conditions, la période ek comment demande.',
      'https://www.mairie-saintpaul.re/a-saint-paul-le-cheque-gaz-solidaire-pour-proteger-le-pouvoir-dachat-des-personnes-les-plus-fragiles/',
      'https://www.mairie-saintpaul.re/a-saint-paul-le-cheque-gaz-solidaire-pour-proteger-le-pouvoir-dachat-des-personnes-les-plus-fragiles/',
      'https://www.mairie-saintpaul.re/a-saint-paul-le-cheque-gaz-solidaire-pour-proteger-le-pouvoir-dachat-des-personnes-les-plus-fragiles/',
      DATE '2026-11-22','Annonce municipale octobre 2026 : 8 EUR/bouteille selon éligibilité ; vérifier disponibilité et montant au moment de la demande.',
      'source_confirmee',100,true
    );
  END IF;
END $aid$;