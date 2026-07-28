from pathlib import Path
import json
import tempfile
import unittest

from app.extractors.catalog_product_ocr import OcrLine, OcrPage
from app.main import BinaryDocument, TextDocument, run_product_extraction
from app.models.promotion_candidate import BoundingBox
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

    def fetch_text(self, url: str, *, allowed_hosts, settings) -> TextDocument:
        return TextDocument(url=url, content_type="text/html", text=self.text_map[url])

    def fetch_asset_metadata(self, url: str, *, allowed_hosts, settings):
        raise AssertionError("snapshot metadata flow not expected in product extraction test")

    def fetch_binary(self, url: str, *, allowed_hosts, settings) -> BinaryDocument:
        return BinaryDocument(url=url, content_type="image/webp", content=b"fake-image")


class _FakeOcrClient:
    def analyze_image(self, image_path: Path, *, page_number: int) -> OcrPage:
        examples = {
            1: ["PATES 500 g", "1,29"],
            2: ["JUS ORANGE 1 l", "1,89", "0,40 ticket E.Leclerc"],
            3: ["PATES 500 g", "1,29"],
        }
        lines = [
            OcrLine(
                id=index,
                text=text,
                score=0.96,
                bounding_box=BoundingBox(left=40, top=60 + (index * 36), width=220, height=28),
                fragments=[text],
            )
            for index, text in enumerate(examples[page_number])
        ]
        return OcrPage(
            source=str(image_path),
            page_number=page_number,
            image_width=1000,
            image_height=1600,
            elapsed_seconds=0.2,
            engine="synthetic",
            lines=lines,
        )


class ProductExtractionPipelineTests(unittest.TestCase):
    def test_writes_local_report_and_cleans_temporary_files(self):
        temp_root = Path(tempfile.gettempdir()) / "budgetkazpei-promo-products-pipeline-tests"
        report_path = temp_root / "report.json"
        temp_dir = temp_root / "runtime"
        if temp_root.exists():
            for item in sorted(temp_root.rglob("*"), reverse=True):
                if item.is_file():
                    item.unlink()
                elif item.is_dir():
                    item.rmdir()

        settings = Settings.from_env().with_overrides(max_catalogs=1, max_pages=3, report_path=report_path)
        object.__setattr__(settings, "temp_dir", temp_dir)

        report = run_product_extraction(
            settings,
            fetcher=_FakeFetcher(),
            ocr_client=_FakeOcrClient(),
        )

        self.assertTrue(report_path.is_file())
        payload = json.loads(report_path.read_text(encoding="utf-8"))
        self.assertEqual(payload["catalogue"]["pages_processed"], [1, 2, 3])
        self.assertEqual(report.ai_consumption, 0)
        self.assertEqual(report.temporary_files_remaining, 0)
        self.assertEqual(report.duplicate_cross_page, 1)
        self.assertFalse(temp_dir.exists())


if __name__ == "__main__":
    unittest.main()
