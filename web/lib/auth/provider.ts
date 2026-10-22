import { AuthError, keyedHash } from "./core.ts";
import type { AuthConfig } from "./core.ts";

export async function provider(cfg: AuthConfig, path: string, payload: unknown, service = false) {
  let response: Response;
  try {
    response = await fetch(`${cfg.supabaseUrl}${path}`, { method: "POST", headers: {
      "Content-Type": "application/json", "apikey": service ? cfg.serviceKey : cfg.publicKey,
      ...(service ? { "Authorization": `Bearer ${cfg.serviceKey}` } : {}),
    // Workerd supports manual/follow, not error. Manual rejects redirects below without
    // ever forwarding server credentials to a redirected destination.
    }, body: JSON.stringify(payload), redirect: "manual", signal: AbortSignal.timeout(8000), cache: "no-store" });
  } catch { throw new AuthError(503, "auth_unavailable"); }
  if (!response.ok) {
    // No logging or echo of the provider body (it may contain PII or tokens).
    if (response.status === 429) throw new AuthError(429, "rate_limited");
    if (path === "/auth/v1/verify" && [400, 401, 403, 422].includes(response.status)) throw new AuthError(401, "invalid_email_link");
    throw new AuthError(503, "auth_unavailable");
  }
  try { return await response.json(); } catch { throw new AuthError(503, "auth_unavailable"); }
}
export async function rpc(cfg: AuthConfig, action: string, payload: Record<string, unknown> = {}) {
  const result = await provider(cfg, "/rest/v1/rpc/cdv_authz", { p_action: action, p_payload: payload }, true);
  if (!result || typeof result.status !== "string") throw new AuthError(503, "auth_unavailable");
  if (result.status === "limited") throw new AuthError(429, "rate_limited");
  return result;
}
export async function addressKey(request: Request, cfg: AuthConfig): Promise<string> {
  // Trust this header only behind a Cloudflare edge that overwrites it and blocks direct origin access.
  const address = cfg.trustCloudflare ? request.headers.get("cf-connecting-ip") : null;
  if (cfg.trustCloudflare && (!address || address.length > 64)) throw new AuthError(503, "trusted_proxy_required");
  return keyedHash(cfg.sealKey, `address:${address || "global-no-trusted-proxy"}`);
}
