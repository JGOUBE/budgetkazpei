from pathlib import Path
import re
import unittest


MIGRATION_PATH = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "202607270006_good_deals_catalog_collector_source_kind.sql"
)
PUBLISHER_PATH = (
    Path(__file__).resolve().parents[1]
    / "app"
    / "db"
    / "publisher.py"
)
RPC_MIGRATION_PATH = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "202607270005_good_deals_catalog_store_location_guard.sql"
)


class CatalogCollectorSourceKindMigrationContractTests(unittest.TestCase):
    @staticmethod
    def _normalized(path: Path) -> str:
        sql = path.read_text(encoding="utf-8").lower()
        return re.sub(r"\s+", " ", sql).strip()

    def test_migration_is_reexecutable_by_construction(self):
        sql = self._normalized(MIGRATION_PATH)
        self.assertIn("begin;", sql)
        self.assertIn("commit;", sql)
        self.assertIn("drop constraint shopping_catalogs_source_kind_check;", sql)
        self.assertIn("validate constraint shopping_catalogs_source_kind_check;", sql)

    def test_migration_targets_only_shopping_catalogs_source_kind_constraint(self):
        sql = self._normalized(MIGRATION_PATH)
        self.assertIn("public.shopping_catalogs", sql)
        self.assertIn("source_kind", sql)
        self.assertIn("shopping_catalogs_source_kind_check", sql)
        self.assertNotIn("good_deals_publish_candidate", sql)
        self.assertNotIn("shopping_promotions", sql)

    def test_migration_preserves_historical_values_and_adds_collector(self):
        sql = self._normalized(MIGRATION_PATH)
        self.assertIn("'official_catalog'::text", sql)
        self.assertIn("'official_offer'::text", sql)
        self.assertIn("'partner_feed'::text", sql)
        self.assertIn("'collector'::text", sql)
        self.assertRegex(
            sql,
            re.compile(
                r"v_definition <> 'check \(\(source_kind = any \(array\[''official_catalog''::text, ''official_offer''::text, ''partner_feed''::text\]\)\)\)'",
            ),
        )

    def test_migration_avoids_data_changes_and_destructive_patterns(self):
        sql = self._normalized(MIGRATION_PATH)
        forbidden = ["cascade", "drop table", "delete from", "truncate", "update public.shopping_catalogs"]
        for pattern in forbidden:
            self.assertNotIn(pattern, sql)

    def test_publisher_and_rpc_still_use_collector_source_kind(self):
        publisher = self._normalized(PUBLISHER_PATH)
        rpc_sql = self._normalized(RPC_MIGRATION_PATH)
        self.assertIn('"source_kind": "collector"', publisher)
        self.assertIn("source_kind = 'collector'", rpc_sql)
        self.assertIn("source_kind, verification_status", rpc_sql)


if __name__ == "__main__":
    unittest.main()
