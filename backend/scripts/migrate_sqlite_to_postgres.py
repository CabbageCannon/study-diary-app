"""Copy an existing SQLite Study Diary database into an empty PostgreSQL database."""

from argparse import ArgumentParser

from sqlalchemy import create_engine, func, select

from app import models  # noqa: F401
from app.database import Base


def postgres_url(value: str) -> str:
    if value.startswith("postgres://"):
        return f"postgresql+psycopg://{value.removeprefix('postgres://')}"
    if value.startswith("postgresql://"):
        return f"postgresql+psycopg://{value.removeprefix('postgresql://')}"
    return value


def copy_database(source_url: str, target_url: str) -> None:
    if not source_url.startswith("sqlite"):
        raise ValueError("--source 必须是 SQLite DATABASE_URL")
    target_url = postgres_url(target_url)
    if not target_url.startswith("postgresql+psycopg://"):
        raise ValueError("--target 必须是 PostgreSQL DATABASE_URL")

    source = create_engine(source_url)
    target = create_engine(target_url, pool_pre_ping=True)
    try:
        with source.connect() as source_connection, target.begin() as target_connection:
            for table in Base.metadata.sorted_tables:
                existing_rows = target_connection.scalar(select(func.count()).select_from(table))
                if existing_rows:
                    raise RuntimeError(f"目标表 {table.name} 不是空的，已停止迁移。")
                rows = [dict(row) for row in source_connection.execute(select(table)).mappings()]
                if rows:
                    target_connection.execute(table.insert(), rows)
                print(f"{table.name}: {len(rows)} 行")
    finally:
        source.dispose()
        target.dispose()


def main() -> None:
    parser = ArgumentParser(description="将 SQLite 数据复制到空的 PostgreSQL 数据库")
    parser.add_argument("--source", required=True, help="SQLite DATABASE_URL")
    parser.add_argument("--target", required=True, help="PostgreSQL DATABASE_URL")
    arguments = parser.parse_args()
    copy_database(arguments.source, arguments.target)


if __name__ == "__main__":
    main()
