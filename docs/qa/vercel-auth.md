# Vercel authentication HTTP QA

Executed: 2026-10-24T12:04:20.973Z. Target: https://clube-do-valor.vercel.app. Dedicated Supabase: igucxanapndewkbtarfn.

Result: **passed**; 183 passed assertions. Cleanup: **true**. No email sent and no hosted device/start calls.

Coverage and sanitized metadata: [vercel-auth.json](vercel-auth.json). Fixtures use admin generate_link and dedicated challenge RPC; subsequent callback, OTP, approval, polling, guards and logout use real Vercel HTTP. Only this execution's exact fixture IDs are removed; shared rate buckets and real invitations are preserved.

Remaining owned records: {"challenges":0,"claims":0,"entitlements":0,"invites":0,"roles":0,"sessions":0,"users":0}.

Chromium verifies automatic confirmation without interaction; PC polling uses HTTP. This does not prove physical-device UX or SMTP delivery. Secrets, generated tokens, cookies, emails and response bodies are never persisted. No typecheck, linter, runtime/config changes, migrations, resets or paid upgrades were run.
