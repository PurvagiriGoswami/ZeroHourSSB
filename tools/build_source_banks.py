#!/usr/bin/env python3
"""Build provenance-preserving source-page banks from extracted local text.

These banks intentionally do not guess where a paragraph becomes a test item.
Each entry is an exact extracted source page (or text file) with a stable ID,
source filename, category, page reference, and extraction status.  They are kept
separate from normal timed practice banks until a human explicitly curates them.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def split_pages(text: str) -> list[tuple[int, str]]:
    markers = list(re.finditer(r"^===== PAGE (\d+) =====\s*$", text, flags=re.MULTILINE))
    if not markers:
        return [(1, text.strip())] if text.strip() else []
    result = []
    for index, marker in enumerate(markers):
        end = markers[index + 1].start() if index + 1 < len(markers) else len(text)
        content = text[marker.end():end].strip()
        if content:
            result.append((int(marker.group(1)), content))
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    project = args.project.resolve()
    manifest_path = project / "materials" / "reports" / "materials-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    root = project / "materials" / "derived" / "question-banks"
    root.mkdir(parents=True, exist_ok=True)
    groups: dict[str, list[dict]] = defaultdict(list)
    source_count = 0
    for record in manifest.get("files", []):
        text_path = record.get("text_path")
        if not text_path:
            continue
        path = project / text_path
        if not path.exists():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeError:
            continue
        category = record.get("category") or "General SSB knowledge and other material"
        source_count += 1
        for page, content in split_pages(text):
            content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
            groups[category].append({
                "id": f"src-{content_hash[:16]}-p{page}",
                "kind": "source-page",
                "content": content,
                "source_filename": record.get("archive_member"),
                "source_archive": record.get("archive"),
                "source_page": page if record.get("extension") == ".pdf" else None,
                "category": category,
                "extraction_status": record.get("text_status"),
                "source_text_path": text_path,
                "source_sha256": record.get("source_sha256"),
            })
    index = {"manifest_version": 1, "generated_at": datetime.now(timezone.utc).isoformat(), "kind": "provenance-preserving source-page banks", "sources_processed": source_count, "categories": []}
    for category, entries in sorted(groups.items()):
        filename = f"{slug(category)}.json"
        payload = {"bank_version": 1, "category": category, "kind": "source-page", "purpose": "Exact extracted source text for manual review and deliberate curation. Not automatically used in normal timed practice.", "items": entries}
        (root / filename).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        index["categories"].append({"category": category, "path": f"materials/derived/question-banks/{filename}", "entry_count": len(entries)})
    (root / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"sources_processed": source_count, "categories": len(index["categories"]), "entries": sum(row["entry_count"] for row in index["categories"])}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
