"""Capture/verify dataset integrity; DuckDB is opened read_only=True only."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / "docs/qa/web_dataset.json"


def hashes():
    paths = [ROOT / name for name in ("clube_do_valor.duckdb", "dbt_project.yml", "profiles.yml", "requirements.txt", "requirements-lock.txt")]
    for folder in ("seeds", "models", "macros", "tests"):
        paths.extend(p for p in (ROOT / folder).rglob("*") if p.is_file())
    return {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    current = hashes()
    if args.verify:
        previous = json.loads(BASELINE.read_text(encoding="utf-8"))["sha256"]
        if previous != current:
            raise AssertionError({p: "changed/missing/added" for p in previous.keys() | current.keys() if previous.get(p) != current.get(p)})
        print(f"PASS: {len(current)} protected files byte-identical")
        return
    if BASELINE.exists():
        raise FileExistsError("Baseline already exists; use --verify, never overwrite pre-execution evidence")
    payload = {"captured_at": datetime.now(timezone.utc).isoformat(), "sha256": current, "read_only": True}
    with duckdb.connect(str(ROOT / "clube_do_valor.duckdb"), read_only=True) as connection:
        for table in ("fact_transactions", "dim_clients", "mart_client_portfolio"):
            cursor = connection.execute(f"select * from {table}")
            names = [col[0] for col in cursor.description]
            payload[table] = [dict(zip(names, row)) for row in cursor.fetchall()]
    assert current == hashes(), "Read-only extraction changed protected files"
    BASELINE.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")
    print({"files": len(current), **{name: len(payload[name]) for name in ("fact_transactions", "dim_clients", "mart_client_portfolio")}})


if __name__ == "__main__":
    main()
