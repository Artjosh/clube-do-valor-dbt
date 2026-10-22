"""Check disabled-auth HTTP boundaries only; never sends email or real credentials."""
import json
from pathlib import Path
import sys
from web_http import request

root = Path(__file__).resolve().parents[2]
base = sys.argv[1]
checks = []


def check(ok, name, detail=None):
    checks.append({"passed": bool(ok), "name": name, "detail": detail})


status, headers, payload = request(base, "/api/auth/session")
session = json.loads(payload)
check(status == 200 and session.get("authenticated") is False, "Anonymous session", status)
if session.get("configured") is not False:
    raise RuntimeError("Auth configured: do not invoke start or other mutating endpoints without a separate test-only provider")
check(session.get("reason") == "auth_not_configured", "Disabled auth declared honestly")
status, _, payload = request(base, "/api/health")
health = json.loads(payload)
check(status == 200 and health.get("auth", {}).get("configured") is False and health.get("auth", {}).get("providerHealth") == "not_probed", "Health declares provider not probed")
for origin in (base, "https://attacker.invalid"):
    for path, method, data in (
        ("/api/auth/device/start", "POST", {"email": "qa@example.invalid"}),
        ("/api/auth/device/poll?challengeId=" + "01" * 32, "GET", None),
        ("/api/auth/device/confirmation", "GET", None),
        ("/api/auth/device/approve", "POST", {"displayCode": "00000000"}),
        ("/api/auth/logout", "POST", {}),
        ("/api/auth/confirm?challengeId=" + "01" * 32 + "&type=email&token_hash=synthetic-token-not-real-000000000000", "GET", None),
    ):
        status, response_headers, body = request(base, path, method, data, {"Origin": origin, "Cookie": "cdv-session=" + "02" * 32})
        label = path.split("?")[0] + " origin=" + ("same" if origin == base else "foreign")
        edge_rejected = origin != base and status == 403 and body == "Forbidden"
        check(edge_rejected or (status == 503 and json.loads(body).get("error") == "auth_not_configured"), label + " fails closed", status)
        normalized = {k.lower(): v for k, v in response_headers.items()}
        check("set-cookie" not in normalized, label + " never mints session")
        if not edge_rejected:
            check("no-store" in normalized.get("cache-control", ""), label + " noncacheable")
            check(normalized.get("x-content-type-options") == "nosniff", label + " nosniff")
        check(normalized.get("access-control-allow-origin") in (None, base), label + " no foreign cross-origin grants")
status, _, body = request(base, "/api/auth/session", headers={"Cookie": "cdv-session=" + "02" * 32})
check(status == 200 and json.loads(body).get("authenticated") is False, "Forged cookie cannot authenticate")
for path in ("/api/auth/device/start", "/api/auth/device/approve", "/api/auth/logout"):
    status, _, _ = request(base, path)
    check(status == 405, "GET cannot mutate " + path, status)
failures = [r["name"] for r in checks if not r["passed"]]
(root / "docs/qa/web_auth_http_results.json").write_text(json.dumps({"checks": checks, "failures": failures, "scope": "auth disabled; no email/provider calls; synthetic cookies only"}, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"checks": len(checks), "failures": failures}, indent=2))
raise SystemExit(bool(failures))
