from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from pydantic import ValidationError

from app.schemas import AlgorithmCatalog, AlgorithmProblemSeed


LEETCODE_CN_URL_TEMPLATE = "https://leetcode.cn/problems/{slug}/"


class CatalogBuildError(ValueError):
    def __init__(self, errors: list[str]) -> None:
        self.errors = errors
        super().__init__("\n".join(errors))


def read_json(path: Path) -> Any:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError as exc:
        raise CatalogBuildError([f"找不到数据文件: {path}"]) from exc
    except json.JSONDecodeError as exc:
        raise CatalogBuildError([f"JSON 解析失败 {path}: 第 {exc.lineno} 行第 {exc.colno} 列: {exc.msg}"]) from exc


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def normalize_slug(value: str) -> str:
    parsed = urlparse(value.strip())
    candidate = parsed.path if parsed.scheme or parsed.netloc else value.strip()
    candidate = candidate.strip().strip("/")
    if "/problems/" in f"/{candidate}/":
        candidate = f"/{candidate}/".split("/problems/", 1)[1].split("/", 1)[0]
    candidate = candidate.strip().strip("/").lower()
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", candidate):
        raise ValueError(f"无法从值中得到合法 slug: {value!r}")
    return candidate


def leetcode_cn_url(slug: str) -> str:
    return LEETCODE_CN_URL_TEMPLATE.format(slug=normalize_slug(slug))


def _records_from_source(payload: Any) -> list[tuple[str | None, dict[str, Any]]]:
    if isinstance(payload, list):
        invalid_indexes = [str(index) for index, item in enumerate(payload, start=1) if not isinstance(item, dict)]
        if invalid_indexes:
            raise CatalogBuildError([f"NeetCode 源数据第 {', '.join(invalid_indexes)} 项必须是对象"])
        return [(None, item) for item in payload]
    if isinstance(payload, dict):
        items = payload.get("problems")
        if isinstance(items, list):
            invalid_indexes = [str(index) for index, item in enumerate(items, start=1) if not isinstance(item, dict)]
            if invalid_indexes:
                raise CatalogBuildError([f"NeetCode 源数据 problems 第 {', '.join(invalid_indexes)} 项必须是对象"])
            return [(None, item) for item in items]
        invalid_keys = [str(key) for key, value in payload.items() if not isinstance(value, dict)]
        if invalid_keys:
            raise CatalogBuildError([f"NeetCode 源数据键 {', '.join(invalid_keys)} 的值必须是对象"])
        return [(str(key), value) for key, value in payload.items()]
    raise CatalogBuildError(["NeetCode 源数据必须是对象或对象数组"])


def _load_list_memberships(lists_dir: Path) -> dict[str, set[str]]:
    memberships: dict[str, set[str]] = defaultdict(set)
    if not lists_dir.exists():
        return memberships

    for path in sorted(lists_dir.glob("*.json")):
        payload = read_json(path)
        if not isinstance(payload, dict):
            raise CatalogBuildError([f"列表文件必须是对象: {path}"])
        list_id = str(payload.get("list_id", "")).strip()
        slugs = payload.get("problem_slugs", [])
        if not list_id:
            raise CatalogBuildError([f"列表文件缺少 list_id: {path}"])
        if not isinstance(slugs, list):
            raise CatalogBuildError([f"problem_slugs 必须是数组: {path}"])
        for raw_slug in slugs:
            try:
                memberships[list_id].add(normalize_slug(str(raw_slug)))
            except ValueError as exc:
                raise CatalogBuildError([f"{path}: {exc}"]) from exc
    return memberships


def _source_lists(record: dict[str, Any], slug: str, memberships: dict[str, set[str]]) -> list[str]:
    values: list[str] = []
    for list_id, key in (("neetcode150", "neetcode150"), ("blind75", "blind75")):
        if record.get(key) is True or slug in memberships.get(list_id, set()):
            values.append(list_id)
    for list_id, slugs in memberships.items():
        if slug in slugs and list_id not in values:
            values.append(list_id)
    return sorted(values)


def _extract_slug(record: dict[str, Any]) -> str:
    for key in ("slug", "link", "url"):
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            try:
                return normalize_slug(value)
            except ValueError:
                continue
    raise ValueError("缺少可解析的 slug/link/url；不能根据标题臆造题目链接")


