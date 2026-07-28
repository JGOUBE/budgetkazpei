from pathlib import Path
import json
import tempfile
import unittest

from app.extractors.catalog_product_ocr import OcrLine, OcrPage
from app.extractors.catalog_page_regions import PageRegion
from app.models.promotion_candidate import BoundingBox
from app.services.vision_benchmark import (
    VisionBoundingBox,
    VisionBudgetController,
    VisionClientResponse,
    VisionOffer,
    VisionSlice,
    build_strategy_b_tile_boxes,
    dedupe_overlap_offers,
    _build_benchmark_run_id,
    _plan_strategy_c_regions,
    run_vision_benchmark,
    translate_offer_to_page_coordinates,
    validate_vision_response_payload,
)
from app.settings import Settings


FIXTURES = Path(__file__).resolve().parent / "fixtures"


class _FakeFetcher:
    def __init__(self) -> None:
        official_html = (FIXTURES / "eleclerc_official_page.html").read_text(encoding="utf-8")
        viewer_html = (FIXTURES / "fliphtml5_viewer.html").read_text(encoding="utf-8")
        config_js = (FIXTURES / "fliphtml5_config.js").read_text(encoding="utf-8")
        self.text_map = {
            "https://www.e-leclerc.re/index.php/page/catalogues-reunion": official_html,
            "https://www.e-leclerc.re/public/catalogues/26runRDC": viewer_html,
            "https://www.e-leclerc.re/public/catalogues/26runRDC/javascript/config.js?v=1783601891210": config_js,
        }

    def fetch_text(self, url: str, *, allowed_hosts, settings):
        return type("TextDoc", (), {"url": url, "content_type": "text/html", "text": self.text_map[url]})()

    def fetch_binary(self, url: str, *, allowed_hosts, settings):
        return type("BinaryDoc", (), {"url": url, "content_type": "image/png", "content": b"fake"})()


class _FakeOcrClient:
    def analyze_image(self, image_path: Path, *, page_number: int, max_dimension: int | None = None) -> OcrPage:
        lines = [
            OcrLine(
                id=0,
                text="STYLO BLEU 4 x 1",
                score=0.95,
                bounding_box=BoundingBox(left=40, top=50, width=240, height=28),
                fragments=["STYLO BLEU 4 x 1"],
            ),
            OcrLine(
                id=1,
                text="1,99",
                score=0.95,
                bounding_box=BoundingBox(left=80, top=100, width=90, height=28),
                fragments=["1,99"],
            ),
        ]
        return OcrPage(
            source=str(image_path),
            page_number=page_number,
            image_width=1000,
            image_height=1600,
            elapsed_seconds=0.1,
            engine="synthetic",
            lines=lines,
        )


class _FakeVisionClient:
    def __init__(self) -> None:
        self.call_count = 0

    def extract_offers(self, *, image_path: Path, prompt: str) -> VisionClientResponse:
        del image_path, prompt
        self.call_count += 1
        payload = {
            "offers": [
                {
                    "page_number": 1,
                    "bounding_box": {"left": 10, "top": 20, "width": 100, "height": 140},
                    "product_name": "Stylo bleu",
                    "brand": "Bic",
                    "package_format": "lot de 4",
                    "quantity_value": 4,
                    "quantity_unit": "unit",
                    "promo_price": 1.99,
                    "original_price": None,
                    "unit_price": None,
                    "unit_price_unit": None,
                    "loyalty_amount": None,
                    "loyalty_type": None,
                    "discount_percent": None,
                    "offer_mechanism": "simple_price",
                    "conditions": None,
                    "confidence": 88,
                    "visual_evidence_notes": "price near product",
                }
            ]
        }
        return VisionClientResponse(
            payload=payload,
            duration_seconds=0.12,
            input_tokens=100,
            output_tokens=40,
            total_tokens=140,
            estimated_cost_eur=0.002,
            model="fake-model",
            provider="fake",
        )


class _FailingVisionClient:
    def extract_offers(self, *, image_path: Path, prompt: str) -> VisionClientResponse:
        raise AssertionError("vision client should not be called when checkpoints already exist")


