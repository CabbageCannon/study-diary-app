from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.algorithm_catalog_service import CatalogBuildError, build_problem_catalog, write_json
from app.services.manifest_service import write_manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="将本地 NeetCode 元数据转换为统一算法题目录。")
    parser.add_argument("--source", required=True, type=Path, help="本地 .problemSiteData.json 文件")
    parser.add_argument(
        "--output",
        type=Path,
        default=BACKEND_DIR / "data" / "algorithms" / "problem_catalog.json",
        help="统一算法题目录输出文件",
    )
    parser.add_argument(
        "--topic-mapping",
        type=Path,
        default=BACKEND_DIR / "data" / "algorithms" / "topic_mapping.json",
    )
    parser.add_argument(
        "--lists-dir",
        type=Path,
        default=BACKEND_DIR / "data" / "algorithms" / "lists",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=BACKEND_DIR / "data" / "algorithms" / "problem_catalog_report.json",
    )
    args = parser.parse_args()

    try:
        catalog, report = build_problem_catalog(args.source, args.topic_mapping, args.lists_dir)
        write_json(args.output, catalog.model_dump(mode="json"))
        write_json(args.report, report)
        write_manifest(BACKEND_DIR / "data")
    except CatalogBuildError as exc:
        print(f"构建失败:\n{exc}", file=sys.stderr)
        return 1

    print(f"已构建 {len(catalog.problems)} 道算法题: {args.output}")
    if report["unknown_patterns"]:
        print(f"未映射题型: {', '.join(report['unknown_patterns'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
