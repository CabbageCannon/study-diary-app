from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.algorithm_catalog_service import CatalogBuildError, write_json
from app.services.interview_bank_service import build_interview_bank
from app.services.manifest_service import write_manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="合并并校验分类八股题文件。")
    parser.add_argument(
        "--input-dir", type=Path, default=BACKEND_DIR / "data" / "interview_bank", help="分类题库目录"
    )
    parser.add_argument(
        "--sources", type=Path, default=BACKEND_DIR / "data" / "interview_sources.json", help="来源登记文件"
    )
    parser.add_argument(
        "--output", type=Path, default=BACKEND_DIR / "data" / "interview_question_bank.json", help="题库输出文件"
    )
    parser.add_argument(
        "--report", type=Path, default=BACKEND_DIR / "data" / "interview_bank_report.json", help="质量报告输出文件"
    )
    args = parser.parse_args()

    try:
        catalog, report = build_interview_bank(args.input_dir, args.sources)
        write_json(args.output, catalog.model_dump(mode="json", exclude_none=True))
        write_json(args.report, report)
        write_manifest(BACKEND_DIR / "data")
    except CatalogBuildError as exc:
        print(f"构建失败:\n{exc}", file=sys.stderr)
        return 1

    print(f"已构建 {len(catalog.questions)} 道八股题: {args.output}")
    print(f"疑似重复题: {len(report['duplicate_candidates'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
