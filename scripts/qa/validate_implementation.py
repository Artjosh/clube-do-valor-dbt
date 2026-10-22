"""Independent integration QA; writes only docs/qa and fresh target/qa projects.

Run with .venv/Scripts/python.exe scripts/qa/validate_implementation.py.
Uses the installed DuckDB/dbt runtime, no dependency installation or network.
"""
import csv
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal

import duckdb

from audit_source import compare_rows, oracle, read_csv

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "target" / "qa" / datetime.now(timezone.utc).strftime("validation_%Y%m%dT%H%M%S%f")
PROJECT = RUN / "project"
DBT = Path(sys.executable).parent / ("dbt.exe" if os.name == "nt" else "dbt")
EVIDENCE = ROOT / "docs" / "qa" / "validation_results.json"
result = {"started_at": datetime.now(timezone.utc).isoformat(), "workspace": str(RUN),
          "runtime": sys.executable, "python": sys.version, "commands": [], "checks": [],
          "dependency_versions": {}, "snapshots": [], "status": "running"}


def persist():
    EVIDENCE.write_text(json.dumps(result, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")


def check(condition, description):
    if not condition:
        raise AssertionError(description)
    result["checks"].append(description)
    persist()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dbt(label, *args, expected=0):
    command = [str(DBT), *args, "--profiles-dir", "."]
    env = {k: v for k, v in os.environ.items() if not k.startswith("DBT_")}
    env.update(DBT_SEND_ANONYMOUS_USAGE_STATS="false", PYTHONIOENCODING="utf-8")
    completed = subprocess.run(command, cwd=PROJECT, env=env, capture_output=True,
                               text=True, encoding="utf-8", errors="replace")
    (RUN / (label + ".log")).write_text(completed.stdout + completed.stderr, encoding="utf-8")
    record = {"label": label, "command": command, "cwd": str(PROJECT), "exit_code": completed.returncode}
    artifacts = PROJECT / "target" / "run_results.json"
    runs = []
    if artifacts.exists():
        shutil.copy2(artifacts, RUN / (label + "_run_results.json"))
        runs = json.loads(artifacts.read_text(encoding="utf-8"))["results"]
        record["statuses"] = dict(Counter(row["status"] for row in runs))
        record["nonpassing"] = [{k: row.get(k) for k in ("unique_id", "status", "failures")} for row in runs if row["status"] not in ("success", "pass")]
    result["commands"].append(record)
    persist()
    print(label, completed.returncode, record.get("statuses"), flush=True)
    check(completed.returncode == expected, f"{label}: expected exit {expected}")
    return runs


def query(sql):
    with duckdb.connect(str(PROJECT / "clube_do_valor.duckdb"), read_only=True) as connection:
        cursor = connection.execute(sql)
        columns = [item[0] for item in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


def export(name, rows):
    with (RUN / (name + ".csv")).open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def expected_portfolio(rows):
    grouped = defaultdict(lambda: {"net_quantity": Decimal(0), "net_financial_amount": Decimal(0), "transaction_count": 0, "last_transaction_date": ""})
    for row in rows:
        group = grouped[row["client_id"], row["asset_ticker"]]
        sign = 1 if row["operation"] == "BUY" else -1
        group["net_quantity"] += sign * Decimal(row["quantity"])
        group["net_financial_amount"] += sign * Decimal(row["quantity"]) * Decimal(row["unit_price"])
        group["transaction_count"] += 1
        group["last_transaction_date"] = max(group["last_transaction_date"], row["transaction_date"])
    return [{"client_id": key[0], "asset_ticker": key[1], **values} for key, values in sorted(grouped.items())]


def reconcile(label, expected):
    facts = query("select * from fact_transactions order by transaction_id")
    normalized = [{**row, "transaction_date": str(row["transaction_date"])} for row in facts]
    compare_rows(normalized, expected, tuple(expected[0]), ("quantity", "unit_price"))
    for row in facts:
        amount = row["quantity"] * row["unit_price"]
        sign = 1 if row["operation"] == "BUY" else -1
        check((row["transaction_amount"], row["signed_quantity"], row["signed_amount"]) == (amount, sign * row["quantity"], sign * amount), f"{label}: arithmetic {row['transaction_id']}")
    portfolios = query("select * from mart_client_portfolio order by client_id, asset_ticker")
    wanted = expected_portfolio(expected)
    normalized_portfolios = [{**row, "last_transaction_date": str(row["last_transaction_date"])} for row in portfolios]
    compare_rows(normalized_portfolios, wanted, tuple(wanted[0]), ("net_quantity", "net_financial_amount", "transaction_count"))
    check(len({row["transaction_id"] for row in facts}) == len(facts), label + ": fact IDs unique")
    result["snapshots"].append({"label": label, "facts": len(facts), "portfolios": len(portfolios),
        "net_quantity": sum(row["net_quantity"] for row in portfolios),
        "net_financial_amount": sum(row["net_financial_amount"] for row in portfolios),
        "negative_positions": [row for row in portfolios if row["net_quantity"] < 0]})
    export(label + "_facts", facts)
    export(label + "_portfolio", portfolios)
    persist()
    return facts, portfolios


def write_fixture(rows):
    with (PROJECT / "seeds" / "transactions.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def main():
    PROJECT.mkdir(parents=True)
    names = ["models", "macros", "tests", "seeds", "dbt_project.yml", "profiles.yml", "README.md", "requirements.txt", "requirements-lock.txt"]
    originals = []
    for name in names:
        source = ROOT / name
        if source.is_dir():
            shutil.copytree(source, PROJECT / name)
            originals.extend(p for p in source.rglob("*") if p.is_file())
        else:
            shutil.copy2(source, PROJECT / name)
            originals.append(source)
    main_database = ROOT / "clube_do_valor.duckdb"
    if main_database.exists():
        originals.append(main_database)
    before = {str(path.relative_to(ROOT)): digest(path) for path in originals}
    result["original_sha256_before"] = before
    for line in (ROOT / "requirements-lock.txt").read_text(encoding="utf-8").splitlines():
        if "==" in line and not line.startswith("#"):
            package, wanted = line.strip().split("==", 1)
            installed = importlib.metadata.version(package)
            result["dependency_versions"][package] = installed
            check(installed == wanted, f"Local runtime matches lock: {package}")
    html = ROOT / "docs" / "entrega" / "enunciado.html"
    if not html.is_file():
        raise FileNotFoundError(f"Enunciado ausente: {html}. Restaure docs/entrega/enunciado.html para executar a validacao.")
    audit, raw, clients, valid, canonical = oracle(html)
    for name, expected in (("transactions", raw), ("clients", clients)):
        compare_rows(read_csv(PROJECT / "seeds" / (name + ".csv")), expected, tuple(expected[0]))
    check(True, "Original seeds equal HTML values and multiplicities")
    dbt("01_seed", "seed")
    dbt("02_run", "run")
    regular = dbt("03_test", "test")
    strict = dbt("04_strict", "--warn-error", "test", expected=1)
    warnings = {row["unique_id"]: row["failures"] for row in regular if row["status"] == "warn"}
    failures = {row["unique_id"]: row["failures"] for row in strict if row["status"] == "fail"}
    known = {"assert_no_negative_position": 6, "audit_invalid_transactions": 2, "audit_duplicate_transaction_payload": 2,
             "not_null_clients_city": 1, "not_null_transactions_client_id": 1, "unique_clients_client_id": 2}
    check({key.split('.')[2]: value for key, value in warnings.items()} == known, "Exactly six known warning tests and expected failing-row counts")
    check(warnings == failures and Counter(row["status"] for row in strict) == {"pass": 71, "fail": 6}, "Strict mode promotes only six known warnings")
    facts, portfolios = reconcile("baseline", valid)
    dimension = query("select client_id, client_name as name, city, state, created_at from dim_clients order by client_id")
    compare_rows([{**row, "created_at": str(row["created_at"])} for row in dimension], canonical, tuple(canonical[0]))
    export("baseline_clients", dimension)
    compare_rows([{**row, "net_financial_value": row["net_financial_amount"]} for row in portfolios], audit["portfolio"],
                 ("client_id", "asset_ticker", "net_quantity", "net_financial_value"), ("net_quantity", "net_financial_value"))
    check((len(facts), len(dimension), len(portfolios)) == (98, 25, 55), "Baseline matches independent HTML oracle: 98 facts / 25 clients / 55 positions")
    dbt("05_docs", "docs", "generate")
    manifest = json.loads((PROJECT / "target" / "manifest.json").read_text(encoding="utf-8"))
    coverage = []
    for node in manifest["nodes"].values():
        if node["resource_type"] not in ("model", "seed"):
            continue
        actual_columns = [row["column_name"] for row in query(f"select column_name from information_schema.columns where table_schema='main' and table_name='{node['name']}' order by ordinal_position")]
        check(bool(node["description"].strip()), f"Model/seed description: {node['name']}")
        check(set(actual_columns) == set(node["columns"]), f"All physical columns documented: {node['name']}")
        check(all(col["description"].strip() for col in node["columns"].values()), f"Nonempty column descriptions: {node['name']}")
        coverage.append({"relation": node["name"], "columns": actual_columns})
    result["documentation_coverage"] = coverage
    dbt("06_unchanged", "run")
    unchanged, _ = reconcile("unchanged", valid)
    check(facts == unchanged, "Unchanged incremental preserves every fact field")

    same_day = dict(zip(raw[0], ["QA_WATERMARK", "C1", "PETR4", "BUY", "2.5000", "40.1250", "2024-08-10"]))
    fixture = [dict(row) for row in raw] + [same_day]
    expected = [dict(row) for row in valid] + [same_day]
    write_fixture(fixture)
    dbt("07_seed_watermark", "seed")
    dbt("08_run_watermark", "run")
    reconcile("same_day_watermark", expected)

    future = {**same_day, "transaction_id": "QA_FUTURE", "quantity": "1.2500", "transaction_date": "2024-08-11"}
    boundary = {**same_day, "transaction_id": "QA_BOUNDARY", "quantity": "3", "transaction_date": "2024-07-11"}
    late = {**same_day, "transaction_id": "QA_LATE", "quantity": "4", "transaction_date": "2024-07-20"}
    fixture.extend([future, boundary, late])
    expected.extend([future, boundary, late])
    for rows in (fixture, expected):
        for row in rows:
            if row["transaction_id"] == "T100":
                row["quantity"] = "231.1250"
    write_fixture(fixture)
    dbt("09_seed_window", "seed")
    dbt("10_run_window", "run")
    reconcile("future_late_boundary_correction", expected)
    dbt("11_rerun_window", "run")
    reconcile("rerun_after_changes", expected)

    outside = {**same_day, "transaction_id": "QA_OUTSIDE", "quantity": "5", "transaction_date": "2024-07-11"}
    fixture.append(outside)
    write_fixture(fixture)
    dbt("12_seed_outside", "seed")
    dbt("13_run_outside", "run")
    reconcile("outside_window_deferred", expected)
    check(not query("select transaction_id from fact_transactions where transaction_id='QA_OUTSIDE'"), "Arrival 31 days behind new watermark is deferred as documented")
    expected.append(outside)
    dbt("14_full_refresh", "run", "--full-refresh")
    reconcile("full_refresh", expected)
    after = {str(path.relative_to(ROOT)): digest(path) for path in originals}
    result["original_sha256_after"] = after
    check(before == after, "Original source/model/config/README/dependency files and main database bytes unchanged")
    result["status"] = "passed"
    result["completed_at"] = datetime.now(timezone.utc).isoformat()
    persist()
    print("PASS: independent QA; evidence", EVIDENCE, flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        result["status"] = "failed"
        result["error"] = repr(exc)
        persist()
        raise
