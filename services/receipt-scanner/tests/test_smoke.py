import unittest

from receipt_scanner.smoke import run_smoke_test


class SmokeTest(unittest.TestCase):
    def test_smoke_test_runs(self) -> None:
        result = run_smoke_test()
        self.assertTrue(result["ok"])
        self.assertEqual(result["quality_status"], "trusted")


if __name__ == "__main__":
    unittest.main()
