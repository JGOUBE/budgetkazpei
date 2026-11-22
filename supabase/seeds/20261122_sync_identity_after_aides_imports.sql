-- Synchronise l'identité après l'import de fiches historiques / scripts manuels.
-- Sécurise le prochain INSERT sans ID explicite sur aides_reunion.
BEGIN;
SELECT pg_advisory_xact_lock(84690123);
SELECT setval(
  pg_get_serial_sequence('public.aides_reunion', 'id'),
  GREATEST(
    (SELECT COALESCE(MAX(id), 1) FROM public.aides_reunion),
    (SELECT last_value FROM public.aides_reunion_id_seq)
  ),
  true
);
COMMIT;