from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

from PIL import Image
from rapidocr import RapidOCR

from .geometry_types import OCRBox, OCRDocument, OCRToken


class RapidOCREngine:
    """RapidOCR/ONNX wrapper returning normalized geometry objects."""

    def __init__(self, *, use_cls: bool = False) -> None:
        self.use_cls = use_cls
        self._engine: RapidOCR | None = None

    def _get_engine(self) -> RapidOCR:
        if self._engine is None:
            self._engine = RapidOCR()
        return self._engine

    def analyze(
        self,
        image_path: str | Path,
        *,
        source_segment: str = "full",
    ) -> OCRDocument:
        source = Path(image_path)

        if not source.is_file():
            raise FileNotFoundError(f"Image not found: {source}")

        with Image.open(source) as image:
            image_width, image_height = image.size

        engine = self._get_engine()

        started_at = time.perf_counter()
        result = engine(str(source), use_cls=self.use_cls)
        elapsed_seconds = time.perf_counter() - started_at

        # RapidOCR legitimately returns no boxes/texts/scores when the image is
        # unreadable. This is a valid empty OCR result, not a technical crash.
        if result is None:
            boxes: list[Any] = []
            texts: list[Any] = []
            scores: list[Any] = []
        else:
            raw_boxes = getattr(result, "boxes", None)
            raw_texts = getattr(result, "txts", None)
            raw_scores = getattr(result, "scores", None)

            boxes = list(raw_boxes) if raw_boxes is not None else []
            texts = list(raw_texts) if raw_texts is not None else []
            scores = list(raw_scores) if raw_scores is not None else []

        if not boxes or not texts or not scores:
            return OCRDocument(
                source=str(source),
                image_width=int(image_width),
                image_height=int(image_height),
                elapsed_seconds=round(elapsed_seconds, 3),
                tokens=[],
                engine="rapidocr-onnxruntime",
            )

        if not (len(boxes) == len(texts) == len(scores)):
            raise RuntimeError(
                "RapidOCR returned inconsistent result lengths: "
                f"boxes={len(boxes)}, texts={len(texts)}, scores={len(scores)}"
            )

        tokens: list[OCRToken] = []

        for index, (box, text, score) in enumerate(zip(boxes, texts, scores)):
            cleaned_text = str(text).strip()
            if not cleaned_text:
                continue

            raw_box: Any = box.tolist() if hasattr(box, "tolist") else box

            tokens.append(
                OCRToken(
                    index=index,
                    text=cleaned_text,
                    score=float(score),
                    box=OCRBox.from_raw(raw_box),
                    source_segment=source_segment,
                )
            )

        return OCRDocument(
            source=str(source),
            image_width=int(image_width),
            image_height=int(image_height),
            elapsed_seconds=round(elapsed_seconds, 3),
            tokens=tokens,
            engine="rapidocr-onnxruntime",
        )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run RapidOCR and save normalized OCR geometry."
    )
    parser.add_argument("image", help="Input receipt image")
    parser.add_argument("output", help="Output OCR JSON file")
    parser.add_argument(
        "--source-segment",
        default="full",
        help="Source label, for example full, top or bottom",
    )
    parser.add_argument(
        "--use-cls",
        action="store_true",
        help="Enable text orientation classification",
    )
    return parser


def main() -> int:
    args = _build_parser().parse_args()

    engine = RapidOCREngine(use_cls=args.use_cls)
    document = engine.analyze(
        args.image,
        source_segment=args.source_segment,
    )
    document.save_json(args.output)

    summary = {
        "source": document.source,
        "engine": document.engine,
        "image_width": document.image_width,
        "image_height": document.image_height,
        "elapsed_seconds": document.elapsed_seconds,
        "token_count": len(document.tokens),
        "output": str(Path(args.output)),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
