"""Independent stdlib oracle. Reads HTML, optionally compares exported CSVs; no DB access."""
import argparse
import csv
import hashlib
import io
import json
import re
from collections import Counter, defaultdict
from datetime import date
from decimal import Decimal
from pathlib import Path


def extract(source, function):
    match = re.search(r"function " + function + r"\(\)\s*\{\s*var rows = (\[.*?\]);", source, re.S)
    if not match:
        raise ValueError("Missing embedded rows: " + function)
    return list(csv.DictReader(io.StringIO("\n".join(json.loads(match.group(1))))))


def read_csv(path):
    with Path(path).open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def decimal(value):
    result = Decimal(value)
    if not result.is_finite():
        raise ValueError("Non-finite number")
    return result


def oracle(path):
    raw = Path(path).read_bytes()
    source = raw.decode("utf-8-sig")
    transactions = extract(source, "downloadTransactions")
    clients = extract(source, "downloadClients")
    canonical = {}
    for row in clients:
        date.fromisoformat(row["created_at"])
        if not row["client_id"]:
            raise ValueError("Unexpected client without ID")
        old = canonical.get(row["client_id"])
        if old is None or sum(bool(v) for v in row.values()) > sum(bool(v) for v in old.values()):
            canonical[row["client_id"]] = row
    invalid = {}
    valid = []
    payloads = defaultdict(list)
    for row in transactions:
        payloads[tuple(v for k, v in row.items() if k != "transaction_id")].append(row["transaction_id"])
        reasons = []
        if any(not row[k] for k in row):
            reasons.append("missing_required_field")
        if row["client_id"] and row["client_id"] not in canonical:
            reasons.append("unknown_client")
        if row["operation"] not in ("BUY", "SELL"):
            reasons.append("invalid_operation")
        try:
            if decimal(row["quantity"]) <= 0:
                reasons.append("nonpositive_quantity")
            if decimal(row["unit_price"]) <= 0:
                reasons.append("nonpositive_price")
            date.fromisoformat(row["transaction_date"])
        except (ValueError, ArithmeticError):
            reasons.append("invalid_type")
        if reasons:
            invalid[row["transaction_id"]] = reasons
        else:
            valid.append(row)
    portfolio = defaultdict(lambda: [Decimal(0), Decimal(0)])
    totals = {"BUY": [Decimal(0), Decimal(0)], "SELL": [Decimal(0), Decimal(0)]}
    for row in valid:
        qty = decimal(row["quantity"])
        value = qty * decimal(row["unit_price"])
        sign = 1 if row["operation"] == "BUY" else -1
        position = portfolio[row["client_id"], row["asset_ticker"]]
        position[0] += sign * qty
        position[1] += sign * value
        totals[row["operation"]][0] += qty
        totals[row["operation"]][1] += value
    positions = [{"client_id": key[0], "asset_ticker": key[1], "net_quantity": str(values[0]),
                  "net_financial_value": format(values[1], ".2f")} for key, values in sorted(portfolio.items())]
    counts = Counter(row["client_id"] for row in clients)
    report = {
        "source_sha256": hashlib.sha256(raw).hexdigest(),
        "raw_transactions": len(transactions), "valid_transactions": len(valid),
        "invalid_transactions": invalid,
        "duplicate_transaction_ids": {k: v for k, v in Counter(r["transaction_id"] for r in transactions).items() if v > 1},
        "duplicate_payload_ids": [ids for ids in payloads.values() if len(ids) > 1],
        "raw_clients": len(clients), "canonical_clients": len(canonical),
        "complete_client_rows": sum(all(r.values()) for r in clients),
        "duplicate_client_ids": {k: v for k, v in counts.items() if v > 1},
        "active_clients": sorted({r["client_id"] for r in valid}),
        "clients_without_transactions": sorted(set(canonical) - {r["client_id"] for r in valid}),
        "operation_counts": dict(Counter(r["operation"] for r in valid)),
        "totals": {k: {"quantity": str(v[0]), "financial_value": format(v[1], ".2f")} for k, v in totals.items()},
        "net_quantity": str(sum(v[0] for v in portfolio.values())),
        "net_financial_value": format(sum(v[1] for v in portfolio.values()), ".2f"),
        "portfolio_count": len(positions), "negative_positions": [r for r in positions if decimal(r["net_quantity"]) < 0],
        "portfolio": positions,
    }
    return report, transactions, clients, valid, list(canonical.values())


def compare_rows(actual, expected, columns, numeric=()):
    def normalize(row):
        return tuple(decimal(row[k]) if k in numeric else row[k] for k in columns)
    observed, wanted = Counter(map(normalize, actual)), Counter(map(normalize, expected))
    if observed != wanted:
        raise ValueError(f"CSV mismatch: missing={list((wanted-observed).items())[:5]}, unexpected={list((observed-wanted).items())[:5]}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("html", type=Path)
    parser.add_argument("--output", type=Path, help="Write complete oracle JSON")
    parser.add_argument("--seeds-dir", type=Path, help="Verify untouched seed values and multiplicities")
    parser.add_argument("--fact-csv", type=Path, help="Verify seven source fields, IDs and multiplicities")
    parser.add_argument("--clients-csv", type=Path, help="Verify canonical dimension source fields")
    parser.add_argument("--portfolio-csv", type=Path)
    parser.add_argument("--quantity-column", default="net_quantity")
    parser.add_argument("--value-column", default="net_financial_value")
    args = parser.parse_args()
    report, tx, clients, valid, canonical = oracle(args.html)
    if args.seeds_dir:
        for name, rows in (("transactions", tx), ("clients", clients)):
            compare_rows(read_csv(args.seeds_dir / (name + ".csv")), rows, tuple(rows[0]))
    if args.fact_csv:
        compare_rows(read_csv(args.fact_csv), valid, tuple(tx[0]), ("quantity", "unit_price"))
    if args.clients_csv:
        compare_rows(read_csv(args.clients_csv), canonical, tuple(clients[0]))
    if args.portfolio_csv:
        actual = read_csv(args.portfolio_csv)
        actual = [{**r, "net_quantity": r[args.quantity_column], "net_financial_value": r[args.value_column]} for r in actual]
        compare_rows(actual, report["portfolio"], ("client_id", "asset_ticker", "net_quantity", "net_financial_value"), ("net_quantity", "net_financial_value"))
    serialized = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.write_text(serialized, encoding="utf-8")
    print(serialized)


if __name__ == "__main__":
    main()
