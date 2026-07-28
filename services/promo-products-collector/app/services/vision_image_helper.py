from __future__ import annotations

import argparse
from pathlib import Path


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Crop catalog images for local vision benchmarking.")
    parser.add_argument("--source", required=True, help="Input image path.")
    parser.add_argument("--output", required=True, help="Output image path.")
    parser.add_argument("--left", required=True, type=int)
    parser.add_argument("--top", required=True, type=int)
    parser.add_argument("--width", required=True, type=int)
    parser.add_argument("--height", required=True, type=int)
    return parser


def main() -> int:
    from PIL import Image

    args = _build_parser().parse_args()
    source = Path(args.source)
    output = Path(args.output)
    if not source.is_file():
        raise FileNotFoundError(f"Image not found: {source}")

    output.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        crop_box = (
            max(0, args.left),
            max(0, args.top),
            max(0, args.left + args.width),
            max(0, args.top + args.height),
        )
        cropped = image.crop(crop_box)
        cropped.save(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
