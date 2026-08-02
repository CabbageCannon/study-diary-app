from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal, init_db
from app.services.algorithm_catalog_service import CatalogBuildError
from app.services.data_import_service import import_algorithms, import_interviews


def main() -> int:
    parser = argparse.ArgumentParser(description="幂等导入本地题库种子数据。")
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument("--algorithms", action="store_true", help="只导入算法题元数据")
    selection.add_argument("--interviews", action="store_true", help="只导入八股题")
    selection.add_argument("--all", action="store_true", help="导入全部题库")
    parser.add_argument("--dry-run", action="store_true", help="执行校验和导入流程后回滚事务")
    parser.add_argument(
        "--overwrite-review-metadata",
        action="store_true",
        help="Allow seed JSON to overwrite review metadata on existing interview questions.",
    )
    args = parser.parse_args()

    init_db()
    db = SessionLocal()
    results: dict[str, dict[str, object]] = {}
    try:
        if args.algorithms or args.all:
            results["algorithms"] = import_algorithms(
                db, BACKEND_DIR / "data" / "algorithms" / "problem_catalog.json", args.dry_run
            ).as_dict()
        if args.interviews or args.all:
            results["interviews"] = import_interviews(
                db,
                BACKEND_DIR / "data" / "interview_question_bank.json",
                args.dry_run,
                overwrite_review_metadata=args.overwrite_review_metadata,
            ).as_dict()
    except CatalogBuildError as exc:
        print(f"导入失败:\n{exc}", file=sys.stderr)
        return 1
    finally:
        db.close()

    print(json.dumps(results, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