class _FakeImageRuntime:
    def create_tile_slices(self, *, source_image_path: Path, page_number: int, page_width: int, page_height: int, overlap_percent: int, output_dir: Path):
        del page_width, page_height, overlap_percent
        output_dir.mkdir(parents=True, exist_ok=True)
        results = []
        for index in range(2):
            image_path = output_dir / f"tile-{index + 1}.png"
            image_path.write_bytes(source_image_path.read_bytes())
            results.append(
                VisionSlice(
                    slice_id=f"tile-{page_number}-{index + 1}",
                    page_number=page_number,
                    strategy="B",
                    image_path=image_path,
                    origin_left=index * 100,
                    origin_top=0,
                    width=400,
                    height=400,
                    metadata={},
                )
            )
        return results

    def create_anchor_crop_slices(self, *, source_image_path: Path, page_number: int, page_width: int, page_height: int, regions, output_dir: Path):
        del page_width, page_height, regions
        output_dir.mkdir(parents=True, exist_ok=True)
        image_path = output_dir / "crop-1.png"
        image_path.write_bytes(source_image_path.read_bytes())
        return [
            VisionSlice(
                slice_id=f"crop-{page_number}-1",
                page_number=page_number,
                strategy="C",
                image_path=image_path,
                origin_left=20,
                origin_top=30,
                width=300,
                height=240,
                metadata={},
            )
        ]


