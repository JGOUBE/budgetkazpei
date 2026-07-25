from pathlib import Path
import unittest


MIGRATION_PATH = Path(__file__).resolve().parents[3] / "supabase" / "migrations" / "202607250001_good_deals_collector.sql"


class MigrationContractTests(unittest.TestCase):
    def test_migration_is_reexecutable_by_construction(self):
        sql = MIGRATION_PATH.read_text(encoding="utf-8")
        self.assertIn("begin;", sql.lower())
        self.assertIn("commit;", sql.lower())
        self.assertIn("create table if not exists public.good_deal_sources", sql.lower())
        self.assertIn("on conflict (slug) do update", sql.lower())

    def test_migration_avoids_destructive_statements(self):
        sql = MIGRATION_PATH.read_text(encoding="utf-8").lower()
        self.assertNotIn("drop table", sql)
        self.assertNotIn("truncate", sql)
        self.assertNotIn("delete from", sql)

    def test_migration_uses_composite_external_key_indexes(self):
        sql = MIGRATION_PATH.read_text(encoding="utf-8").lower()
        self.assertIn("collector_source_slug, external_key", sql)
        self.assertNotIn("on public.shopping_catalogs (external_key)", sql)
        self.assertNotIn("on public.shopping_promotions (external_key)", sql)
        self.assertNotIn("on public.good_deals (external_key)", sql)


if __name__ == "__main__":
    unittest.main()
