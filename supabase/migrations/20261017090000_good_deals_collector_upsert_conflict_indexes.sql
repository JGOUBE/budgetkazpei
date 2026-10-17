-- Match the collector's PostgREST on_conflict=collector_source_slug,external_key.
-- Existing partial unique indexes cannot be inferred by an unqualified ON CONFLICT.
-- PostgreSQL UNIQUE allows repeated NULL values, preserving non-collector rows.
-- Keep all existing partial indexes and application data untouched.
CREATE UNIQUE INDEX IF NOT EXISTS shopping_catalogs_source_external_full_uk
  ON public.shopping_catalogs (collector_source_slug, external_key);

CREATE UNIQUE INDEX IF NOT EXISTS shopping_promotions_source_external_full_uk
  ON public.shopping_promotions (collector_source_slug, external_key);

CREATE UNIQUE INDEX IF NOT EXISTS good_deals_source_external_full_uk
  ON public.good_deals (collector_source_slug, external_key);
