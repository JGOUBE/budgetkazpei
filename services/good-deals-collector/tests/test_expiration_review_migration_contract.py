from pathlib import Path
import re
import unittest


MIGRATION_PATH = Path(__file__).resolve().parents[3] / "supabase" / "migrations" / "202607260001_good_deals_expiration_private_review.sql"


class ExpirationReviewMigrationContractTests(unittest.TestCase):
    @staticmethod
    def _review_view_columns() -> list[str]:
        sql = MIGRATION_PATH.read_text(encoding="utf-8")
        match = re.search(
            r"create(?:\s+or\s+replace)?\s+view\s+public\.good_deal_candidates_review\s+"
            r"(?:with\s*\(\s*security_invoker\s*=\s*true\s*\)\s+)?as\s+select(?P<select>.*?)"
            r"from\s+public\.good_deal_candidates\s+c",
            sql,
            re.IGNORECASE | re.DOTALL,
        )
        if not match:
            raise AssertionError("good_deal_candidates_review definition not found")

        columns: list[str] = []
        for raw_line in match.group("select").splitlines():
            line = raw_line.strip().rstrip(",")
            if not line:
                continue
            alias_match = re.search(r"\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*)$", line, re.IGNORECASE)
            if alias_match:
                columns.append(alias_match.group(1))
            else:
                columns.append(line.split(".")[-1])
        return columns

    def test_new_migration_is_reexecutable_by_construction(self):
        sql = MIGRATION_PATH.read_text(encoding="utf-8").lower()
        self.assertIn("begin;", sql)
        self.assertIn("commit;", sql)
        self.assertIn("add column if not exists reviewed_by", sql)
        self.assertIn("create or replace function public.good_deals_is_admin()", sql)
        self.assertIn("create or replace view public.published_good_deals", sql)

    def test_new_migration_avoids_destructive_data_statements(self):
        sql = MIGRATION_PATH.read_text(encoding="utf-8").lower()
        self.assertNotIn("drop table", sql)
        self.assertNotIn("truncate", sql)
        self.assertNotIn("delete from", sql)

    def test_new_migration_protects_private_review_with_profiles_is_admin(self):
        sql = MIGRATION_PATH.read_text(encoding="utf-8").lower()
        self.assertIn("profiles.is_admin", sql.replace("public.", ""))
        self.assertIn("grant select on public.good_deal_candidates_review to authenticated", sql)
        self.assertIn("good_deal_candidates_admin_update", sql)
        self.assertIn("good_deal_source_snapshots_admin_select", sql)
        self.assertIn("good_deal_ingestion_runs_admin_select", sql)
        self.assertIn("create or replace function public.good_deals_protect_profiles_is_admin()", sql)
        self.assertIn("before insert or update on public.profiles", sql)
        self.assertIn("profiles.is_admin cannot be modified by a non-admin user", sql)
        self.assertIn("profiles.is_admin cannot be set to true by a non-admin user", sql)
        self.assertIn("session_user = 'postgres'", sql)
        self.assertIn("v_role = 'service_role'", sql)

    def test_new_migration_hardens_published_view_against_expired_or_unavailable_content(self):
        sql = MIGRATION_PATH.read_text(encoding="utf-8").lower()
        self.assertIn("gd.source_still_available is not false", sql)
        self.assertIn("coalesce(gd.availability_status, 'active') <> 'expired'", sql)
        self.assertIn("(gd.ends_at is null or gd.ends_at >= now())", sql)

    def test_profiles_policies_are_recreated_without_broad_all_command(self):
        sql = MIGRATION_PATH.read_text(encoding="utf-8").lower()
        self.assertIn('drop policy if exists "users can only see their own profile" on public.profiles;', sql)
        self.assertIn('create policy "users can only see their own profile"', sql)
        self.assertIn("for select", sql)
        self.assertNotIn('for all\nto public\n  using (auth.uid() = id);', sql)

    def test_good_deals_is_admin_is_security_definer_with_restricted_execute(self):
        sql = MIGRATION_PATH.read_text(encoding="utf-8").lower()
        self.assertIn("create or replace function public.good_deals_is_admin()", sql)
        self.assertIn("security definer", sql)
        self.assertIn("set search_path = public, auth", sql)
        self.assertIn("alter function public.good_deals_is_admin() owner to postgres;", sql)
        self.assertIn("revoke all on function public.good_deals_is_admin() from public, anon;", sql)
        self.assertIn("grant execute on function public.good_deals_is_admin() to authenticated, service_role, postgres;", sql)

    def test_good_deal_candidates_review_keeps_legacy_columns_first_in_strict_order(self):
        columns = self._review_view_columns()
        self.assertEqual(
            columns[:22],
            [
                "source_slug",
                "source_name",
                "official_domain",
                "title",
                "content_family",
                "content_kind",
                "commune",
                "scope_type",
                "starts_at",
                "ends_at",
                "promo_price",
                "original_price",
                "discount_percent",
                "confidence_score",
                "confidence_reasons",
                "validation_errors",
                "status",
                "source_url",
                "source_page",
                "source_excerpt",
                "detected_at",
                "published_good_deal_id",
            ],
        )
        self.assertEqual(columns[0], "source_slug")

    def test_good_deal_candidates_review_appends_new_columns_after_legacy_block(self):
        columns = self._review_view_columns()
        self.assertEqual(
            columns[22:],
            [
                "id",
                "source_id",
                "snapshot_id",
                "description",
                "business_name",
                "organizer_name",
                "retailer_slug",
                "category",
                "review_notes",
                "rejection_reason",
                "reviewed_by",
                "reviewed_at",
                "rejected_at",
                "updated_at",
            ],
        )
        self.assertNotIn("id", columns[:22])
        self.assertNotIn("source_id", columns[:22])

    def test_good_deal_candidates_review_is_dropped_without_cascade_before_recreation(self):
        sql = MIGRATION_PATH.read_text(encoding="utf-8").lower()
        self.assertIn("drop view if exists public.good_deal_candidates_review;", sql)
        self.assertNotIn("drop view if exists public.good_deal_candidates_review cascade;", sql)


if __name__ == "__main__":
    unittest.main()
