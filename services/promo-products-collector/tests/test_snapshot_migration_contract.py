from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[3]
MIGRATION = ROOT / "supabase" / "migrations" / "202607280001_shopping_catalog_page_snapshots.sql"


class SnapshotMigrationContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8").lower()

    def test_wraps_changes_in_transaction(self):
        self.assertIn("begin;", self.sql)
        self.assertIn("commit;", self.sql)

    def test_creates_snapshot_table_with_expected_fk_and_indexes(self):
        self.assertIn("create table if not exists public.shopping_catalog_page_snapshots", self.sql)
        self.assertIn("catalog_id uuid not null references public.shopping_catalogs(id) on delete cascade", self.sql)
        self.assertIn("create unique index if not exists shopping_catalog_page_snapshots_catalog_page_uk", self.sql)
        self.assertIn("on public.shopping_catalog_page_snapshots (catalog_id, page_number)", self.sql)
        self.assertIn("create index if not exists shopping_catalog_page_snapshots_catalog_sha_idx", self.sql)
        self.assertIn("on public.shopping_catalog_page_snapshots (catalog_id, asset_sha256)", self.sql)

    def test_constrains_status_and_numeric_fields(self):
        self.assertIn("check (page_number > 0)", self.sql)
        self.assertIn("check (asset_size_bytes is null or asset_size_bytes >= 0)", self.sql)
        for value in ("discovered", "unchanged", "pending_extraction", "extracted", "failed", "purged"):
            self.assertIn(f"'{value}'", self.sql)

    def test_restricts_access_to_service_role_and_postgres(self):
        self.assertIn("alter table public.shopping_catalog_page_snapshots enable row level security;", self.sql)
        self.assertIn("revoke all on table public.shopping_catalog_page_snapshots from public, anon, authenticated;", self.sql)
        self.assertIn("grant all on table public.shopping_catalog_page_snapshots to postgres, service_role;", self.sql)
        self.assertIn("create policy shopping_catalog_page_snapshots_service_role_all", self.sql)
        self.assertIn("to service_role", self.sql)

    def test_avoids_business_data_mutations(self):
        forbidden_tokens = [
            "drop table",
            "truncate ",
            "insert into public.shopping_catalogs",
            "update public.shopping_catalogs",
            "insert into public.shopping_promotions",
            "update public.shopping_promotions",
        ]
        for token in forbidden_tokens:
            self.assertNotIn(token, self.sql)
        self.assertIsNone(re.search(r"\bdelete\s+from\b", self.sql))


if __name__ == "__main__":
    unittest.main()
