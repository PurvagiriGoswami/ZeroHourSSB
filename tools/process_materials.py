#!/usr/bin/env python3
"""Offline, non-destructive inventory and extraction for ZeroHour source archives.

The script never modifies an input archive.  It extracts each archive into its own
folder, emits per-file provenance and text-extraction metadata, and writes reports
that can be reviewed before any material is turned into a timed prompt bank.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path, PurePosixPath
from typing import Any
from xml.etree import ElementTree as ET

from pypdf import PdfReader

try:
    from PIL import Image
except ImportError:  # pragma: no cover - bundled runtime has Pillow
    Image = None


ARCHIVE_NAMES = (
    "SSB-20261009T124251Z-1-001.zip",
    "drive-download-20261009T124240Z-1-001.zip",
)
TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".json"}
OFFICE_XML_EXTENSIONS = {".docx", ".pptx", ".ppsx"}
KNOWN_BINARY_UNSUPPORTED = {".doc", ".ppt", ".pps"}
CATEGORY_RULES = (
    ("WAT", ("/wat/", " wat", "word association")),
    ("TAT", ("/tat/", " thematic", "tat ")),
    ("PPDT", ("/ppdt/", "/pp&dt/", " ppdt", "picture perception")),
    ("SRT", ("/srt/", " situation reaction", " srt")),
    ("PIQ and personal interview", ("/piq", "interview", "ciq", "personal interview")),
    ("GTO and group discussion", ("/gto", "/gpe", "group task", "group discussion", "/gd ")),
    ("Lecturette", ("lecturette", "lecturrette", "/lecture")),
    ("Defence and military knowledge", ("military", "defence", "defense", "indian army", "navy", "air force", "airforce")),
    ("Technical interview", ("technical", "cse", "computer science")),
    ("OIR and reasoning", ("/oir", "reasoning")),
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_destination(root: Path, member_name: str) -> Path:
    pure = PurePosixPath(member_name)
    # Validate the archive path before handing it to WindowsPath.  This avoids
    # both zip-slip and Windows drive/alternate-stream escapes.  Do not compare
    # Path.resolve() values here: on Windows existing and non-existing paths can
    # use different extended-path prefixes (\\?\), producing false failures.
    if pure.is_absolute() or any(part in {"", ".", ".."} or ":" in part or "\\" in part for part in pure.parts):
        raise ValueError("unsafe archive path")
    # Archive entries are stored flat under a deterministic hash.  This is
    # deliberate: Windows collapses names that differ only by case, a trailing
    # space, or a trailing dot.  The readable original path is retained in every
    # manifest row, while the hash guarantees that no distinct archive entry can
    # overwrite another during extraction.
    entry_id = hashlib.sha256(member_name.encode("utf-8")).hexdigest()[:20]
    readable_name = pure.name.rstrip(". ") or "unnamed"
    return root / "_entries" / f"{entry_id}__{readable_name}"


def archive_label(path: Path) -> str:
    return re.sub(r"[^a-z0-9]+", "-", path.stem.lower()).strip("-")


def classify(relative_path: str) -> str:
    probe = "/" + relative_path.replace("\\", "/").lower()
    for category, terms in CATEGORY_RULES:
        if any(term in probe for term in terms):
            return category
    return "General SSB knowledge and other material"


def relative_to_project(project: Path, path: Path) -> str:
    return path.resolve().relative_to(project.resolve()).as_posix()


def read_plain_text(path: Path) -> tuple[str, str]:
    for encoding in ("utf-8-sig", "utf-8", "utf-16", "cp1252", "latin-1"):
        try:
            return path.read_text(encoding=encoding), "extracted"
        except UnicodeError:
            continue
    return "", "failed: undecodable text"


def read_docx(path: Path) -> tuple[str, str]:
    try:
        with zipfile.ZipFile(path) as archive:
            xml = archive.read("word/document.xml")
        root = ET.fromstring(xml)
        namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
        lines = []
        for paragraph in root.iter(namespace + "p"):
            text = "".join(node.text or "" for node in paragraph.iter(namespace + "t")).strip()
            if text:
                lines.append(text)
        return "\n".join(lines), "extracted"
    except Exception as error:
        return "", f"failed: DOCX parse: {error}"


def read_presentation(path: Path) -> tuple[str, str]:
    try:
        with zipfile.ZipFile(path) as archive:
            slide_names = sorted(
                name for name in archive.namelist()
                if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)
            )
            chunks = []
            for name in slide_names:
                root = ET.fromstring(archive.read(name))
                values = [node.text or "" for node in root.iter() if node.tag.endswith("}t")]
                text = " ".join(value.strip() for value in values if value.strip())
                if text:
                    chunks.append(f"[{name}]\n{text}")
        return "\n\n".join(chunks), "extracted"
    except Exception as error:
        return "", f"failed: presentation parse: {error}"


def read_pdf(path: Path) -> tuple[str, str, int | None, list[str]]:
    warnings: list[str] = []
    try:
        reader = PdfReader(str(path), strict=False)
        page_count = len(reader.pages)
        text_pages = []
        nonempty_pages = 0
        for index, page in enumerate(reader.pages, start=1):
            try:
                text = page.extract_text() or ""
            except Exception as error:
                warnings.append(f"page {index}: text extraction failed: {error}")
                text = ""
            if text.strip():
                nonempty_pages += 1
                text_pages.append(f"\n\n===== PAGE {index} =====\n{text.strip()}")
        text = "".join(text_pages).strip()
        if not text:
            status = "needs OCR: no extractable PDF text"
        elif nonempty_pages / max(page_count, 1) < 0.45:
            status = "partial: text-poor PDF; OCR review recommended"
        else:
            status = "extracted"
        return text, status, page_count, warnings
    except Exception as error:
        return "", f"failed: PDF parse: {error}", None, warnings


def inspect_image(path: Path) -> dict[str, Any]:
    if Image is None:
        return {"image_status": "Pillow unavailable"}
    try:
        with Image.open(path) as image:
            return {
                "image_status": "inspected",
                "width": image.width,
                "height": image.height,
                "image_mode": image.mode,
            }
    except Exception as error:
        return {"image_status": f"failed: {error}"}


def normalized_name(path: str) -> str:
    name = Path(path).stem.lower()
    name = re.sub(r"\([^)]*\)", "", name)
    name = re.sub(r"\b(copy|duplicate|final|new)\b", "", name)
    return re.sub(r"[^a-z0-9]+", " ", name).strip()


def write_text(project: Path, source_path: Path, text_root: Path, text: str) -> str | None:
    if not text.strip():
        return None
    rel = source_path.relative_to(project / "materials" / "extracted")
    destination = text_root.joinpath(*rel.parts).with_suffix(".txt")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(text, encoding="utf-8")
    return relative_to_project(project, destination)


def extract_archive(archive_path: Path, extract_root: Path) -> list[dict[str, Any]]:
    label = archive_label(archive_path)
    archive_root = extract_root / label
    archive_root.mkdir(parents=True, exist_ok=True)
    archive_hash = sha256(archive_path)
    rows = []
    with zipfile.ZipFile(archive_path) as archive:
        for info in archive.infolist():
            if info.is_dir():
                continue
            base = {
                "archive": archive_path.name,
                "archive_sha256": archive_hash,
                "archive_member": info.filename,
                "compressed_bytes": info.compress_size,
                "size_bytes": info.file_size,
                "category": classify(info.filename),
                "extraction_status": "pending",
            }
            try:
                destination = safe_destination(archive_root, info.filename)
                destination.parent.mkdir(parents=True, exist_ok=True)
                if destination.exists() and destination.stat().st_size == info.file_size:
                    base["extraction_status"] = "existing file preserved"
                else:
                    with archive.open(info) as source, destination.open("wb") as target:
                        shutil.copyfileobj(source, target, length=1024 * 1024)
                    base["extraction_status"] = "extracted"
                base["extracted_path"] = destination.as_posix()
            except Exception as error:
                base["extraction_status"] = f"failed: {error}"
                base["extracted_path"] = None
            rows.append(base)
    return rows


def process(project: Path, archives: list[Path], reextract: bool) -> None:
    materials = project / "materials"
    extracted = materials / "extracted"
    derived_text = materials / "derived" / "text"
    reports = materials / "reports"
    extracted.mkdir(parents=True, exist_ok=True)
    derived_text.mkdir(parents=True, exist_ok=True)
    reports.mkdir(parents=True, exist_ok=True)
    previous_rows: dict[tuple[str, str], dict[str, Any]] = {}
    previous_manifest = reports / "materials-manifest.json"
    if previous_manifest.exists():
        try:
            for previous in json.loads(previous_manifest.read_text(encoding="utf-8")).get("files", []):
                previous_rows[(previous.get("archive", ""), previous.get("archive_member", ""))] = previous
        except (OSError, ValueError, TypeError):
            # A malformed prior report should never block a fresh local audit.
            previous_rows = {}

    all_rows: list[dict[str, Any]] = []
    for archive in archives:
        if not archive.exists():
            raise FileNotFoundError(archive)
        all_rows.extend(extract_archive(archive, extracted))

    warning_rows: list[dict[str, str]] = []
    for row in all_rows:
        raw_path = row.get("extracted_path")
        if not raw_path:
            warning_rows.append({"source": row["archive_member"], "warning": row["extraction_status"]})
            continue
        path = Path(raw_path)
        suffix = path.suffix.lower()
        row["extension"] = suffix or "[none]"
        row["source_sha256"] = sha256(path)
        row["text_path"] = None
        row["text_status"] = "not applicable"
        row["page_count"] = None
        row["parser_warnings"] = []
        previous = previous_rows.get((row["archive"], row["archive_member"]))
        previous_text = project / previous["text_path"] if previous and previous.get("text_path") else None
        if previous and previous.get("source_sha256") == row["source_sha256"] and (not previous.get("text_path") or previous_text.exists()):
            for key in ("text_path", "text_status", "page_count", "parser_warnings", "image_status", "width", "height", "image_mode"):
                if key in previous:
                    row[key] = previous[key]
            if str(row["text_status"]).startswith(("failed", "needs OCR", "partial", "unsupported")):
                warning_rows.append({"source": row["archive_member"], "warning": row["text_status"]})
            continue
        try:
            if suffix == ".pdf":
                text, status, pages, parser_warnings = read_pdf(path)
                row["text_status"] = status
                row["page_count"] = pages
                row["parser_warnings"] = parser_warnings
                row["text_path"] = write_text(project, path, derived_text, text)
            elif suffix in TEXT_EXTENSIONS:
                text, status = read_plain_text(path)
                row["text_status"] = status
                row["text_path"] = write_text(project, path, derived_text, text)
            elif suffix == ".docx":
                text, status = read_docx(path)
                row["text_status"] = status
                row["text_path"] = write_text(project, path, derived_text, text)
            elif suffix in {".pptx", ".ppsx"}:
                text, status = read_presentation(path)
                row["text_status"] = status
                row["text_path"] = write_text(project, path, derived_text, text)
            elif suffix in KNOWN_BINARY_UNSUPPORTED:
                row["text_status"] = f"unsupported legacy Office format ({suffix})"
            elif suffix in {".jpg", ".jpeg", ".png", ".webp"}:
                row.update(inspect_image(path))
        except Exception as error:
            row["text_status"] = f"failed: processing error: {error}"
        if str(row["text_status"]).startswith(("failed", "needs OCR", "partial", "unsupported")):
            warning_rows.append({"source": row["archive_member"], "warning": row["text_status"]})

    by_hash: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in all_rows:
        if row.get("source_sha256"):
            by_hash[row["source_sha256"]].append(row)
    exact_groups = [
        {"sha256": digest, "files": [item["archive_member"] for item in values]}
        for digest, values in by_hash.items() if len(values) > 1
    ]

    candidates = []
    comparable = [row for row in all_rows if row.get("source_sha256")]
    for i, left in enumerate(comparable):
        left_name = normalized_name(left["archive_member"])
        left_ext = Path(left["archive_member"]).suffix.lower()
        for right in comparable[i + 1:]:
            if left["source_sha256"] == right["source_sha256"]:
                continue
            if left_ext != Path(right["archive_member"]).suffix.lower():
                continue
            if left["category"] != right["category"]:
                continue
            ratio = SequenceMatcher(None, left_name, normalized_name(right["archive_member"])).ratio()
            size_ratio = min(left["size_bytes"], right["size_bytes"]) / max(left["size_bytes"], right["size_bytes"], 1)
            if ratio >= 0.86 and size_ratio >= 0.70:
                candidates.append({
                    "confidence": round(ratio, 3),
                    "size_similarity": round(size_ratio, 3),
                    "left": left["archive_member"],
                    "right": right["archive_member"],
                    "category": left["category"],
                })

    generated = datetime.now(timezone.utc).isoformat()
    manifest = {
        "manifest_version": 1,
        "generated_at": generated,
        "offline_only": True,
        "ocr": "Tesseract was not available in the bundled runtime; text-poor PDFs are flagged for OCR review.",
        "archives": [
            {"name": archive.name, "path": str(archive), "sha256": sha256(archive), "size_bytes": archive.stat().st_size}
            for archive in archives
        ],
        "files": all_rows,
        "exact_duplicates": exact_groups,
        "near_duplicate_candidates": candidates,
        "warnings": warning_rows,
    }
    (reports / "materials-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    with (reports / "materials-inventory.csv").open("w", newline="", encoding="utf-8") as stream:
        fields = ["archive", "archive_member", "category", "extension", "size_bytes", "page_count", "extraction_status", "text_status", "text_path", "source_sha256"]
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for row in all_rows:
            writer.writerow({field: row.get(field, "") for field in fields})

    category_counts = Counter(row["category"] for row in all_rows)
    extension_counts = Counter(row.get("extension", Path(row["archive_member"]).suffix.lower() or "[none]") for row in all_rows)
    lines = [
        "# ZeroHour source-material inventory",
        "",
        f"Generated locally at {generated}.",
        "",
        "## Archives",
        "",
    ]
    for archive in manifest["archives"]:
        lines.append(f"- `{archive['name']}` - {archive['size_bytes']} bytes - SHA-256 `{archive['sha256']}`")
    lines += ["", "## Category counts", ""]
    lines += [f"- {category}: {count}" for category, count in sorted(category_counts.items())]
    lines += ["", "## Format counts", ""]
    lines += [f"- {extension}: {count}" for extension, count in sorted(extension_counts.items())]
    lines += ["", "## Extraction and review", "", f"- Source files recorded: {len(all_rows)}", f"- Exact duplicate groups: {len(exact_groups)}", f"- Near-duplicate candidates (not deleted): {len(candidates)}", f"- Warnings and OCR/unsupported-format flags: {len(warning_rows)}", "- Full per-file inventory: `materials-inventory.csv`", "- Full provenance manifest: `materials-manifest.json`", ""]
    (reports / "MATERIALS_REPORT.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({"files": len(all_rows), "exact_duplicate_groups": len(exact_groups), "near_duplicate_candidates": len(candidates), "warnings": len(warning_rows)}, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--archive", action="append", type=Path, help="Override source archive path; may be supplied twice.")
    parser.add_argument("--reextract", action="store_true", help="Reserved for explicit future overwrite workflows.")
    args = parser.parse_args()
    project = args.project.resolve()
    archives = args.archive or [project.parent.parent / name for name in ARCHIVE_NAMES]
    process(project, [path.resolve() for path in archives], args.reextract)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
