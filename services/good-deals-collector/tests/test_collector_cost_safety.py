from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class CollectorCostSafetyTests(unittest.TestCase):
    def test_scheduler_requires_explicit_apply_and_resume(self):
        text = (ROOT / "deploy-scheduler.ps1").read_text(encoding="utf-8")
        self.assertIn('[switch]$Apply', text)
        self.assertIn('[switch]$Resume', text)
        self.assertIn('if (-not $Apply)', text)
        self.assertIn('if ($Resume -and -not $Apply)', text)
        self.assertIn('--max-retry-attempts 0', text)
        self.assertNotIn('scheduler jobs create', text)
        self.assertIn('"30 6 4,18 * *"', text)
        self.assertIn('"europe-west1"', text)

    def test_run_trigger_never_claims_manual_without_evidence(self):
        text = (ROOT / "app" / "main.py").read_text(encoding="utf-8")
        self.assertIn('trigger_type: str = "unknown"', text)
        self.assertIn('repositories.start_run(run_key, trigger_type, settings.collector_mode)', text)
        self.assertNotIn('repositories.start_run(run_key, "manual"', text)


if __name__ == "__main__":
    unittest.main()
