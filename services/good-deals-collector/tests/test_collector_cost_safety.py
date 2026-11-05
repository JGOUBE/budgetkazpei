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

    def test_deployment_defaults_to_safe_dry_run_and_bounded_execution(self):
        text = (ROOT / "deploy-job.ps1").read_text(encoding="utf-8")
        self.assertIn("[bool]$DryRun = $true", text)
        self.assertIn("[int]$MaxSources = 7", text)
        self.assertIn("[int]$TaskTimeoutSeconds = 600", text)
        self.assertIn('"--max-retries",', text)
        self.assertIn('"0",', text)
        self.assertIn('"' + '

    def test_run_trigger_never_claims_manual_without_evidence(self):
        text = (ROOT / "app" / "main.py").read_text(encoding="utf-8")
        self.assertIn('trigger_type: str = "unknown"', text)
        self.assertIn('repositories.start_run(run_key, trigger_type, settings.collector_mode)', text)
        self.assertNotIn('repositories.start_run(run_key, "manual"', text)

    def test_artifact_audit_is_read_only(self):
        script = (ROOT.parent.parent / "scripts" / "audit-artifact-registry-readonly.sh").read_text(encoding="utf-8")
        self.assertIn("gcloud artifacts repositories list", script)
        self.assertIn("gcloud artifacts docker images list", script)
        self.assertNotIn("gcloud run jobs execute", script)
        self.assertNotIn("gcloud builds submit", script)
        self.assertNotIn("gcloud artifacts docker images delete", script)
        self.assertNotIn("gcloud artifacts repositories delete", script)


if __name__ == "__main__":
    unittest.main()
 + '{TaskTimeoutSeconds}s",', text)

    def test_run_trigger_never_claims_manual_without_evidence(self):
        text = (ROOT / "app" / "main.py").read_text(encoding="utf-8")
        self.assertIn('trigger_type: str = "unknown"', text)
        self.assertIn('repositories.start_run(run_key, trigger_type, settings.collector_mode)', text)
        self.assertNotIn('repositories.start_run(run_key, "manual"', text)

    def test_artifact_audit_is_read_only(self):
        script = (ROOT.parent.parent / "scripts" / "audit-artifact-registry-readonly.sh").read_text(encoding="utf-8")
        self.assertIn("gcloud artifacts repositories list", script)
        self.assertIn("gcloud artifacts docker images list", script)
        self.assertNotIn("gcloud run jobs execute", script)
        self.assertNotIn("gcloud builds submit", script)
        self.assertNotIn("gcloud artifacts docker images delete", script)
        self.assertNotIn("gcloud artifacts repositories delete", script)


if __name__ == "__main__":
    unittest.main()
