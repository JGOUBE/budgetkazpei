from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from statistics import median
from typing import Any, Protocol

from app.models.promotion_candidate import BoundingBox


@dataclass(frozen=True)
class OcrLine:
    id: int
    text: str
    score: float
    bounding_box: BoundingBox
    fragments: list[str]

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "text": self.text,
            "score": round(self.score, 4),
            "bounding_box": self.bounding_box.to_dict(),
            "fragments": list(self.fragments),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "OcrLine":
        box = data["bounding_box"]
        return cls(
            id=int(data["id"]),
            text=str(data["text"]),
            score=float(data["score"]),
            bounding_box=BoundingBox(
                left=float(box["left"]),
                top=float(box["top"]),
                width=float(box["width"]),
                height=float(box["height"]),
            ),
            fragments=[str(item) for item in data.get("fragments", [])],
        )


@dataclass(frozen=True)
class OcrPage:
    source: str
    page_number: int
    image_width: int
    image_height: int
    elapsed_seconds: float
    engine: str
    lines: list[OcrLine]

    def to_dict(self) -> dict[str, object]:
        return {
            "source": self.source,
            "page_number": self.page_number,
            "image_width": self.image_width,
            "image_height": self.image_height,
            "elapsed_seconds": round(self.elapsed_seconds, 3),
            "engine": self.engine,
            "lines": [line.to_dict() for line in self.lines],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "OcrPage":
        return cls(
            source=str(data["source"]),
            page_number=int(data.get("page_number", 0)),
            image_width=int(data["image_width"]),
            image_height=int(data["image_height"]),
            elapsed_seconds=float(data["elapsed_seconds"]),
            engine=str(data.get("engine", "rapidocr-onnxruntime")),
            lines=[OcrLine.from_dict(item) for item in data.get("lines", [])],
        )

    @classmethod
    def load_json(cls, path: str | Path) -> "OcrPage":
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))


class CatalogProductOcr(Protocol):
    def analyze_image(self, image_path: Path, *, page_number: int, max_dimension: int | None = None) -> OcrPage: ...


class RapidOcrCliClient:
    def __init__(
        self,
        *,
        python_executable: Path,
        service_root: Path | None = None,
    ) -> None:
        self.python_executable = Path(python_executable)
        self.service_root = service_root or Path(__file__).resolve().parents[2]

    def analyze_image(self, image_path: Path, *, page_number: int, max_dimension: int | None = None) -> OcrPage:
        if not self.python_executable.is_file():
            raise RuntimeError(
                "Local OCR runtime is unavailable: expected receipt-scanner venv python "
                f"at {self.python_executable}"
            )

        with tempfile.NamedTemporaryFile(
            suffix=".json",
            delete=False,
            dir=image_path.parent,
        ) as handle:
            output_path = Path(handle.name)

        command = [
            str(self.python_executable),
            "-m",
            "app.extractors.catalog_product_ocr",
            "--image",
            str(image_path),
            "--output",
            str(output_path),
            "--page-number",
            str(page_number),
        ]
        if max_dimension is not None and max_dimension > 0:
            command.extend(["--max-dimension", str(max_dimension)])

        try:
            completed = subprocess.run(
                command,
                cwd=self.service_root,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=True,
            )
            if completed.stdout.strip():
                output_path.write_text(completed.stdout, encoding="utf-8")
            return OcrPage.load_json(output_path)
        except subprocess.CalledProcessError as exc:  # pragma: no cover - exercised in real run only
            detail = exc.stderr.strip() or exc.stdout.strip() or "unknown OCR failure"
            raise RuntimeError(f"local_ocr_failed:{detail}") from exc
        finally:
            output_path.unlink(missing_ok=True)


def _merge_boxes(boxes: list[BoundingBox]) -> BoundingBox:
    merged = boxes[0]
    for box in boxes[1:]:
        merged = merged.union(box)
    return merged


