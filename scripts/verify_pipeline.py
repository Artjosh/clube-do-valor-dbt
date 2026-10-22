"""Functional integration test in an isolated temporary project; never edits original seeds."""
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

import duckdb

ROOT = Path(__file__).resolve().parents[1]
DBT = Path(sys.executable).parent / ("dbt.exe" if os.name == "nt" else "dbt")
evidence = {"executed_at": datetime.now(timezone.utc).isoformat(), "commands": [], "checks": []}


def check(condition, description):
    if not condition:
        raise AssertionError(description)
    evidence["checks"].append(description)


with tempfile.TemporaryDirectory(prefix="cdv-dbt-") as directory:
    project = Path(directory)
    for name in ["models", "macros", "tests", "seeds"]:
        shutil.copytree(ROOT / name, project / name)
    for name in ["profiles.yml", "dbt_project.yml"]:
        shutil.copy2(ROOT / name, project / name)
    database = project / "validation.duckdb"
    env = dict(os.environ, DBT_DUCKDB_PATH=database.as_posix(), DBT_SEND_ANONYMOUS_USAGE_STATS="false")
    evidence["seed_sha256"] = {
        p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT / "seeds").glob("*.csv")
    }

    def dbt(*args, expected=0):
        command = [str(DBT), *args, "--profiles-dir", "."]
        result = subprocess.run(command, cwd=project, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace")
        record = {"command": "dbt " + " ".join(args) + " --profiles-dir .", "exit_code": result.returncode}
        artifacts = project / "target" / "run_results.json"
        if artifacts.exists():
            archive = ROOT / "target" / "evidence"
            archive.mkdir(parents=True, exist_ok=True)
            label = "_".join(args).replace("--", "")
            shutil.copy2(artifacts, archive / f"functional_{len(evidence['commands']) + 1:02d}_{label}.json")
            runs = json.loads(artifacts.read_text(encoding="utf-8"))["results"]
            record["statuses"] = dict(Counter(r["status"] for r in runs))
            record["nonpassing"] = [{"test": r["unique_id"], "status": r["status"], "failures": r.get("failures")} for r in runs if r["status"] not in ["pass", "success"]]
        evidence["commands"].append(record)
        print(record["command"], "=>", result.returncode, flush=True)
        if result.returncode != expected:
            print(result.stdout, result.stderr)
            raise AssertionError(f"Expected exit {expected}, got {result.returncode}")

    def query(sql, parameters=None):
        with duckdb.connect(str(database)) as connection:
            return connection.execute(sql, parameters or []).fetchall()

    dbt("seed")
    dbt("run")
    dbt("test")
    counts = {table: query(f"select count(*) from {table}")[0][0] for table in [
        "transactions", "clients", "stg_clients", "stg_transactions", "int_transactions",
        "dim_clients", "fact_transactions", "mart_client_portfolio"]}
    evidence["baseline_counts"] = counts
    check(counts == dict(zip(counts, [100, 27, 25, 98, 98, 25, 98, 55])), "Expected counts in every layer")
    check(query("select city from dim_clients where client_id='C6'") == [("Brasilia",)], "Complete C6 registration preferred")
    check(query("select transaction_id from fact_transactions where transaction_id in ('T035','T036') order by 1") == [("T035",), ("T036",)], "Distinct IDs with equal payload both preserved")
    rejected = query("select transaction_id, rejection_reason from main_dbt_test__audit.audit_invalid_transactions order by 1")
    check(rejected == [("T021", "missing_client_id"), ("T037", "nonpositive_quantity")], "Invalid records excluded and auditable")
    evidence["rejected"] = rejected
    negatives = query("select client_id, asset_ticker, net_quantity, net_financial_amount from mart_client_portfolio where net_quantity < 0 order by 1,2")
    evidence["negative_positions"] = [[str(v) for v in row] for row in negatives]
    check([(r[0], r[1], int(r[2])) for r in negatives] == [
        ("C1", "BBDC4", -50), ("C3", "WEGE3", -30), ("C5", "BBDC4", -400),
        ("C6", "ITUB4", -50), ("C7", "WEGE3", -60), ("C8", "VALE3", -30)
    ], "Negative positions match expected pairs")
    baseline = query("select * from fact_transactions order by transaction_id")
    dbt("run")
    check(query("select * from fact_transactions order by transaction_id") == baseline, "Unchanged incremental run is idempotent")
    dbt("--warn-error", "test", expected=1)
    dbt("docs", "generate")
    check((project / "target/catalog.json").exists(), "Documentation catalog generated")

    # Temporary database mutations only; source CSVs remain byte-identical.
    query("insert into transactions values ('NEW','C1','PETR4','BUY','2','40','2024-08-11')")
    query("insert into transactions values ('LATE','C1','PETR4','BUY','3','40','2024-07-15')")
    query("update transactions set quantity='231' where transaction_id='T100'")
    dbt("run")
    check(query("select count(*) from fact_transactions") == [(100,)], "New and in-window late records inserted")
    check(int(query("select quantity from fact_transactions where transaction_id='T100'")[0][0]) == 231, "In-window correction replaced by transaction_id")
    changed = query("select * from fact_transactions order by transaction_id")
    dbt("run")
    check(query("select * from fact_transactions order by transaction_id") == changed, "Incremental inserts and corrections remain idempotent")
    query("insert into transactions values ('OLD','C1','PETR4','BUY','1','40','2024-01-01')")
    query("update transactions set quantity='101' where transaction_id='T001'")
    query("delete from transactions where transaction_id='T099'")
    query("update transactions set quantity='-1' where transaction_id='T098'")
    dbt("run")
    check(query("select count(*) from fact_transactions where transaction_id='OLD'") == [(0,)], "Beyond-window late arrival deferred")
    check(int(query("select quantity from fact_transactions where transaction_id='T001'")[0][0]) == 100, "Beyond-window correction deferred")
    check(query("select count(*) from fact_transactions where transaction_id in ('T098','T099')") == [(2,)], "Deletes and newly-invalid records require full refresh")
    dbt("run", "--full-refresh")
    check(query("select count(*) from fact_transactions where transaction_id='OLD'") == [(1,)], "Full refresh incorporates old arrival")
    check(int(query("select quantity from fact_transactions where transaction_id='T001'")[0][0]) == 101, "Full refresh incorporates old correction")
    check(query("select count(*) from fact_transactions where transaction_id in ('T098','T099')") == [(0,)], "Full refresh removes deleted and newly-invalid records")
    dbt("seed", "--full-refresh")
    dbt("run", "--full-refresh")
    dbt("test")
    check(query("select * from fact_transactions order by transaction_id") == baseline, "Original dataset restored exactly after scenario suite")

evidence["result"] = "passed"
destination = ROOT / "scripts" / "validation_results.json"
destination.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"PASS: {len(evidence['checks'])} checks; evidence: {destination}")
