-- Révision des types d'aides. Type descriptif, jamais preuve d'éligibilité.
-- Les prestations expressément nommées sont distinguées des fiches génériques d'orientation.
-- Une fiche douteuse (source a_verifier) garde ce statut même si son type est renseigné.
BEGIN;
UPDATE public.aides_reunion SET type_dispositif='aide_financiere' WHERE id IN (1,2,4,5,6,13,14,15,16,17,18,19,20,32,39,46,51,52,64,66,69,71,77,78,79,80,82,84,88,89,90,91,92,93,94,95,96,97,99,100,101,103,104,107,108,109,110,111,112,113,114,116,117,263) AND type_dispositif='non_classe';
UPDATE public.aides_reunion SET type_dispositif='reduction_tarifaire' WHERE id IN (3,27,28,61,102) AND type_dispositif='non_classe';
UPDATE public.aides_reunion SET type_dispositif='service_gratuit' WHERE id IN (31) AND type_dispositif='non_classe';
UPDATE public.aides_reunion SET type_dispositif='aide_alimentaire' WHERE id IN (59) AND type_dispositif='non_classe';
UPDATE public.aides_reunion SET type_dispositif='aide_materielle' WHERE id IN (98) AND type_dispositif='non_classe';
UPDATE public.aides_reunion SET type_dispositif='accompagnement' WHERE id IN (48,55,73,75) AND type_dispositif='non_classe';
UPDATE public.aides_reunion SET type_dispositif='orientation'
WHERE actif AND type_dispositif='non_classe';
COMMIT;
SELECT type_dispositif,count(*) FROM public.aides_reunion WHERE actif GROUP BY 1 ORDER BY 1;
