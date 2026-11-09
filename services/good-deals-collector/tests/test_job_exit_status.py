from __future__ import annotations

import unittest
from unittest.mock import patch

from app.main import main
from app.models.result import RunSummary


class JobExitStatusTests(unittest.TestCase):
    def test_all_sources_failed_reports_cloud_run_failure_without_retry(self):
        summary = RunSummary(
            run_key="test-all-failed",
            status="completed_with_errors",
            sources_checked=3,
            errors_count=3,
        )
        with patch("sys.argv", ["collector"]), patch("app.main.run", return_value=summary), patch(
            "app.main.configure_logging"
        ), patch("builtins.print"):
            self.assertEqual(main(), 1)

    def test_one_source_failure_does_not_hide_two_successful_checks(self):
        summary = RunSummary(
            run_key="test-partial-success",
            status="completed_with_errors",
            sources_checked=3,
            errors_count=1,
        )
        with patch("sys.argv", ["collector"]), patch("app.main.run", return_value=summary), patch(
            "app.main.configure_logging"
        ), patch("builtins.print"):
            self.assertEqual(main(), 0)

    def test_no_sources_in_test_mode_is_not_an_error(self):
        summary = RunSummary(run_key="test-no-source", status="completed", sources_checked=0)
        with patch("sys.argv", ["collector"]), patch("app.main.run", return_value=summary), patch(
            "app.main.configure_logging"
        ), patch("builtins.print"):
            self.assertEqual(main(), 0)


if __name__ == "__main__":
    unittest.main()
