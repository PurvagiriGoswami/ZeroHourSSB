#!/usr/bin/env python3
"""Create cautious, reviewable TAT/PPDT image assets from a local source PDF.

Original full-page renders are retained.  Processed files only remove confirmed
uniform edge margins; any non-trivial crop is left for manual review instead of
guessing at the stimulus boundary.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps
from pypdf import PdfReader


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def image_hash(image: Image.Image) -> str:
    sample = ImageOps.grayscale(image).resize((32, 32), Image.Resampling.LANCZOS)
    return hashlib.sha256(sample.tobytes()).hexdigest()


def trim_uniform_margin(image: Image.Image) -> tuple[Image.Image, str, dict[str, int]]:
    """Trim at most 4% per edge and only rows/columns that are almost blank."""
    normal = ImageOps.exif_transpose(image)
    grayscale = ImageOps.grayscale(normal)
    width, height = grayscale.size
    max_x = max(0, int(width * 0.04))
    max_y = max(0, int(height * 0.04))
    threshold = 247
    tolerance = 0.004
    pixels = grayscale.load()

    def row_blank(y: int) -> bool:
        dark = sum(1 for x in range(width) if pixels[x, y] < threshold)
        return dark / max(width, 1) <= tolerance

    def column_blank(x: int) -> bool:
        dark = sum(1 for y in range(height) if pixels[x, y] < threshold)
        return dark / max(height, 1) <= tolerance

    top = next((y for y in range(max_y) if not row_blank(y)), 0)
    bottom_trim = next((offset for offset in range(max_y) if not row_blank(height - 1 - offset)), 0)
    left = next((x for x in range(max_x) if not column_blank(x)), 0)
    right_trim = next((offset for offset in range(max_x) if not column_blank(width - 1 - offset)), 0)
    crop = {"left": left, "top": top, "right": right_trim, "bottom": bottom_trim}
    if not any(crop.values()):
        return normal, "retained-full-page; manual review recommended", crop
    return normal.crop((left, top, width - right_trim, height - bottom_trim)), "safe-uniform-margin-crop", crop


def save_thumbnail(image: Image.Image, target: Path) -> None:
    thumb = image.copy()
    thumb.thumbnail((360, 360), Image.Resampling.LANCZOS)
    thumb.convert("RGB").save(target, "JPEG", quality=82, optimize=True)


def extract_embedded(pdf: Path, output: Path) -> dict[int, list[str]]:
    """Best-effort direct image extraction; render output remains the primary asset."""
    result: dict[int, list[str]] = {}
    try:
        reader = PdfReader(str(pdf), strict=False)
        for page_number, page in enumerate(reader.pages, start=1):
            candidates = []
            for image_number, embedded in enumerate(page.images, start=1):
                try:
                    image = Image.open(BytesIO(embedded.data))
                    if image.width * image.height < 20_000:
                        continue
                    suffix = ".png" if image.mode in {"RGBA", "LA"} else ".jpg"
                    name = f"{page_number:03d}-{image_number:02d}{suffix}"
                    target = output / name
                    if suffix == ".jpg":
                        image.convert("RGB").save(target, "JPEG", quality=90, optimize=True)
                    else:
                        image.save(target, "PNG", optimize=True)
                    candidates.append(name)
                except Exception:
                    continue
            if candidates:
                result[page_number] = candidates
    except Exception:
        pass
    return result


def build_contact_sheets(rows: list[dict], processed: Path, sheets: Path) -> list[str]:
    files = []
    columns, cell_w, cell_h = 5, 230, 200
    for start in range(0, len(rows), 25):
        block = rows[start:start + 25]
        canvas = Image.new("RGB", (columns * cell_w, 5 * cell_h), "#101820")
        draw = ImageDraw.Draw(canvas)
        for offset, row in enumerate(block):
            image = Image.open(processed / row["processed_file"]).convert("RGB")
            image.thumbnail((cell_w - 20, cell_h - 34), Image.Resampling.LANCZOS)
            x = (offset % columns) * cell_w + (cell_w - image.width) // 2
            y = (offset // columns) * cell_h + 8
            canvas.paste(image, (x, y))
            draw.text(((offset % columns) * cell_w + 9, (offset // columns) * cell_h + cell_h - 20), f"{row['id']} · p{row['page']}", fill="#d9e6ed")
        name = f"tat467-contact-{start // 25 + 1:02d}.jpg"
        canvas.save(sheets / name, "JPEG", quality=88, optimize=True)
        files.append(name)
    return files


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--source", type=Path)
    parser.add_argument("--dpi", type=int, default=120)
    args = parser.parse_args()
    project = args.project.resolve()
    source = args.source or project / "materials" / "extracted" / "ssb-20261009t124251z-1-001" / "SSB" / "TAT" / "TAT 467.pdf"
    if not source.exists():
        raise FileNotFoundError(source)
    asset_root = project / "assets" / "stimuli" / "tat467"
    original, processed, thumbs, embedded, sheets = (asset_root / name for name in ("original", "processed", "thumbs", "embedded", "contact-sheets"))
    for folder in (original, processed, thumbs, embedded, sheets):
        folder.mkdir(parents=True, exist_ok=True)

    page_count = len(PdfReader(str(source), strict=False).pages)
    prefix = original / "page"
    poppler = shutil.which("pdftoppm")
    if not poppler:
        raise RuntimeError("pdftoppm was not found; install Poppler or add it to PATH")
    expected = [original / f"page-{page:03d}.jpg" for page in range(1, page_count + 1)]
    if not all(path.exists() and path.stat().st_size > 0 for path in expected):
        subprocess.run([poppler, "-f", "1", "-l", str(page_count), "-r", str(args.dpi), "-jpeg", "-jpegopt", "quality=88", str(source), str(prefix)], check=True)

    embedded_by_page = extract_embedded(source, embedded)
    rows = []
    hashes: dict[str, list[str]] = {}
    for page in range(1, page_count + 1):
        source_file = original / f"page-{page:03d}.jpg"
        if not source_file.exists():
            raise RuntimeError(f"Missing rendered page {page}")
        with Image.open(source_file) as raw:
            cropped, status, crop = trim_uniform_margin(raw)
            processed_name = f"{page:03d}.jpg"
            processed_path = processed / processed_name
            cropped.convert("RGB").save(processed_path, "JPEG", quality=90, optimize=True)
            save_thumbnail(cropped, thumbs / processed_name)
            perceptual = image_hash(cropped)
        hashes.setdefault(perceptual, []).append(processed_name)
        rows.append({
            "id": f"tat467-{page:03d}", "source_file": source.name, "page": page,
            "source_render": f"assets/stimuli/tat467/original/{source_file.name}",
            "processed_file": processed_name, "processed_path": f"assets/stimuli/tat467/processed/{processed_name}",
            "thumbnail_path": f"assets/stimuli/tat467/thumbs/{processed_name}",
            "embedded_images": [f"assets/stimuli/tat467/embedded/{name}" for name in embedded_by_page.get(page, [])],
            "crop_status": status, "crop_pixels": crop, "source_sha256": digest(source_file), "image_fingerprint": perceptual
        })
    contacts = build_contact_sheets(rows, processed, sheets)
    duplicate_groups = [values for values in hashes.values() if len(values) > 1]
    manifest = {
        "manifest_version": 1, "kind": "TAT/PPDT stimulus assets", "source_pdf": str(source), "source_pdf_sha256": digest(source),
        "page_count": page_count, "render_dpi": args.dpi, "cropping_policy": "Only confirmed uniform page margins were removed. All original renders are retained; retained full pages require manual crop review.",
        "items": rows, "exact_visual_duplicate_candidates": duplicate_groups, "contact_sheets": [f"assets/stimuli/tat467/contact-sheets/{name}" for name in contacts]
    }
    destination = project / "data" / "stimuli-manifest.json"
    destination.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"pages": page_count, "embedded_page_count": len(embedded_by_page), "visual_duplicate_groups": len(duplicate_groups), "manifest": str(destination)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
