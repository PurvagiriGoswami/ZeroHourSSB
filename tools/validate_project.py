#!/usr/bin/env python3
"""Offline validation for ZeroHour source data, manifests, and static assets."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def load_json(path: Path):
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def required(text: str, token: str, failures: list[str]) -> None:
    if token not in text:
        failures.append(f"Missing expected implementation marker: {token}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--require-stimuli", action="store_true")
    args = parser.parse_args()
    project = args.project.resolve()
    failures: list[str] = []
    checks: list[str] = []

    index = (project / "index.html").read_text(encoding="utf-8")
    runtime = (project / "app.v2.js").read_text(encoding="utf-8")
    for token in ('app.v2.js', 'styles.v2.css', 'id="announcer"'):
        required(index, token, failures)
    for token in ('BACKUP_VERSION = 1', 'saveActive(', 'resume-recovery', 'PICTURE HIDDEN', 'session.phase === "observe"', 'requestFullscreen', 'validateBackup', 'Suppress exact duplicate prompts'):
        required(runtime, token, failures)
    checks.append("static runtime markers")

    bank_data = load_json(project / "data" / "banks.json")
    for key in ("watBanks", "srtBanks", "interviewItems", "tatCount"):
        if key not in bank_data:
            failures.append(f"banks.json missing {key}")
    ids = [bank.get("id") for bank in bank_data.get("watBanks", []) + bank_data.get("srtBanks", [])]
    if len(ids) != len(set(ids)) or any(not value for value in ids):
        failures.append("Built-in WAT/SRT bank IDs are missing or duplicated")
    for bank in bank_data.get("watBanks", []) + bank_data.get("srtBanks", []):
        if not isinstance(bank.get("items"), list) or not bank["items"]:
            failures.append(f"Empty or malformed bank: {bank.get('id')}")
    interview = bank_data.get("interviewItems", [])
    if any(not item.get("question") for item in interview):
        failures.append("Technical bank has blank question entries")
    if int(bank_data.get("tatCount", 0)) < 1:
        failures.append("TAT picture count is invalid")
    checks.append("built-in bank schema")

    material_manifest = project / "materials" / "reports" / "materials-manifest.json"
    if material_manifest.exists():
        manifest = load_json(material_manifest)
        files = manifest.get("files", [])
        if len(files) != 722:
            failures.append(f"Material manifest expected 722 files, found {len(files)}")
        failed = [row for row in files if not str(row.get("extraction_status", "")).startswith(("extracted", "existing"))]
        if failed:
            failures.append(f"Material extraction has {len(failed)} failed entries")
        for row in files:
            extracted = row.get("extracted_path")
            if extracted and not Path(extracted).exists():
                failures.append(f"Manifest points to a missing source file: {row.get('archive_member')}")
                break
        checks.append("archive manifest and source paths")
    else:
        failures.append("Material extraction manifest is missing")

    assets = project / "data" / "stimuli-manifest.json"
    if assets.exists():
        stimuli = load_json(assets)
        entries = stimuli.get("items", [])
        if len(entries) != int(bank_data.get("tatCount", 0)):
            failures.append(f"Stimulus manifest has {len(entries)} entries, expected {bank_data.get('tatCount')}")
        for entry in entries:
            for key in ("source_render", "processed_path", "thumbnail_path"):
                if not (project / entry[key]).exists():
                    failures.append(f"Missing stimulus asset: {entry[key]}")
                    break
        checks.append("stimulus images and manifest")
    elif args.require_stimuli:
        failures.append("Stimulus manifest is missing")

    if failures:
        print("FAILED")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("PASSED")
    for check in checks:
        print(f"- {check}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
