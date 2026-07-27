from pathlib import Path
import re
import unittest


MIGRATION_PATH = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "202607270002_good_deals_immediate_publication.sql"
)


class ImmediatePublicationMigrationContractTests(unittest.TestCase):
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

    def test_rpc_is_security_definer_owned_by_postgres_with_restricted_execute(self):
        sql = self._normalized_sql()
        self.assertIn("security definer", sql)
        self.assertIn("set search_path = public, auth", sql)
        self.assertIn("alter function public.good_deals_publish_candidate(uuid) owner to postgres;", sql)
        self.assertIn("revoke all on function public.good_deals_publish_candidate(uuid) from public, anon;", sql)
        self.assertIn("grant execute on function public.good_deals_publish_candidate(uuid) to authenticated, service_role, postgres;", sql)

    def test_rpc_requires_admin_for_authenticated_users_and_locks_candidate_row(self):
        sql = self._normalized_sql()
        self.assertIn("public.good_deals_is_admin()", sql)
        self.assertIn("good deals publication requires an administrator account", sql)
        self.assertIn("for update", sql)

    def test_rpc_is_idempotent_for_existing_publications(self):
        sql = self._normalized_sql()
        self.assertIn("if v_candidate.status = 'published' and v_candidate.published_good_deal_id is not null then", sql)
        self.assertIn("return v_candidate.published_good_deal_id;", sql)

    def test_rpc_updates_candidate_audit_fields_after_success(self):
        sql = self._normalized_sql()
        self.assertIn("status = 'published'", sql)
        self.assertIn("published_good_deal_id = v_good_deal_id", sql)
        self.assertIn("published_at = v_now", sql)
        self.assertIn("reviewed_by = coalesce(v_reviewer, reviewed_by)", sql)
        self.assertIn("reviewed_at = v_now", sql)
        self.assertIn("rejection_reason = null", sql)

    def test_catalog_path_is_separated_from_product_promotion_path(self):
        sql = self._normalized_sql()
        self.assertIn("v_catalog_candidate boolean := false;", sql)
        self.assertIn("v_product_promotion_candidate boolean := false;", sql)
        self.assertIn("lower(tag.value) in ('catalog', 'catalogue')", sql)
        self.assertIn("if v_catalog_candidate or v_product_promotion_candidate then", sql)
        self.assertIn("if v_product_promotion_candidate then", sql)

    def test_rpc_covers_events_permanent_leisure_and_general_good_deals(self):
        sql = self._normalized_sql()
        self.assertIn("when v_candidate.content_kind = 'event' then 'event'", sql)
        self.assertIn("when v_candidate.content_kind = 'permanent_leisure' then 'open'", sql)
        self.assertIn("insert into public.good_deals", sql)
        self.assertIn("insert into public.shopping_catalogs", sql)


if __name__ == "__main__":
    unittest.main()
