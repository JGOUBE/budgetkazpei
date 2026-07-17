from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path

from PIL import Image, ImageOps


@dataclass(slots=True)
class PreprocessResult:
    source_path: str
    output_path: str
    original_width: int
    original_height: int
    output_width: int
    output_height: int
    scale: float
    resized: bool
    rotation_degrees: int
    orientation_reason: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


class ImagePreprocessor:
    """
    Conservative preprocessing for receipt photos.

    Steps:
    1. Apply the EXIF orientation recorded by the phone.
    2. Rotate a clearly landscape photo 90° counter-clockwise. Long supermarket
       receipts are expected to be read vertically, and this matches the
       horizontal Leclerc benchmark ticket.
    3. Reduce very large phone photos while preserving the aspect ratio.

    Aggressive thresholding, sharpening and perspective correction are
    intentionally excluded until benchmark evidence justifies them.
    """

    def __init__(
        self,
        *,
        max_side: int = 1600,
        jpeg_quality: int = 90,
        allow_upscale: bool = False,
        auto_rotate_landscape: bool = True,
        landscape_ratio: float = 1.15,
    ) -> None:
        if max_side < 320:
            raise ValueError("max_side must be at least 320 pixels")
        if not 1 <= jpeg_quality <= 100:
            raise ValueError("jpeg_quality must be between 1 and 100")
        if landscape_ratio <= 1:
            raise ValueError("landscape_ratio must be greater than 1")

        self.max_side = max_side
        self.jpeg_quality = jpeg_quality
        self.allow_upscale = allow_upscale
        self.auto_rotate_landscape = auto_rotate_landscape
        self.landscape_ratio = landscape_ratio

    def process(
        self,
        source_path: str | Path,
        output_path: str | Path,
    ) -> PreprocessResult:
        source = Path(source_path)
        output = Path(output_path)

        if not source.is_file():
            raise FileNotFoundError(f"Image not found: {source}")

        output.parent.mkdir(parents=True, exist_ok=True)

        with Image.open(source) as opened:
            image = ImageOps.exif_transpose(opened).convert("RGB")
            original_width, original_height = image.size

            rotation_degrees = 0
            orientation_reason = "portrait_or_square"

            if (
                self.auto_rotate_landscape
                and original_width > original_height * self.landscape_ratio
            ):
                image = image.transpose(Image.Transpose.ROTATE_90)
                rotation_degrees = 90
                orientation_reason = "landscape_receipt_rotated_counter_clockwise"
            elif not self.auto_rotate_landscape:
                orientation_reason = "automatic_landscape_rotation_disabled"

            oriented_width, oriented_height = image.size
            largest_side = max(oriented_width, oriented_height)

            if largest_side <= 0:
                raise ValueError("Invalid image dimensions")

            requested_scale = self.max_side / largest_side
            scale = (
                requested_scale
                if self.allow_upscale
                else min(1.0, requested_scale)
            )

            output_width = max(1, round(oriented_width * scale))
            output_height = max(1, round(oriented_height * scale))
            resized = (output_width, output_height) != (
                oriented_width,
                oriented_height,
            )

            if resized:
                image = image.resize(
                    (output_width, output_height),
                    Image.Resampling.LANCZOS,
                )

            suffix = output.suffix.lower()
            if suffix in {".jpg", ".jpeg"}:
                image.save(
                    output,
                    format="JPEG",
                    quality=self.jpeg_quality,
                    optimize=True,
                    subsampling=0,
                )
            elif suffix == ".png":
                image.save(output, format="PNG", optimize=True)
            else:
                raise ValueError(
                    "Output extension must be .jpg, .jpeg or .png"
                )

        return PreprocessResult(
            source_path=str(source),
            output_path=str(output),
            original_width=original_width,
            original_height=original_height,
            output_width=output_width,
            output_height=output_height,
            scale=round(scale, 6),
            resized=resized,
            rotation_degrees=rotation_degrees,
            orientation_reason=orientation_reason,
        )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Conservative receipt image preprocessing."
    )
    parser.add_argument("source", help="Source receipt image")
    parser.add_argument("output", help="Destination .jpg/.jpeg/.png image")
    parser.add_argument(
        "--max-side",
        type=int,
        default=1600,
        help="Maximum width or height in pixels (default: 1600)",
    )
    parser.add_argument(
        "--jpeg-quality",
        type=int,
        default=90,
        help="JPEG quality from 1 to 100 (default: 90)",
    )
    parser.add_argument(
        "--no-auto-rotate-landscape",
        action="store_true",
        help="Do not rotate clearly landscape photos automatically",
    )
    parser.add_argument(
        "--landscape-ratio",
        type=float,
        default=1.15,
        help=(
            "Rotate when width is greater than height multiplied by this "
            "ratio (default: 1.15)"
        ),
    )
    return parser


def main() -> int:
    args = _build_parser().parse_args()
    processor = ImagePreprocessor(
        max_side=args.max_side,
        jpeg_quality=args.jpeg_quality,
        auto_rotate_landscape=not args.no_auto_rotate_landscape,
        landscape_ratio=args.landscape_ratio,
    )
    result = processor.process(args.source, args.output)
    print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