def _reconstruct_lines(fragments: list[dict[str, object]]) -> list[OcrLine]:
    if not fragments:
        return []

    heights = [float(item["box"].height) for item in fragments if float(item["box"].height) > 0]
    tolerance = max(8.0, min((median(heights) if heights else 18.0) * 0.45, 28.0))

    clusters: list[list[dict[str, object]]] = []
    for fragment in sorted(
        fragments,
        key=lambda item: (float(item["box"].center_y), float(item["box"].left)),
    ):
        best_index: int | None = None
        best_distance = float("inf")
        center_y = float(item_box(fragment).center_y)
        for index, cluster in enumerate(clusters):
            cluster_center = median(item_box(entry).center_y for entry in cluster)
            distance = abs(center_y - cluster_center)
            if distance <= tolerance and distance < best_distance:
                best_distance = distance
                best_index = index
        if best_index is None:
            clusters.append([fragment])
        else:
            clusters[best_index].append(fragment)

    lines: list[OcrLine] = []
    for line_id, cluster in enumerate(clusters):
        cluster.sort(key=lambda item: (float(item["box"].left), str(item["text"])))
        boxes = [item_box(item) for item in cluster]
        text = " ".join(str(item["text"]).strip() for item in cluster if str(item["text"]).strip())
        if not text:
            continue
        score = sum(float(item["score"]) for item in cluster) / len(cluster)
        lines.append(
            OcrLine(
                id=line_id,
                text=text,
                score=score,
                bounding_box=_merge_boxes(boxes),
                fragments=[str(item["text"]).strip() for item in cluster if str(item["text"]).strip()],
            )
        )
    return lines


def item_box(item: dict[str, object]) -> BoundingBox:
    return item["box"]  # type: ignore[return-value]


def _cli_analyze_image(image_path: Path, *, page_number: int, max_dimension: int | None = None) -> OcrPage:
    from PIL import Image
    from rapidocr import RapidOCR

    if not image_path.is_file():
        raise FileNotFoundError(f"Image not found: {image_path}")

    ocr_input_path = image_path
    temp_resized_path: Path | None = None
    with Image.open(image_path) as image:
        image_width, image_height = image.size
        if max_dimension is not None and max_dimension > 0 and max(image_width, image_height) > max_dimension:
            working = image.copy()
            working.thumbnail((max_dimension, max_dimension))
            image_width, image_height = working.size
            with tempfile.NamedTemporaryFile(suffix=image_path.suffix or ".png", delete=False, dir=image_path.parent) as handle:
                temp_resized_path = Path(handle.name)
            working.save(temp_resized_path)
            ocr_input_path = temp_resized_path

    engine = RapidOCR()
    started_at = time.perf_counter()
    try:
        result = engine(str(ocr_input_path), use_cls=False)
    finally:
        if temp_resized_path is not None:
            temp_resized_path.unlink(missing_ok=True)
    elapsed_seconds = round(time.perf_counter() - started_at, 3)

    fragments: list[dict[str, object]] = []
    if result is not None:
        raw_boxes = getattr(result, "boxes", None)
        raw_texts = getattr(result, "txts", None)
        raw_scores = getattr(result, "scores", None)
        boxes = list(raw_boxes) if raw_boxes is not None else []
        texts = list(raw_texts) if raw_texts is not None else []
        scores = list(raw_scores) if raw_scores is not None else []
        for raw_box, raw_text, raw_score in zip(boxes, texts, scores):
            text = str(raw_text).strip()
            if not text:
                continue
            points = raw_box.tolist() if hasattr(raw_box, "tolist") else raw_box
            xs = [float(point[0]) for point in points]
            ys = [float(point[1]) for point in points]
            fragments.append(
                {
                    "text": text,
                    "score": float(raw_score),
                    "box": BoundingBox(
                        left=min(xs),
                        top=min(ys),
                        width=max(xs) - min(xs),
                        height=max(ys) - min(ys),
                    ),
                }
            )

    return OcrPage(
        source=str(image_path),
        page_number=page_number,
        image_width=int(image_width),
        image_height=int(image_height),
        elapsed_seconds=elapsed_seconds,
        engine="rapidocr-onnxruntime",
        lines=_reconstruct_lines(fragments),
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run local OCR on a catalog page.")
    parser.add_argument("--image", required=True, help="Input image path.")
    parser.add_argument("--output", required=False, help="Optional output JSON path.")
    parser.add_argument("--page-number", type=int, default=0, help="Catalog page number.")
    parser.add_argument("--max-dimension", type=int, default=None, help="Optional max image dimension before OCR.")
    return parser


def main() -> int:
    args = _build_parser().parse_args()
    page = _cli_analyze_image(Path(args.image), page_number=args.page_number, max_dimension=args.max_dimension)
    payload = json.dumps(page.to_dict(), ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(payload, encoding="utf-8")
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
