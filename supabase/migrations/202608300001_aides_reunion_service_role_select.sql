-- Le Conseiller recharge les faits officiels côté Edge avant de générer puis
-- réviser sa réponse. Le rôle serveur doit pouvoir lire ce référentiel.
grant usage on schema public to service_role;
grant select on table public.aides_reunion to service_role;
