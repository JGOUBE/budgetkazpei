-- Protect Courses intelligentes from historical promotions whose full
-- validity window was not known at ingestion. Such offers were previously
-- converted into ordinary dated price observations and must not count as
-- comparable non-promotion prices.
--
-- The original retail_price_candidates and retail_price_observations rows
-- remain intact for audit. Only the public comparison view is filtered.
--
-- Idempotent: safe to apply on installations where this view already contains
-- the same guard (including the production hotfix of 2026-11-11).
DO $budgetkazpei$
DECLARE
  definition text;
BEGIN
  definition := pg_get_viewdef('public.published_retail_observed_prices'::regclass, true);

  IF position('retail_candidates.review_notes' IN definition) = 0 THEN
    IF position('observations.promotion_proven IS FALSE' IN definition) = 0 THEN
      RAISE EXCEPTION 'Cannot locate the safe observed-price filter anchor';
    END IF;

    definition := replace(
      definition,
      'observations.promotion_proven IS FALSE',
      'observations.promotion_proven IS FALSE'
      || ' AND COALESCE(retail_candidates.review_notes, '''') NOT ILIKE ''%Periode de promotion incomplete%'''
      || ' AND COALESCE(retail_candidates.review_notes, '''') NOT ILIKE ''%Promotion terminee%'''
    );

    EXECUTE 'CREATE OR REPLACE VIEW public.published_retail_observed_prices AS ' || definition;
  END IF;
END;
$budgetkazpei$;
