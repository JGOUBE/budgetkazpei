from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[3]
MIGRATION = ROOT / "supabase" / "migrations" / "202607290001_retail_price_staging_and_publication.sql"


class RetailPriceStagingMigrationContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8").lower()

    def test_wraps_everything_in_a_transaction(self):
        self.assertIn("begin;", self.sql)
        self.assertIn("commit;", self.sql)

    def test_creates_generic_staging_and_history_tables(self):
        self.assertIn("create table if not exists public.retail_price_candidates", self.sql)
        self.assertIn("create table if not exists public.retail_price_observations", self.sql)
        self.assertIn("published_price_observation_id uuid null", self.sql)
        self.assertIn("published_promotion_id uuid null", self.sql)
        self.assertIn("first_seen_at timestamptz not null", self.sql)
        self.assertIn("last_seen_at timestamptz not null", self.sql)

    def test_enforces_expected_statuses_and_price_types(self):
        for value in (
            "imported",
            "matched",
            "needs_review",
            "approved_price",
            "approved_promotion",
            "rejected",
            "duplicate",
            "published",
        ):
            self.assertIn(f"'{value}'", self.sql)
        for value in ("observed_price", "promotion", "receipt_price"):
            self.assertIn(f"'{value}'", self.sql)

    def test_separates_price_and_promotion_publication_paths(self):
        self.assertIn("create or replace function public.retail_publish_price_candidates", self.sql)
        self.assertIn("create or replace function public.retail_publish_promotion_candidates", self.sql)
        self.assertIn("public.retail_upsert_price_observation", self.sql)
        self.assertIn("public.retail_resolve_or_create_shopping_product", self.sql)
        self.assertIn("promotion_proven is not true", self.sql)

    def test_restricts_staging_access_to_admins_and_service_role(self):
        self.assertIn("revoke all on table public.retail_price_candidates from public, anon, authenticated;", self.sql)
        self.assertIn("grant all on table public.retail_price_candidates to postgres, service_role;", self.sql)
        self.assertIn('create policy "retail candidates admin read"', self.sql)
        self.assertIn('create policy "retail candidates admin update"', self.sql)
        self.assertIn("using (public.good_deals_is_admin())", self.sql)
        self.assertIn("retail import requires the service role", self.sql)
        self.assertIn("retail cleanup preview requires an administrator account", self.sql)

    def test_exposes_private_review_views_for_admin_ui(self):
        self.assertIn("create view public.retail_price_candidates_review", self.sql)
        self.assertIn("create view public.retail_price_candidate_runs_review", self.sql)
        self.assertIn("matched_market_product_name", self.sql)
        self.assertIn("matched_shopping_product_name", self.sql)

    def test_avoids_forbidden_destructive_business_changes(self):
        forbidden_tokens = [
            "drop table",
            "truncate ",
            " cascade",
            "alter policy",
            "create scheduler",
        ]
        for token in forbidden_tokens:
            self.assertNotIn(token, self.sql)
        self.assertIsNone(re.search(r"\bdelete\s+from\b", self.sql))


if __name__ == "__main__":
    unittest.main()
