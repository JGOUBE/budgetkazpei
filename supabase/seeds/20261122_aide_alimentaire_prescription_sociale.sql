-- Les opérateurs DEETS 2025-2026 prescrivent l'aide alimentaire avec orientation sociale.
-- Source : annuaire institutionnel, page de garde, 2025-2026.
UPDATE public.aides_reunion
SET demarches_fr = 'Pour demander l aide alimentaire habilitée DEETS, solliciter d abord un travailleur social (CCAS, mairie, Département ou service social spécialisé) : une prescription sociale est requise. Contacter ensuite la structure avant tout déplacement ; conditions et distributions à reconfirmer.',
    demarches_kreol = 'Pou aide alimentaire DEETS, demande dabord in travailleur social ou CCAS in prescription sociale. Après appelle l association pou vérifi distribution ek conditions.'
WHERE (id BETWEEN 127 AND 153 OR id IN (119,122,123))
AND categorie='alimentaire';
SELECT count(*) as fiches_consignes_corrigees FROM public.aides_reunion WHERE (id BETWEEN 127 AND 153 OR id IN(119,122,123)) AND categorie='alimentaire' AND demarches_fr LIKE '%prescription sociale est requise%';