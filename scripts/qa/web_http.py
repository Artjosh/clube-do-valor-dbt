"""HTTP analytics verification against immutable read-only database snapshot."""
import argparse
from collections import Counter, defaultdict
import csv
from decimal import Decimal
import io
import json
import unicodedata
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
D = Decimal


def request(base, path, method="GET", data=None, headers=None):
    body = None if data is None else json.dumps(data).encode()
    req = Request(base.rstrip("/") + path, data=body, method=method,
                  headers={"Content-Type": "application/json", **(headers or {})})
    try:
        response = urlopen(req, timeout=30)
    except HTTPError as exc:
        response = exc
    with response:
        return response.status, dict(response.headers), response.read().decode("utf-8-sig")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    args = parser.parse_args()
    baseline = json.loads((ROOT / "docs/qa/web_dataset.json").read_text(encoding="utf-8"))
    evidence = {"base_url": args.url, "checks": [], "failures": []}

    def check(ok, label, detail=None):
        evidence["checks"].append({"label": label, "passed": bool(ok), "detail": detail})
        if not ok:
            evidence["failures"].append(label)

    cases = [{}, {"client": "C1"}, {"client": "C11"}, {"asset": "BBDC4"},
             {"operation": "SELL"}, {"from": "2024-03-27", "to": "2024-03-27"},
             {"client": "C5", "asset": "BBDC4"}, {"from": "2025-01-01"},
             {"client": "C1", "operation": "BUY", "from": "2024-01-05", "to": "2024-01-05"},
             {"q": "Ána"}, {"q": "T035"}, {"q": "<script>alert(1)</script>"}]
    for filters in cases:
        label = urlencode(filters) or "baseline"
        rows = baseline["fact_transactions"]
        for parameter, column in (("client", "client_id"), ("asset", "asset_ticker"), ("operation", "operation")):
            if parameter in filters:
                rows = [r for r in rows if r[column] == filters[parameter]]
        rows = [r for r in rows if (not filters.get("from") or r["transaction_date"] >= filters["from"]) and (not filters.get("to") or r["transaction_date"] <= filters["to"])]
        if filters.get("q"):
            clients = {r["client_id"]: r for r in baseline["dim_clients"]}
            def folded(value):
                return "".join(c for c in unicodedata.normalize("NFD", value) if not unicodedata.combining(c)).lower()
            rows = [r for r in rows if folded(filters["q"]) in folded(" ".join([r["transaction_id"], r["client_id"], clients[r["client_id"]]["client_name"], r["asset_ticker"], clients[r["client_id"]]["city"], clients[r["client_id"]]["state"]]))]
        status, headers, body = request(args.url, "/api/analytics?" + urlencode(filters))
        check(status == 200, label + " analytics HTTP", status)
        if status != 200:
            continue
        data = json.loads(body, parse_float=D)
        check(Counter(r["transaction_id"] for r in data["transactions"]) == Counter(r["transaction_id"] for r in rows), label + " exact transaction IDs")
        sums = {op: sum((D(r["transaction_amount"]) for r in rows if r["operation"] == op), D(0)) for op in ("BUY", "SELL")}
        expected = {"transactionCount": len(rows), "activeClients": len({r["client_id"] for r in rows}), "registeredClients": 25,
                    "assetCount": len({r["asset_ticker"] for r in rows}), "buyCount": sum(r["operation"] == "BUY" for r in rows),
                    "sellCount": sum(r["operation"] == "SELL" for r in rows), "buyAmount": sums["BUY"], "sellAmount": sums["SELL"],
                    "netAmount": sums["BUY"] - sums["SELL"], "grossAmount": sums["BUY"] + sums["SELL"]}
        grouped = defaultdict(lambda: [D(0), D(0), 0, ""])
        for row in rows:
            group = grouped[row["client_id"], row["asset_ticker"]]
            group[0] += D(row["signed_quantity"])
            group[1] += D(row["signed_amount"])
            group[2] += 1
            group[3] = max(group[3], row["transaction_date"])
        expected["portfolioCount"] = len(grouped)
        expected["negativePositions"] = sum(v[0] < 0 for v in grouped.values())
        for key, value in expected.items():
            check(data["summary"].get(key) == value, label + " summary " + key, {"expected": value, "actual": data["summary"].get(key)})
        actual = {(r["client_id"], r["asset_ticker"]): [D(str(r["net_quantity"])), D(str(r["net_financial_amount"])), r["transaction_count"], r["last_transaction_date"]] for r in data["portfolios"]}
        check(actual == dict(grouped) and len(data["portfolios"]) == len(grouped), label + " all portfolio fields and grain")
        for kind in ("transactions", "portfolios", "clients"):
            status, headers, csv_body = request(args.url, "/api/export?" + urlencode({"kind": kind, **filters}))
            check(status == 200 and "text/csv" in headers.get("Content-Type", headers.get("content-type", "")), label + " CSV " + kind, status)
            if status == 200:
                exported = list(csv.DictReader(io.StringIO(csv_body)))
                if kind == "transactions":
                    check(Counter(r["transaction_id"] for r in exported) == Counter(r["transaction_id"] for r in rows), label + " CSV transaction IDs")
                    expected_fields = tuple(baseline["fact_transactions"][0])
                    numeric = {"quantity", "unit_price", "transaction_amount", "signed_quantity", "signed_amount"}
                    def normalized(row):
                        return tuple(D(str(row[k])) if k in numeric else row[k] for k in expected_fields)
                    check(Counter(map(normalized, exported)) == Counter(map(normalized, rows)), label + " CSV exact decimals and all fact fields")
                else:
                    check(len(exported) == len(data[kind]), label + " CSV row count " + kind)
                    columns = list(exported[0]) if exported else []
                    numeric = {"net_quantity", "net_financial_amount", "transaction_count", "transactionCount", "buyAmount", "sellAmount", "netAmount"}
                    def normalized_aggregate(row):
                        return tuple(D(str(row[k])) if k in numeric else str(row[k]) for k in columns)
                    check(Counter(map(normalized_aggregate, exported)) == Counter(map(normalized_aggregate, data[kind])), label + " CSV all aggregate fields " + kind)
    for query in ("operation=HACK", "from=2024-02-30", "from=2024-08-01&to=2024-01-01", "client=%27%20OR%201=1--"):
        status, _, _ = request(args.url, "/api/analytics?" + query)
        check(status == 400, "Invalid filter rejected: " + query, status)
    status, _, _ = request(args.url, "/api/export?kind=invalid")
    check(status == 400, "Unknown export kind rejected", status)
    for path in ("/api/analytics", "/api/export"):
        status, _, _ = request(args.url, path, "POST", {})
        check(status == 405, "Read-only endpoint method " + path, status)
    (ROOT / "docs/qa/web_http_results.json").write_text(json.dumps(evidence, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")
    print(json.dumps({"checks": len(evidence["checks"]), "failures": evidence["failures"]}, indent=2))
    raise SystemExit(bool(evidence["failures"]))


if __name__ == "__main__":
    main()
