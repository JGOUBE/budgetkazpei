from pathlib import Path
import re
import unittest


MIGRATION_PATH = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "202607270001_good_deals_collector_service_role_grants.sql"
)


class ServiceRoleGrantsMigrationContractTests(unittest.TestCase):
    @staticmethod
    def _normalized_sql() -> str:
        sql = MIGRATION_PATH.read_text(encoding="utf-8").lower()
        return re.sub(r"\s+", " ", sql).strip()

    def test_migration_grants_minimal_expected_privileges_to_target_tables(self):
        sql = self._normalized_sql()
        expected_statements = [
            (
                "grant select, insert, update on table "
                "public.good_deal_businesses, "
                "public.shopping_store_locations, "
                "public.shopping_products, "
                "public.shopping_catalogs, "
                "public.shopping_promotions, "
                "public.good_deals "
                "to service_role;"
            ),
            (
                "grant select, insert on table "
                "public.shopping_product_aliases "
                "to service_role;"
            ),
        ]

        for statement in expected_statements:
            self.assertIn(statement, sql)

    def test_migration_avoids_broad_or_destructive_privileges_and_data_changes(self):
        sql = self._normalized_sql()
        forbidden_patterns = [
            r"\bgrant\s+all\b",
            r"\ball\s+tables\s+in\s+schema\b",
            r"\bdelete\b",
            r"\btruncate\b",
            r"\bgrant\b[^;]*\bto\s+anon\b",
            r"\bgrant\b[^;]*\bto\s+authenticated\b",
            r"\bdrop\b",
            r"\balter\s+table\b",
            r"\binsert\s+into\b",
            r"\bupdate\s+public\.[a-z0-9_]+\b",
            r"\bdelete\s+from\b",
        ]

        for pattern in forbidden_patterns:
            self.assertIsNone(re.search(pattern, sql), msg=pattern)


if __name__ == "__main__":
    unittest.main()
