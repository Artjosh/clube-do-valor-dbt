"""Read-only private-access probes. Never send OTP/email; never persist cookies.

Optional CDV_QA_NO_GRANT_COOKIE/CDV_QA_AUTHORIZED_COOKIE are read from environment
only and omitted from evidence. Supply only isolated test sessions if needed.
"""
import argparse
import csv
from decimal import Decimal
import io
import hashlib
import json
import os
from pathlib import Path
import re
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
MARKERS = ("Ana Souza", "Bruno Lima", "Felipe Nunes", '"transaction_id":"T001"', '"transaction_id": "T001"', '"net_financial_amount":6840', '"net_financial_amount": 6840')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    parser.add_argument("--label", default="local")
    parser.add_argument("--unconfigured", action="store_true")
    parser.add_argument("--assets-dir", type=Path)
    parser.add_argument("--fixtures", type=Path, help="Ignored isolated QA session manifest; secrets are never written to evidence")
    parser.add_argument("--user-agent", help="Explicit HTTP client identity for hosting compatibility")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", args.label):
        raise ValueError("Label must be a simple artifact name")
    result = {"executed_at": datetime.now(timezone.utc).isoformat(), "url": args.url,
              "mode": "unconfigured" if args.unconfigured else "configured", "user_agent": args.user_agent or "Python urllib default", "checks": [], "responses": [], "skipped": []}
    assets = set()
    fixtures = json.loads(args.fixtures.read_text(encoding="utf-8")) if args.fixtures else {}
    no_grant_cookie = fixtures.get("noRole", {}).get("cookie") or os.environ.get("CDV_QA_NO_GRANT_COOKIE")
    authorized_cookie = fixtures.get("analyst", {}).get("cookie") or os.environ.get("CDV_QA_AUTHORIZED_COOKIE")

    def check(ok, name):
        result["checks"].append({"name": name, "passed": bool(ok)})

    def get(path, headers=None, cookie=None):
        url = urljoin(args.url, path)
        if urlsplit(url).netloc != urlsplit(args.url).netloc:
            raise ValueError("Only same-origin probes allowed")
        request_headers = {**({"User-Agent": args.user_agent} if args.user_agent else {}), **(headers or {})}
        if cookie:
            request_headers["Cookie"] = cookie
        try:
            response = urlopen(Request(url, headers=request_headers), timeout=30)
        except HTTPError as error:
            response = error
        with response:
            body = response.read().decode("utf-8", errors="replace")
            status = response.status
            selected_headers = {name: response.headers.get(name) for name in ("Content-Type", "Cache-Control", "Vary", "X-CDV-Data-Access")}
        decoded = body.replace('\\"', '"').replace("\\u0022", '"')
        found = [marker for marker in MARKERS if marker in decoded]
        result["responses"].append({"path": path, "status": status, "bytes": len(body.encode()), "dataset_markers": found, "headers": selected_headers})
        return status, body, found, selected_headers

    identities = [("anonymous", None, 503 if args.unconfigured else 401)]
    identities.append(("forged-cookie", "cdv-session=" + "02" * 32 + "; __Host-cdv-session=" + "02" * 32, 503 if args.unconfigured else 401))
    if no_grant_cookie:
        identities.append(("authenticated-no-grant", no_grant_cookie, 403))
    else:
        result["skipped"].append("No-grant real session: no isolated test cookie supplied; assess backend live evidence separately")
    for identity, cookie, expected_status in identities:
        for path in ("/api/analytics", "/api/analytics?client=C1", "/api/export?kind=transactions", "/api/export?kind=clients", "/api/export?kind=portfolios"):
            status, body, found, headers = get(path, cookie=cookie)
            check(status == expected_status, identity + " denies data " + path)
            check(not found and "transaction_id,client_id" not in body, identity + " no payload " + path)
            check("no-store" in (headers.get("Cache-Control") or ""), identity + " private cache policy " + path)
        for tier in ("copper", "silver", "gold"):
            for variant, headers in (("html", {}), ("rsc", {"RSC": "1"}), ("prefetch", {"RSC": "1", "Next-Router-Prefetch": "1"}), ("rsc-path", {})):
                path = ("/.rsc?tier=" if variant == "rsc-path" else "/?tier=") + tier + ("&_rsc=qa-access" if variant not in ("html", "rsc-path") else "")
                status, body, found, response_headers = get(path, headers, cookie)
                check(not found, identity + " SSR/RSC no dataset " + tier + " " + variant)
                check(status in (200, 401, 403, 503), identity + " safe page response " + tier + " " + variant)
                check("no-store" in (response_headers.get("Cache-Control") or ""), identity + " SSR/RSC no-store " + tier + " " + variant)
                if identity == "anonymous" and variant == "html":
                    assets.update(re.findall(r'(?:src|href)=["\']([^"\']+\.(?:js|mjs)(?:\?[^"\']*)?)["\']', body))
    for path in ("/data/analytics.json", "/analytics.json", "/web/data/analytics.json"):
        status, _, found, _ = get(path)
        check(status != 200 and not found, "Snapshot cannot be fetched directly " + path)
    if args.assets_dir:
        for path in args.assets_dir.rglob("*"):
            if path.is_file() and path.suffix in (".js", ".mjs", ".json", ".map"):
                assets.add("/" + path.relative_to(args.assets_dir).as_posix())
    for path in sorted(assets):
        if path.startswith("http") and urlsplit(path).netloc != urlsplit(args.url).netloc:
            continue
        status, _, found, _ = get(path)
        check(not found, "Public asset has no dataset markers " + path)
    result["asset_count"] = len(assets)
    cookie = authorized_cookie
    if cookie:
        status, body, _, _ = get("/api/analytics", cookie=cookie)
        check(status == 200, "Authorized analytics works")
        if status == 200:
            data = json.loads(body)
            check(data["summary"]["transactionCount"] == 98, "Authorized baseline is 98 facts")
        baseline = json.loads((ROOT / "docs/qa/web_dataset.json").read_text(encoding="utf-8"))
        numeric = {"quantity", "unit_price", "transaction_amount", "signed_quantity", "signed_amount", "net_quantity", "net_financial_amount", "transaction_count"}
        for kind, table, keys in (("transactions", "fact_transactions", ("transaction_id",)), ("portfolios", "mart_client_portfolio", ("client_id", "asset_ticker")), ("clients", "dim_clients", ("client_id",))):
            status, body, _, _ = get("/api/export?kind=" + kind, cookie=cookie)
            check(status == 200, "Authorized CSV " + kind)
            if status == 200:
                rows = list(csv.DictReader(io.StringIO(body.lstrip('\ufeff'))))
                expected = {tuple(str(r[k]) for k in keys): r for r in baseline[table]}
                actual = {tuple(r[k] for k in keys): r for r in rows}
                check(len(rows) == len(expected) and set(actual) == set(expected), "CSV grain/count " + kind)
                same = set(actual) == set(expected)
                for key in set(actual) & set(expected):
                    for field, value in expected[key].items():
                        observed = actual[key].get(field)
                        same = same and observed is not None and (Decimal(observed) == Decimal(str(value)) if field in numeric else observed == str(value))
                check(same, "CSV every baseline column reconciles " + kind)
        for tier in ("copper", "silver", "gold"):
            for path, headers in (("/?tier=" + tier, {}), ("/.rsc?tier=" + tier, {}), ("/?tier=" + tier, {"RSC": "1"})):
                status, body, found, headers = get(path, headers=headers, cookie=cookie)
                check(status == 200 and bool(found), "Authorized SSR/RSC contains dataset " + path)
                check("no-store" in (headers.get("Cache-Control") or ""), "Authorized SSR/RSC no-store " + path)
    else:
        result["skipped"].append("Authorized session: no isolated test cookie supplied; assess backend live evidence separately")
    result["failed"] = [row["name"] for row in result["checks"] if not row["passed"]]
    destination = ROOT / "docs/qa" / ("web_access_http_" + args.label + ".json")
    destination.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"checks": len(result["checks"]), "failed": result["failed"], "assets": result["asset_count"], "skipped": result["skipped"]}, indent=2))
    raise SystemExit(bool(result["failed"]))


if __name__ == "__main__":
    main()
