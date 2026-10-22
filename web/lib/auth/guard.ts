// Server-only. No snapshot import, client state, metadata grants or cached permission decisions.
import { AuthError, config, cookieName, hash, isId, readCookie } from "./core.ts";
import { rpc } from "./provider.ts";

export type AnalyticsAccess = {
  status: 200 | 401 | 403 | 503;
  configured: boolean;
  authenticated: boolean;
  authorized: boolean;
  permissions: string[];
  role: "analyst" | null;
  user?: { email: string };
  reason?: string;
};

/** SSR/RSC: obtain cookie header using next/headers, await this BEFORE importing analytics. */
export async function readAnalyticsAccess(cookieHeader: string | null): Promise<AnalyticsAccess> {
  const cfg = config();
  if (!cfg) return { status: 503, configured: false, authenticated: false, authorized: false, role: null, permissions: [], reason: "auth_not_configured" };
  try {
    const token = readCookie(new Request(cfg.origin, { headers: cookieHeader ? { cookie: cookieHeader } : {} }), cookieName("session", cfg));
    if (!isId(token)) return { status: 401, configured: true, authenticated: false, authorized: false, role: null, permissions: [], reason: "authentication_required" };
    // Every call reads PostgreSQL. No React cache(), JWT entitlement or client-supplied grant.
    const result = await rpc(cfg, "session", { session_hash: await hash(token) });
    if (result.status === "anonymous") return { status: 401, configured: true, authenticated: false, authorized: false, role: null, permissions: [], reason: "authentication_required" };
    if (result.status !== "authenticated" || typeof result.email !== "string" || !Array.isArray(result.permissions)) throw new Error("Invalid identity response");
    const authorized = result.role === "analyst" && result.permissions.includes("analytics:read");
    return { status: authorized ? 200 : 403, configured: true, authenticated: true, authorized,
      role: authorized ? "analyst" : null, permissions: authorized ? ["analytics:read"] : [], user: { email: result.email },
      ...(authorized ? {} : { reason: "analytics_access_required" }) };
  } catch { return { status: 503, configured: true, authenticated: false, authorized: false, role: null, permissions: [], reason: "auth_unavailable" }; }
}

export async function requireAnalyticsAccess(request: Request): Promise<AnalyticsAccess> {
  const access = await readAnalyticsAccess(request.headers.get("cookie"));
  if (access.status !== 200) throw new AuthError(access.status, access.reason || "access_denied");
  return access;
}
