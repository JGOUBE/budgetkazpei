from pathlib import Path
import re
import unittest


MIGRATION_PATH = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "202607270008_good_deals_publish_candidate_constraint_alignment.sql"
)


class ImmediatePublicationConstraintAlignmentMigrationContractTests(unittest.TestCase):
    @staticmethod
    def _normalized_sql() -> str:
        sql = MIGRATION_PATH.read_text(encoding="utf-8").lower()
        return re.sub(r"\s+", " ", sql).strip()

    def test_migration_is_reexecutable_by_construction(self):
        sql = self._normalized_sql()
        self.assertIn("begin;", sql)
        self.assertIn("commit;", sql)
        self.assertIn("create or replace function public.good_deals_publish_candidate", sql)
        self.assertIn("returns uuid", sql)

    def test_migration_preserves_security_and_idempotence_guards(self):
        sql = self._normalized_sql()
        self.assertIn("security definer", sql)
        self.assertIn("set search_path = public, auth", sql)
        self.assertIn("public.good_deals_is_admin()", sql)
        self.assertIn("for update", sql)
        self.assertIn("if v_candidate.status = 'published' and v_candidate.published_good_deal_id is not null then", sql)
        self.assertIn("return v_candidate.published_good_deal_id;", sql)
        self.assertIn("alter function public.good_deals_publish_candidate(uuid) owner to postgres;", sql)
        self.assertIn("revoke all on function public.good_deals_publish_candidate(uuid) from public, anon;", sql)
        self.assertIn("grant execute on function public.good_deals_publish_candidate(uuid) to authenticated, service_role, postgres;", sql)

    def test_migration_replaces_forbidden_active_with_allowed_availability_values_only(self):
        sql = self._normalized_sql()
        self.assertIn("when v_candidate.content_kind = 'event' then 'check_before_visit'", sql)
        self.assertIn("when v_candidate.content_kind = 'permanent_leisure' then 'open'", sql)
        self.assertIn("else 'unknown'", sql)
        self.assertIn("array['open', 'seasonal', 'temporarily_closed', 'check_before_visit', 'unknown']", sql)
        self.assertIn("invalid availability_status for good deal publication", sql)
        self.assertNotIn("'active'", sql)

    def test_migration_validates_real_constrained_values_before_writes(self):
        sql = self._normalized_sql()
        required_snippets = [
            "invalid scope_type for good deal publication",
            "invalid content_kind for good deal publication",
            "invalid deal_type for good deal publication",
            "good deal title is required for immediate publication",
            "good deal description is required for immediate publication",
            "invalid publication window: ends_at precedes starts_at",
            "scope_type % requires commune or micro_region for immediate publication",
            "invalid shopping catalog source_kind for immediate publication",
            "invalid shopping catalog verification_status for immediate publication",
            "invalid shopping product alias source_kind for immediate publication",
            "invalid shopping promotion verification_status for immediate publication",
            "invalid good deal candidate status for immediate publication",
        ]
        for snippet in required_snippets:
            self.assertIn(snippet, sql)

    def test_migration_aligns_catalog_and_alias_scope_kinds_with_real_constraints(self):
        sql = self._normalized_sql()
        self.assertIn("v_catalog_source_kind public.shopping_catalogs.source_kind%type := 'collector';", sql)
        self.assertIn("v_alias_source_kind public.shopping_product_aliases.source_kind%type := 'catalog';", sql)
        self.assertIn("source_kind = v_catalog_source_kind", sql)
        self.assertIn("v_alias_source_kind, v_candidate.retailer_slug", sql)
        self.assertIn("array['receipt', 'catalog', 'manual', 'import']", sql)
        self.assertIn("array['island', 'micro_region', 'commune', 'store', 'online']", sql)
        self.assertIn("when v_candidate.scope_type = 'local' and v_store_location_id is not null then 'store'", sql)
        self.assertIn("when v_candidate.scope_type = 'local' and nullif(btrim(coalesce(v_candidate.commune, '')), '') is not null then 'commune'", sql)
        self.assertIn("when v_candidate.scope_type = 'nearby' and nullif(btrim(coalesce(v_candidate.micro_region, '')), '') is not null then 'micro_region'", sql)
        self.assertIn("invalid shopping catalog scope_type for immediate publication", sql)

    def test_migration_keeps_catalog_path_without_fake_product_rows(self):
        sql = self._normalized_sql()
        self.assertIn("if v_catalog_candidate or v_product_promotion_candidate then", sql)
        self.assertIn("if v_product_promotion_candidate then", sql)
        self.assertIn("if v_product_promotion_candidate and v_candidate.commune is not null", sql)
        self.assertLess(
            sql.index("if v_product_promotion_candidate then"),
            sql.index("insert into public.shopping_products"),
        )
        self.assertLess(
            sql.index("if v_catalog_candidate or v_product_promotion_candidate then"),
            sql.index("insert into public.shopping_catalogs"),
        )

    def test_migration_checks_product_promotion_constraints_before_writing_promotions(self):
        sql = self._normalized_sql()
        self.assertIn("promo_price must be strictly positive for immediate publication", sql)
        self.assertIn("original_price must be strictly positive for immediate publication", sql)
        self.assertIn("unit_price must be strictly positive for immediate publication", sql)
        self.assertIn("discount_percent must stay between 0 and 100 for immediate publication", sql)
        self.assertIn("original_price must be greater than or equal to promo_price for immediate publication", sql)
        self.assertLess(
            sql.index("promo_price must be strictly positive for immediate publication"),
            sql.index("insert into public.shopping_promotions"),
        )

    def test_migration_reuses_existing_catalog_before_inserting_new_one(self):
        sql = self._normalized_sql()
        self.assertIn("from public.shopping_catalogs where collector_source_slug = v_source.slug and external_key = v_catalog_external_key", sql)
        self.assertIn("where retailer_slug is not distinct from v_candidate.retailer_slug and title is not distinct from v_candidate.title and starts_at is not distinct from v_candidate.starts_at and ends_at is not distinct from v_candidate.ends_at", sql)

    def test_migration_updates_candidate_only_after_successful_publication(self):
        sql = self._normalized_sql()
        update_index = sql.index("update public.good_deal_candidates set")
        good_deal_write_index = sql.index("insert into public.good_deals")
        self.assertGreater(update_index, good_deal_write_index)
        self.assertIn("status = v_candidate_published_status", sql)
        self.assertIn("published_good_deal_id = v_good_deal_id", sql)
        self.assertIn("reviewed_at = v_now", sql)
        self.assertIn("rejection_reason = null", sql)

    def test_migration_avoids_destructive_statements(self):
        sql = self._normalized_sql()
        forbidden = ["drop table", "truncate", "delete from", "alter policy", "enable row level security", "disable row level security"]
        for pattern in forbidden:
            self.assertNotIn(pattern, sql)


if __name__ == "__main__":
    unittest.main()
