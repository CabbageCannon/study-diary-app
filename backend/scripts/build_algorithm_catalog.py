from __future__ import annotations

import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.algorithm_catalog_service import CatalogBuildError, build_problem_catalog, write_json


def main() -> int:
    data_dir = BACKEND_DIR / "data" / "algorithms"
    try:
        catalog, report = build_problem_catalog(
            source_path=data_dir / "source_neetcode.json",
            topic_mapping_path=data_dir / "topic_mapping.json",
            lists_dir=data_dir / "lists",
        )
    except CatalogBuildError as exc:
        print(f"算法题库构建失败:\n{exc}", file=sys.stderr)
        return 1
    write_json(data_dir / "problem_catalog.json", catalog.model_dump(mode="json"))
    write_json(data_dir / "problem_catalog_report.json", report)
    print(f"已构建 {len(catalog.problems)} 道算法题: data/algorithms/problem_catalog.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
