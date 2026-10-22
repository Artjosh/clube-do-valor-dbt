"""Independent module-level Decimal reconciliation, without framework/build/dbt."""
import json
from collections import Counter, defaultdict
from decimal import Decimal as D
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
baseline = json.loads((ROOT / "docs/qa/web_dataset.json").read_text(encoding="utf-8"))
snapshot = json.loads((ROOT / "web/data/analytics.json").read_text(encoding="utf-8"))
checks = []


def check(ok, name):
    if not ok:
        raise AssertionError(name)
    checks.append(name)


for source, target in (("transactions", "fact_transactions"), ("clients", "dim_clients"), ("portfolios", "mart_client_portfolio")):
    columns = tuple(baseline[target][0])
    expected = Counter(tuple(row[col] for col in columns) for row in baseline[target])
    actual = Counter(tuple(row[col] for col in columns) for row in snapshot[source])
    check(actual == expected, "Snapshot exact fields: " + source)
check(snapshot["meta"]["sourceHash"] == baseline["sha256"]["clube_do_valor.duckdb"], "Snapshot DB hash matches independent baseline")
cases = [{}] + [{"client": row["client_id"]} for row in baseline["dim_clients"]]
cases += [{"asset": ticker} for ticker in sorted({row["asset_ticker"] for row in baseline["fact_transactions"]})]
cases += [{"operation": "BUY"}, {"operation": "SELL"}, {"from": "2024-03-27", "to": "2024-03-27"}, {"from": "2025-01-01"}]
code = "import {getAnalytics} from './web/lib/analytics.ts'; console.log(JSON.stringify(" + json.dumps(cases) + ".map(f=>getAnalytics(f))));"
completed = subprocess.run(["node", "--input-type=module", "-e", code], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
check(completed.returncode == 0, "Node direct module import exit 0")
answers = json.loads(completed.stdout, parse_float=D)
for filters, answer in zip(cases, answers):
    label = str(filters)
    rows = [r for r in baseline["fact_transactions"] if all(r[col] == filters[key] for key, col in (("client", "client_id"), ("asset", "asset_ticker"), ("operation", "operation")) if key in filters)]
    rows = [r for r in rows if (not filters.get("from") or r["transaction_date"] >= filters["from"]) and (not filters.get("to") or r["transaction_date"] <= filters["to"])]
    check(Counter(r["transaction_id"] for r in answer["transactions"]) == Counter(r["transaction_id"] for r in rows), label + " transaction IDs")
    groups = defaultdict(lambda: [D(0), D(0)])
    for row in rows:
        group = groups[row["client_id"], row["asset_ticker"]]
        group[0] += D(row["signed_quantity"])
        group[1] += D(row["signed_amount"])
    actual = {(row["client_id"], row["asset_ticker"]): [D(str(row["net_quantity"])), D(str(row["net_financial_amount"]))] for row in answer["portfolios"]}
    check(actual == dict(groups), label + " all portfolio decimals")
    expected_net = sum((D(row["signed_amount"]) for row in rows), D(0))
    check(answer["summary"]["netAmount"] == expected_net, label + " summary net")
    check(sum((r["netAmount"] for r in answer["assets"]), D(0)) == expected_net, label + " assets reconcile")
    check(sum((r["netAmount"] for r in answer["clients"]), D(0)) == expected_net, label + " clients reconcile")
    cumulative = D(0)
    for day in answer["daily"]:
        day_net = sum((D(row["signed_amount"]) for row in rows if row["transaction_date"] == day["date"]), D(0))
        cumulative += day_net
        check(day["netAmount"] == day_net and day["cumulativeNet"] == cumulative, label + " daily " + day["date"])
    check(cumulative == expected_net, label + " daily final equals net")
result = {"passed": True, "cases": len(cases), "checks": checks, "node_exit": completed.returncode}
(ROOT / "docs/qa/web_module_results.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"PASS: {len(cases)} filter cases; {len(checks)} independent checks")
