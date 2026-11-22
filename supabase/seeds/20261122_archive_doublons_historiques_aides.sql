-- 2026-11-22: conserver une seule fiche active pour chacun des 4 dispositifs dupliqués.
-- Aucune suppression de données. Les enregistrements historiques archivés restent consultables par admin.
-- Aide alimentaire CCAS: conserver id59 (description plus précise) au lieu de 25.
-- FSL: conserver id64 (démarches plus complètes) au lieu de 8.
-- Pass Culture: conserver id30 (source 2026) au lieu de 42.
-- Pass'Sport: conserver id29 (source 2026) au lieu de 41.
UPDATE public.aides_reunion SET actif=false WHERE id IN (8,25,41,42) AND actif=true;
