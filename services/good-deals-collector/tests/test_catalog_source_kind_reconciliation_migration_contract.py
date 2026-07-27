from pathlib import Path
import unittest


MIGRATION_PATH = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "202607270007_good_deals_catalog_source_kind_reconciliation.sql"
)


class CatalogSourceKindReconciliationMigrationContractTests(unittest.TestCase):
    @staticmethod
    def _normalized() -> str:
        return " ".join(MIGRATION_PATH.read_text(encoding="utf-8").lower().split())

    def test_migration_is_wrapped_in_begin_and_commit(self):
        sql = self._normalized()
        self.assertIn("begin;", sql)
        self.assertIn("commit;", sql)

    def test_migration_recreates_and_validates_only_catalog_source_kind_constraint(self):
        sql = self._normalized()
        self.assertIn("alter table public.shopping_catalogs drop constraint if exists shopping_catalogs_source_kind_check;", sql)
        self.assertIn("alter table public.shopping_catalogs add constraint shopping_catalogs_source_kind_check", sql)
        self.assertIn("alter table public.shopping_catalogs validate constraint shopping_catalogs_source_kind_check;", sql)
        self.assertNotIn("good_deals_publish_candidate", sql)
        self.assertNotIn("shopping_promotions", sql)

    def test_migration_keeps_historical_values_and_adds_collector(self):
        sql = self._normalized()
        expected_values = [
            "'official_catalog'",
            "'official_offer'",
            "'partner_feed'",
            "'collector'",
        ]
        for value in expected_values:
            self.assertIn(value, sql)
        self.assertIn(
            "source_kind in ( 'official_catalog', 'official_offer', 'partner_feed', 'collector' )",
            sql,
        )

    def test_migration_guards_against_unsupported_remote_values(self):
        sql = self._normalized()
        self.assertIn("shopping_catalogs contains an unsupported source_kind", sql)
        self.assertIn("where source_kind not in ( 'official_catalog', 'official_offer', 'partner_feed', 'collector' )", sql)

    def test_migration_avoids_destructive_or_business_data_changes(self):
        sql = self._normalized()
        forbidden = [
            "cascade",
            "delete from",
            "truncate",
            "drop table",
            "update public.shopping_catalogs",
            "alter policy",
            "enable row level security",
            "disable row level security",
            "grant ",
            "revoke ",
        ]
        for pattern in forbidden:
            self.assertNotIn(pattern, sql)


if __name__ == "__main__":
    unittest.main()
