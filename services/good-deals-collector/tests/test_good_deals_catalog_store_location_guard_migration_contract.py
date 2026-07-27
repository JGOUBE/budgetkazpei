from pathlib import Path
import re
import unittest


MIGRATION_PATH = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "202607270004_good_deals_catalog_store_location_guard.sql"
)


class GoodDealsCatalogStoreLocationGuardMigrationContractTests(unittest.TestCase):
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

    def test_migration_avoids_destructive_data_statements(self):
        sql = self._normalized_sql()
        self.assertNotIn("drop table", sql)
        self.assertNotIn("truncate", sql)
        self.assertNotIn("delete from", sql)

    def test_rpc_keeps_security_and_execution_guards(self):
        sql = self._normalized_sql()
        self.assertIn("security definer", sql)
        self.assertIn("set search_path = public, auth", sql)
        self.assertIn("public.good_deals_is_admin()", sql)
        self.assertIn("for update", sql)
        self.assertIn("alter function public.good_deals_publish_candidate(uuid) owner to postgres;", sql)
        self.assertIn("revoke all on function public.good_deals_publish_candidate(uuid) from public, anon;", sql)
        self.assertIn("grant execute on function public.good_deals_publish_candidate(uuid) to authenticated, service_role, postgres;", sql)

    def test_migration_declares_typed_variables_for_real_enum_targets(self):
        sql = self._normalized_sql()
        self.assertIn("v_good_deal_scope_type public.good_deals.scope_type%type;", sql)
        self.assertIn("v_good_deal_deal_type public.good_deals.deal_type%type;", sql)
        self.assertIn("v_good_deal_content_kind public.good_deals.content_kind%type;", sql)
        self.assertIn("v_good_deal_verification_status public.good_deals.verification_status%type;", sql)

    def test_migration_validates_and_casts_scope_type_and_other_real_enums(self):
        sql = self._normalized_sql()
        self.assertIn("enum_range(null::public.good_deal_scope_type)::text[]", sql)
        self.assertIn("invalid scope_type for good deal publication", sql)
        self.assertIn("v_good_deal_scope_type := v_candidate.scope_type::public.good_deal_scope_type;", sql)
        self.assertIn("enum_range(null::public.good_deal_content_kind)::text[]", sql)
        self.assertIn("invalid content_kind for good deal publication", sql)
        self.assertIn("v_good_deal_content_kind := v_candidate.content_kind::public.good_deal_content_kind;", sql)
        self.assertIn("enum_range(null::public.good_deal_type)::text[]", sql)
        self.assertIn("invalid deal_type for good deal publication", sql)
        self.assertIn("v_good_deal_deal_type := v_deal_type_text::public.good_deal_type;", sql)
        self.assertIn("v_good_deal_verification_status := 'published'::public.good_deal_verification_status;", sql)

    def test_migration_keeps_catalog_branch_without_fake_products(self):
        sql = self._normalized_sql()
        self.assertIn("v_catalog_scope_type public.shopping_catalogs.scope_type%type;", sql)
        self.assertIn("v_catalog_verification_status public.shopping_catalogs.verification_status%type;", sql)
        self.assertIn("if v_catalog_candidate or v_product_promotion_candidate then", sql)
        self.assertIn("if v_product_promotion_candidate then", sql)
        self.assertIn("if v_product_promotion_candidate and v_candidate.commune is not null", sql)

    def test_migration_skips_store_location_upsert_when_commune_is_missing(self):
        sql = self._normalized_sql()
        self.assertIn("v_candidate.commune is not null", sql)
        self.assertNotIn("if v_candidate.content_kind = 'promotion' and nullif(btrim(coalesce(v_candidate.retailer_slug, '')), '') is not null then", sql)

    def test_migration_updates_candidate_only_after_successful_publication(self):
        sql = self._normalized_sql()
        self.assertIn("update public.good_deal_candidates set status = 'published'", sql)
        self.assertIn("published_good_deal_id = v_good_deal_id", sql)
        self.assertIn("reviewed_at = v_now", sql)
        self.assertIn("rejection_reason = null", sql)


if __name__ == "__main__":
    unittest.main()