class VisionBenchmarkTests(unittest.TestCase):
    def test_validation_rejects_unknown_fields(self):
        with self.assertRaises(ValueError):
            validate_vision_response_payload(
                {
                    "offers": [
                        {
                            "page_number": 1,
                            "bounding_box": {"left": 0, "top": 0, "width": 10, "height": 10},
                            "product_name": "A",
                            "brand": None,
                            "package_format": None,
                            "quantity_value": None,
                            "quantity_unit": None,
                            "promo_price": 1.0,
                            "original_price": None,
                            "unit_price": None,
                            "unit_price_unit": None,
                            "loyalty_amount": None,
                            "loyalty_type": None,
                            "discount_percent": None,
                            "offer_mechanism": "simple_price",
                            "conditions": None,
                            "confidence": 80,
                            "visual_evidence_notes": None,
                            "extra": "forbidden",
                        }
                    ]
                },
                expected_page_number=1,
            )

    def test_validation_keeps_loyalty_distinct_from_price(self):
        offers = validate_vision_response_payload(
            {
                "offers": [
                    {
                        "page_number": 1,
                        "bounding_box": {"left": 5, "top": 10, "width": 40, "height": 60},
                        "product_name": "Cahier",
                        "brand": None,
                        "package_format": "96 pages",
                        "quantity_value": None,
                        "quantity_unit": None,
                        "promo_price": 2.49,
                        "original_price": None,
                        "unit_price": None,
                        "unit_price_unit": None,
                        "loyalty_amount": 0.5,
                        "loyalty_type": "ticket_e_leclerc",
                        "discount_percent": None,
                        "offer_mechanism": "loyalty_credit",
                        "conditions": None,
                        "confidence": 91,
                        "visual_evidence_notes": "ticket clearly separated from paid price",
                    }
                ]
            },
            expected_page_number=1,
        )
        self.assertEqual(offers[0].promo_price, 2.49)
        self.assertEqual(offers[0].loyalty_amount, 0.5)

    def test_translate_tile_coordinates_to_page_coordinates(self):
        offer = VisionOffer(
            page_number=1,
            bounding_box=VisionBoundingBox(left=10, top=15, width=80, height=100),
            product_name="Stylo",
            brand=None,
            package_format="lot",
            quantity_value=None,
            quantity_unit=None,
            promo_price=1.99,
            original_price=None,
            unit_price=None,
            unit_price_unit=None,
            loyalty_amount=None,
            loyalty_type=None,
            discount_percent=None,
            offer_mechanism="simple_price",
            conditions=None,
            confidence=75,
            visual_evidence_notes=None,
        )
        translated = translate_offer_to_page_coordinates(offer, offset_left=120, offset_top=45)
        self.assertEqual(translated.bounding_box.left, 130)
        self.assertEqual(translated.bounding_box.top, 60)

    def test_overlap_dedupe_requires_matching_signature(self):
        offer_a = VisionOffer(
            page_number=1,
            bounding_box=VisionBoundingBox(left=10, top=10, width=100, height=100),
            product_name="Stylo bleu",
            brand=None,
            package_format="lot",
            quantity_value=None,
            quantity_unit=None,
            promo_price=1.99,
            original_price=None,
            unit_price=None,
            unit_price_unit=None,
            loyalty_amount=None,
            loyalty_type=None,
            discount_percent=None,
            offer_mechanism="simple_price",
            conditions=None,
            confidence=70,
            visual_evidence_notes=None,
        )
        offer_b = VisionOffer(
            page_number=1,
            bounding_box=VisionBoundingBox(left=20, top=20, width=100, height=100),
            product_name="Stylo voisin",
            brand=None,
            package_format="lot",
            quantity_value=None,
            quantity_unit=None,
            promo_price=2.49,
            original_price=None,
            unit_price=None,
            unit_price_unit=None,
            loyalty_amount=None,
            loyalty_type=None,
            discount_percent=None,
            offer_mechanism="simple_price",
            conditions=None,
            confidence=80,
            visual_evidence_notes=None,
        )
        deduped, duplicates = dedupe_overlap_offers([offer_a, offer_b])
        self.assertEqual(len(deduped), 2)
        self.assertEqual(duplicates, 0)

    def test_max_calls_limit_and_budget_stop(self):
        controller = VisionBudgetController(max_calls=1, max_cost_eur=0.003)
        controller.ensure_can_call()
        controller.register(estimated_cost_eur=0.002)
        with self.assertRaises(RuntimeError):
            controller.ensure_can_call()

        budget_only = VisionBudgetController(max_calls=5, max_cost_eur=0.001)
        budget_only.ensure_can_call()
        with self.assertRaises(RuntimeError):
            budget_only.register(estimated_cost_eur=0.002)

    def test_vision_disabled_by_default(self):
        settings = Settings.from_env()
        self.assertFalse(settings.vision_enabled)

    def test_strategy_b_uses_overlap(self):
        boxes = build_strategy_b_tile_boxes(page_width=1000, page_height=1600, overlap_percent=10)
        self.assertEqual(len(boxes), 4)
        _, _, first = boxes[0]
        _, _, second = boxes[1]
        self.assertGreater(first.right, second.left)

    def test_run_cleans_temp_crops_and_writes_report(self):
        temp_root = Path(tempfile.gettempdir()) / "budgetkazpei-promo-vision-tests"
        if temp_root.exists():
            for item in sorted(temp_root.rglob("*"), reverse=True):
                if item.is_file():
                    item.unlink()
                elif item.is_dir():
                    item.rmdir()

        report_path = temp_root / "vision-report.json"
        runtime_dir = temp_root / "runtime"
        settings = Settings.from_env().with_overrides(
            max_catalogs=1,
            target_catalog_slug="26runRDC",
            selected_page_numbers=(1, 2, 3),
            vision_report_path=report_path,
        )
        object.__setattr__(settings, "vision_enabled", True)
        object.__setattr__(settings, "vision_provider", "fake")
        object.__setattr__(settings, "vision_model", "fake-model")
        object.__setattr__(settings, "vision_max_pages", 3)
        object.__setattr__(settings, "vision_max_calls", 20)
        object.__setattr__(settings, "vision_max_cost_eur", None)
        object.__setattr__(settings, "temp_dir", runtime_dir)

        report = run_vision_benchmark(
            settings,
            fetcher=_FakeFetcher(),
            ocr_client=_FakeOcrClient(),
            vision_client=_FakeVisionClient(),
            image_runtime=_FakeImageRuntime(),
        )

        self.assertTrue(report_path.is_file())
        payload = json.loads(report_path.read_text(encoding="utf-8"))
        self.assertEqual(payload["catalogue"]["pages_processed"], [1, 2, 3])
        self.assertEqual(report.temporary_files_remaining, 0)
        self.assertFalse(runtime_dir.exists())

    def test_run_writes_checkpoint_files_and_aggregate_report(self):
        temp_root = Path(tempfile.gettempdir()) / "budgetkazpei-promo-vision-checkpoint-tests"
        if temp_root.exists():
            for item in sorted(temp_root.rglob("*"), reverse=True):
                if item.is_file():
                    item.unlink()
                elif item.is_dir():
                    item.rmdir()

        report_path = temp_root / "local-report.json"
        checkpoint_root = temp_root / "checkpoint-root"
        runtime_dir = temp_root / "runtime"
        settings = Settings.from_env().with_overrides(
            max_catalogs=1,
            target_catalog_slug="26runRDC",
            selected_page_numbers=(1, 2, 3),
            vision_report_path=report_path,
        )
        object.__setattr__(settings, "vision_enabled", True)
        object.__setattr__(settings, "vision_provider", "fake")
        object.__setattr__(settings, "vision_model", "fake-model")
        object.__setattr__(settings, "vision_max_pages", 3)
        object.__setattr__(settings, "vision_max_calls", 20)
        object.__setattr__(settings, "vision_max_cost_eur", None)
        object.__setattr__(settings, "vision_checkpoint_backend", "local")
        object.__setattr__(settings, "vision_checkpoint_local_root", checkpoint_root)
        object.__setattr__(settings, "temp_dir", runtime_dir)

        client = _FakeVisionClient()
        report = run_vision_benchmark(
            settings,
            fetcher=_FakeFetcher(),
            ocr_client=_FakeOcrClient(),
            vision_client=client,
            image_runtime=_FakeImageRuntime(),
        )

        run_root = checkpoint_root / _build_benchmark_run_id(settings)
        checkpoint_files = sorted((run_root / "checkpoints").glob("page-*-strategy-*.json"))
        self.assertEqual(len(checkpoint_files), 9)
        aggregate_payload = json.loads((run_root / "vision-benchmark-report.json").read_text(encoding="utf-8"))
        self.assertEqual(aggregate_payload["total_calls"], report.total_calls)
        first_checkpoint = json.loads(checkpoint_files[0].read_text(encoding="utf-8"))
        self.assertEqual(first_checkpoint["status"], "completed")
        self.assertIsInstance(first_checkpoint["result"], dict)
        self.assertEqual(client.call_count, report.total_calls)

    def test_run_resumes_without_new_vision_calls_when_checkpoints_exist(self):
        temp_root = Path(tempfile.gettempdir()) / "budgetkazpei-promo-vision-resume-tests"
        if temp_root.exists():
            for item in sorted(temp_root.rglob("*"), reverse=True):
                if item.is_file():
                    item.unlink()
                elif item.is_dir():
                    item.rmdir()

        report_path = temp_root / "local-report.json"
        checkpoint_root = temp_root / "checkpoint-root"
        runtime_dir = temp_root / "runtime"
        settings = Settings.from_env().with_overrides(
            max_catalogs=1,
            target_catalog_slug="26runRDC",
            selected_page_numbers=(1, 2, 3),
            vision_report_path=report_path,
        )
        object.__setattr__(settings, "vision_enabled", True)
        object.__setattr__(settings, "vision_provider", "fake")
        object.__setattr__(settings, "vision_model", "fake-model")
        object.__setattr__(settings, "vision_max_pages", 3)
        object.__setattr__(settings, "vision_max_calls", 20)
        object.__setattr__(settings, "vision_max_cost_eur", None)
        object.__setattr__(settings, "vision_checkpoint_backend", "local")
        object.__setattr__(settings, "vision_checkpoint_local_root", checkpoint_root)
        object.__setattr__(settings, "temp_dir", runtime_dir)

        first_client = _FakeVisionClient()
        first_report = run_vision_benchmark(
            settings,
            fetcher=_FakeFetcher(),
            ocr_client=_FakeOcrClient(),
            vision_client=first_client,
            image_runtime=_FakeImageRuntime(),
        )
        second_report = run_vision_benchmark(
            settings,
            fetcher=_FakeFetcher(),
            ocr_client=_FakeOcrClient(),
            vision_client=_FailingVisionClient(),
            image_runtime=_FakeImageRuntime(),
        )

        self.assertEqual(first_report.total_calls, second_report.total_calls)
        self.assertEqual(second_report.total_calls, 12)
        self.assertEqual(first_client.call_count, 12)

    def test_strategy_c_planner_caps_regions_to_remaining_budget(self):
        def region(page_number: int, region_id: str, score: int) -> PageRegion:
            return PageRegion(
                page_number=page_number,
                region_id=region_id,
                bounding_box=BoundingBox(left=10, top=20, width=120, height=140),
                lines=[],
                column_index=0,
                layout_type="mixed_layout",
                price_anchor_count=1,
                segmentation_confidence=score,
                price_product_distance=20.0,
                overlapping_region_count=0,
            )

        planned = _plan_strategy_c_regions(
            page_regions={
                11: [region(11, "p011-r001", 90), region(11, "p011-r002", 80)],
                12: [region(12, "p012-r001", 88), region(12, "p012-r002", 78)],
                15: [region(15, "p015-r001", 86), region(15, "p015-r002", 76)],
            },
            page_numbers=[11, 12, 15],
            existing_records={},
            max_calls=20,
        )

        total_regions = sum(len(items) for items in planned.values())
        self.assertEqual(total_regions, 5)
        self.assertGreaterEqual(len(planned[11]), 1)
        self.assertGreaterEqual(len(planned[12]), 1)
        self.assertGreaterEqual(len(planned[15]), 1)


if __name__ == "__main__":
    unittest.main()
