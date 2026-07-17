from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

Point = tuple[float, float]


@dataclass(frozen=True, slots=True)
class OCRBox:
    """Quadrilateral returned by the OCR engine."""

    points: tuple[Point, Point, Point, Point]

    @classmethod
    def from_raw(cls, raw: Iterable[Iterable[float]]) -> "OCRBox":
        points = tuple((float(x), float(y)) for x, y in raw)
        if len(points) != 4:
            raise ValueError(f"An OCR box must contain 4 points, got {len(points)}")
        return cls(points=points)  # type: ignore[arg-type]

    @property
    def x_min(self) -> float:
        return min(point[0] for point in self.points)

    @property
    def x_max(self) -> float:
        return max(point[0] for point in self.points)

    @property
    def y_min(self) -> float:
        return min(point[1] for point in self.points)

    @property
    def y_max(self) -> float:
        return max(point[1] for point in self.points)

    @property
    def width(self) -> float:
        return self.x_max - self.x_min

    @property
    def height(self) -> float:
        return self.y_max - self.y_min

    @property
    def center_x(self) -> float:
        return (self.x_min + self.x_max) / 2

    @property
    def center_y(self) -> float:
        return (self.y_min + self.y_max) / 2

    def to_list(self) -> list[list[float]]:
        return [[x, y] for x, y in self.points]


@dataclass(slots=True)
class OCRToken:
    """OCR text block with confidence and geometry."""

    index: int
    text: str
    score: float
    box: OCRBox
    line_id: int | None = None
    column: str | None = None
    source_segment: str = "full"

    def to_dict(self) -> dict[str, Any]:
        return {
            "index": self.index,
            "text": self.text,
            "score": self.score,
            "box": self.box.to_list(),
            "x": self.box.x_min,
            "y": self.box.y_min,
            "width": self.box.width,
            "height": self.box.height,
            "center_x": self.box.center_x,
            "center_y": self.box.center_y,
            "line_id": self.line_id,
            "column": self.column,
            "source_segment": self.source_segment,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "OCRToken":
        return cls(
            index=int(data["index"]),
            text=str(data["text"]),
            score=float(data["score"]),
            box=OCRBox.from_raw(data["box"]),
            line_id=data.get("line_id"),
            column=data.get("column"),
            source_segment=str(data.get("source_segment", "full")),
        )


@dataclass(slots=True)
class OCRDocument:
    """Normalized OCR output used by the geometry pipeline."""

    source: str
    image_width: int
    image_height: int
    elapsed_seconds: float
    tokens: list[OCRToken]
    engine: str = "rapidocr-onnxruntime"

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "image_width": self.image_width,
            "image_height": self.image_height,
            "elapsed_seconds": self.elapsed_seconds,
            "engine": self.engine,
            "tokens": [token.to_dict() for token in self.tokens],
        }

    def save_json(self, path: str | Path) -> None:
        output_path = Path(path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(self.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "OCRDocument":
        raw_tokens = data.get("tokens", data.get("lines", []))
        return cls(
            source=str(data["source"]),
            image_width=int(data["image_width"]),
            image_height=int(data["image_height"]),
            elapsed_seconds=float(data["elapsed_seconds"]),
            engine=str(data.get("engine", "rapidocr-onnxruntime")),
            tokens=[OCRToken.from_dict(token) for token in raw_tokens],
        )

    @classmethod
    def load_json(cls, path: str | Path) -> "OCRDocument":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls.from_dict(data)
