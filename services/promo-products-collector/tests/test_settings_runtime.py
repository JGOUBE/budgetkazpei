from __future__ import annotations

import os
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

import app.settings as settings_module
from app.settings import Settings


class SettingsRuntimeTests(unittest.TestCase):
    @contextmanager
    def _patched_env(self, **overrides: str):
        managed_keys = {
            "PROMO_RUNTIME_ROOT",
            "PROMO_COLLECTOR_TEMP_DIR",
            "PROMO_REPORT_PATH",
            "PROMO_LAYOUT_REPORT_PATH",
            "PROMO_VISION_REPORT_PATH",
            "PROMO_VISION_CHECKPOINT_LOCAL_ROOT",
            "PROMO_VISION_CHECKPOINT_BACKEND",
            "PROMO_VISION_CHECKPOINT_BUCKET",
            "PROMO_VISION_CHECKPOINT_PREFIX",
        }
        managed_keys.update(overrides.keys())
        original = {key: os.environ.get(key) for key in managed_keys}
        try:
            for key in managed_keys:
                os.environ.pop(key, None)
            for key, value in overrides.items():
                os.environ[key] = value
            yield
        finally:
            for key in managed_keys:
                os.environ.pop(key, None)
            for key, value in original.items():
                if value is not None:
                    os.environ[key] = value

    def test_from_env_uses_repo_root_on_windows_tree(self):
        with self._patched_env():
            settings = Settings.from_env()

        repo_root = Path(__file__).resolve().parents[3]
        self.assertEqual(settings.report_path, repo_root / "reports" / "promo-products-eleclerc-26runrdc-pages-1-3.json")
        self.assertEqual(
            settings.vision_checkpoint_local_root,
            repo_root / "reports" / "promo-products-eleclerc-vision-benchmark-checkpoints",
        )
        self.assertEqual(
            settings.ocr_python_executable,
            repo_root / "services" / "receipt-scanner" / ".venv" / "Scripts" / "python.exe",
        )

    def test_from_env_falls_back_to_temp_runtime_root_in_container(self):
        container_settings_file = Path("/app/app/settings.py")
        temp_root = Path(tempfile.gettempdir()) / "budgetkazpei-promo-products"
        with self._patched_env():
            with patch.object(settings_module, "__file__", str(container_settings_file)):
                settings = Settings.from_env()

        self.assertEqual(
            settings.report_path,
            temp_root / "reports" / "promo-products-eleclerc-26runrdc-pages-1-3.json",
        )
        self.assertEqual(
            settings.layout_report_path,
            temp_root / "reports" / "promo-products-eleclerc-26runrdc-layouts.json",
        )
        self.assertEqual(
            settings.vision_report_path,
            temp_root / "reports" / "promo-products-eleclerc-vision-benchmark.json",
        )
        self.assertEqual(
            settings.vision_checkpoint_local_root,
            temp_root / "reports" / "promo-products-eleclerc-vision-benchmark-checkpoints",
        )
        self.assertEqual(settings.temp_dir, temp_root / "tmp")

    def test_from_env_honors_explicit_runtime_root(self):
        explicit_root = Path(tempfile.gettempdir()) / "promo-runtime-root-explicit"
        with self._patched_env(PROMO_RUNTIME_ROOT=str(explicit_root)):
            with patch.object(settings_module, "__file__", "/app/app/settings.py"):
                settings = Settings.from_env()

        self.assertEqual(settings.report_path, explicit_root / "reports" / "promo-products-eleclerc-26runrdc-pages-1-3.json")
        self.assertEqual(settings.layout_report_path, explicit_root / "reports" / "promo-products-eleclerc-26runrdc-layouts.json")
        self.assertEqual(settings.vision_report_path, explicit_root / "reports" / "promo-products-eleclerc-vision-benchmark.json")
        self.assertEqual(
            settings.vision_checkpoint_local_root,
            explicit_root / "reports" / "promo-products-eleclerc-vision-benchmark-checkpoints",
        )
        self.assertEqual(settings.temp_dir, explicit_root / "tmp")

    def test_from_env_keeps_valid_report_and_checkpoint_paths_for_gcs_mode(self):
        explicit_root = Path(tempfile.gettempdir()) / "promo-runtime-root-gcs"
        with self._patched_env(
            PROMO_RUNTIME_ROOT=str(explicit_root),
            PROMO_VISION_CHECKPOINT_BACKEND="gcs",
            PROMO_VISION_CHECKPOINT_BUCKET="budgetkazpei_cloudbuild",
            PROMO_VISION_CHECKPOINT_PREFIX="promo-vision-benchmark",
        ):
            with patch.object(settings_module, "__file__", "/app/app/settings.py"):
                settings = Settings.from_env()

        self.assertEqual(settings.vision_checkpoint_backend, "gcs")
        self.assertEqual(settings.vision_checkpoint_bucket, "budgetkazpei_cloudbuild")
        self.assertEqual(settings.vision_checkpoint_prefix, "promo-vision-benchmark")
        self.assertTrue(settings.report_path.parent.is_absolute())
        self.assertTrue(settings.layout_report_path.parent.is_absolute())
        self.assertTrue(settings.vision_report_path.parent.is_absolute())
        self.assertTrue(settings.vision_checkpoint_local_root.is_absolute())


if __name__ == "__main__":
    unittest.main()