def _extract_external_id(record: dict[str, Any], source_key: str | None, slug: str) -> str:
    for key in ("external_id", "externalId", "problem_id", "problemId", "id"):
        value = record.get(key)
        if value not in (None, ""):
            return str(value).strip()
    if source_key and source_key.strip():
        return source_key.strip()
    return slug


def build_problem_catalog(
    source_path: Path,
    topic_mapping_path: Path,
    lists_dir: Path,
) -> tuple[AlgorithmCatalog, dict[str, Any]]:
    raw_source = read_json(source_path)
    raw_mapping = read_json(topic_mapping_path)
    if not isinstance(raw_mapping, dict):
        raise CatalogBuildError(["topic_mapping.json 必须是对象"])
    memberships = _load_list_memberships(lists_dir)

    mapping: dict[str, dict[str, Any]] = {}
    for name, value in raw_mapping.items():
        if not isinstance(value, dict) or not value.get("key") or not value.get("label"):
            raise CatalogBuildError([f"题型映射无效: {name}"])
        mapping[str(name).strip().lower()] = value

    problems_by_slug: dict[str, AlgorithmProblemSeed] = {}
    unknown_patterns: set[str] = set()
    errors: list[str] = []
    for index, (source_key, record) in enumerate(_records_from_source(raw_source), start=1):
        try:
            title = str(record.get("problem") or record.get("title") or "").strip()
            if not title:
                raise ValueError("缺少 problem/title")
            slug = _extract_slug(record)
            pattern = str(record.get("pattern") or "").strip()
            mapped_pattern = mapping.get(pattern.lower()) if pattern else None
            if mapped_pattern is None:
                pattern_key = "other"
                topics = ["其他"]
                if pattern:
                    unknown_patterns.add(pattern)
            else:
                pattern_key = str(mapped_pattern["key"])
                topics = [str(item) for item in mapped_pattern.get("topics", []) if str(item).strip()]
                if not topics:
                    topics = [str(mapped_pattern["label"])]
            external_id = _extract_external_id(record, source_key, slug)
            stable_key = f"leetcode-{external_id}"
            candidate = AlgorithmProblemSeed(
                id=stable_key,
                platform="leetcode",
                external_id=external_id,
                title=title,
                title_zh=record.get("title_zh") or None,
                slug=slug,
                url=leetcode_cn_url(slug),
                difficulty=str(record.get("difficulty") or "").strip().lower(),
                pattern_key=pattern_key,
                topics=topics,
                source_lists=_source_lists(record, slug, memberships),
                is_active=bool(record.get("is_active", True)),
                source={
                    "name": "neetcode-gh/leetcode",
                    "license": "MIT",
                    "url": "https://github.com/neetcode-gh/leetcode",
                },
            )
        except (ValueError, ValidationError) as exc:
            errors.append(f"源记录 #{index}: {exc}")
            continue

        current = problems_by_slug.get(candidate.slug)
        if current is None:
            problems_by_slug[candidate.slug] = candidate
            continue
        if current.title != candidate.title or current.difficulty != candidate.difficulty:
            errors.append(f"源记录 #{index}: slug {candidate.slug!r} 的元数据与已有记录冲突")
            continue
        merged_lists = sorted(set(current.source_lists) | set(candidate.source_lists))
        problems_by_slug[candidate.slug] = current.model_copy(update={"source_lists": merged_lists})

    if errors:
        raise CatalogBuildError(errors)

    catalog = AlgorithmCatalog(problems=sorted(problems_by_slug.values(), key=lambda item: item.slug))
    report = {
        "total": len(catalog.problems),
        "by_difficulty": {
            difficulty: sum(problem.difficulty == difficulty for problem in catalog.problems)
            for difficulty in ("easy", "medium", "hard")
        },
        "by_source_list": {
            list_id: sum(list_id in problem.source_lists for problem in catalog.problems)
            for list_id in sorted({item for problem in catalog.problems for item in problem.source_lists})
        },
        "unknown_patterns": sorted(unknown_patterns),
        "validation_errors": [],
    }
    return catalog, report
