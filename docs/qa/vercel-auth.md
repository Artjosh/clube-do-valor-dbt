# Vercel authentication HTTP QA

Executed: 2026-10-23T21:53:57.441Z. Target: https://clube-do-valor.vercel.app. Dedicated Supabase: igucxanapndewkbtarfn.

Result: **passed**; 141 passed assertions. Cleanup: **true**. No email sent and no hosted device/start calls.

Coordinator-confirmed deployment: `dpl_CQU7f2AbjUi6h5sQUC3SvS6oxqzB`. No HTTPS Request.url/origin mismatch occurred in the exercised Vercel routes.

The real six-digit provider OTP remained valid after callback GET, and eight-digit input was rejected. Repeated scanner GETs also preserved the token for explicit phone approval. The phone received masked email, no visual code and no PC session; the original PC obtained an analyst session through polling, and retry returned the identical cookie with exactly one database session. Cross-origin approval and polling with only the phone cookie were denied. Anonymous, no-role and analyst states returned 401, 403 and 200 respectively on analytics and all three CSV endpoints; malformed filters were evaluated after authorization. HTML/RSC guards, private cache headers and post-logout session replay were verified.

Harness adjustment: an initial anonymous-only pass stopped because it expected a redirect in Next prefetch. Inspection showed a 211-byte empty Flight shell with no dataset and no-store; the harness now recognizes and checks this framework response for all three identities. That initial pass created no identity fixtures and its cleanup SQL also returned zero. The 141-check result above is the subsequent complete run.

Coverage and sanitized metadata: [vercel-auth.json](vercel-auth.json). Fixtures use admin generate_link and dedicated challenge RPC; subsequent callback, OTP, approval, polling, guards and logout use real Vercel HTTP. Only this execution's exact fixture IDs are removed; shared rate buckets and real invitations are preserved.

Remaining owned records: {"challenges":0,"claims":0,"entitlements":0,"invites":0,"roles":0,"sessions":0,"users":0}.

HTTP clients simulate PC and phone; this does not prove physical-device UX or SMTP delivery. Secrets, generated tokens, cookies, emails and response bodies are never persisted. No typecheck, linter, runtime/config changes, migrations, resets or paid upgrades were run.
