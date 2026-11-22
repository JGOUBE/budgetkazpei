-- Migration déjà appliquée sur le projet BudgetKazPeï le 22/11/2026.
-- Les crédits culturels et réductions tarifaires ne sont pas des virements en espèces.
ALTER TABLE public.aides_reunion
  DROP CONSTRAINT IF EXISTS aides_reunion_type_dispositif_check;
ALTER TABLE public.aides_reunion
  ADD CONSTRAINT aides_reunion_type_dispositif_check
  CHECK (type_dispositif IN (
    'non_classe','aide_financiere','aide_materielle','aide_alimentaire',
    'accompagnement','service_gratuit','orientation','reduction_tarifaire','credit_culturel'
  ));
