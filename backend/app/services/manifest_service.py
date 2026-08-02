from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.services.algorithm_catalog_service import read_json, write_json


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _record_count(payload: Any) -> int:
    if isinstance(payload, dict):
        for key in ("problems", "questions"):
            if isinstance(payload.get(key), list):
                return len(payload[key])
    return 0


def build_manifest(data_dir: Path) -> dict[str, Any]:
    tracked_paths = [
        data_dir / "algorithms" / "problem_catalog.json",
        data_dir / "interview_question_bank.json",
    ]
    files: list[dict[str, Any]] = []
    for path in tracked_paths:
        if not path.exists():
            continue
        payload = read_json(path)
        files.append(
            {
                "path": path.relative_to(data_dir.parent).as_posix(),
                "sha256": sha256_file(path),
                "record_count": _record_count(payload),
            }
        )

    algorithm_catalog = next((item for item in files if item["path"].endswith("problem_catalog.json")), None)
    interview_catalog = next((item for item in files if item["path"].endswith("interview_question_bank.json")), None)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "algorithm_count": algorithm_catalog["record_count"] if algorithm_catalog else 0,
        "interview_question_count": interview_catalog["record_count"] if interview_catalog else 0,
        "algorithm_sources": ["neetcode-gh/leetcode"],
        "interview_sources": sorted(
            read_json(data_dir / "interview_sources.json").keys()
            if (data_dir / "interview_sources.json").exists()
            else []
        ),
        "files": files,
    }


def write_manifest(data_dir: Path) -> dict[str, Any]:
    manifest = build_manifest(data_dir)
    write_json(data_dir / "data_manifest.json", manifest)
    return manifest
