// Server-only module: imported exclusively by route handlers, never Client Components.
if (typeof window !== "undefined") throw new Error("Auth helpers must only run on the server");
export type AuthConfig = {
  origin: string; supabaseUrl: string; publicKey: string; serviceKey: string;
  sealKey: string; secure: boolean; trustCloudflare: boolean; otpLength: 6;
};
export class AuthError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}
export function config(env: Record<string, string | undefined> = process.env): AuthConfig | null {
  if (env.AUTH_ENABLED !== "true") return null;
  const { AUTH_ORIGIN, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, AUTH_COOKIE_KEY } = env;
  if (!AUTH_ORIGIN || !SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !AUTH_COOKIE_KEY) return null;
  try {
    const origin = new URL(AUTH_ORIGIN), supabase = new URL(SUPABASE_URL);
    const local = (url: URL) => ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (origin.origin !== AUTH_ORIGIN || origin.username || origin.password) return null;
    if (supabase.username || supabase.password || supabase.pathname !== "/" || supabase.search || supabase.hash) return null;
    if (origin.protocol !== "https:" && !(env.NODE_ENV !== "production" && local(origin) && origin.protocol === "http:")) return null;
    if (supabase.protocol !== "https:" && !(env.NODE_ENV !== "production" && local(supabase) && supabase.protocol === "http:")) return null;
    if (!/^[a-fA-F0-9]{64}$/.test(AUTH_COOKIE_KEY)) return null;
    if (env.AUTH_OTP_LENGTH && env.AUTH_OTP_LENGTH !== "6") return null;
    return { origin: origin.origin, supabaseUrl: supabase.origin, publicKey: SUPABASE_ANON_KEY,
      serviceKey: SUPABASE_SERVICE_ROLE_KEY, sealKey: AUTH_COOKIE_KEY, secure: origin.protocol === "https:",
      trustCloudflare: env.AUTH_TRUST_CLOUDFLARE === "true", otpLength: 6 };
  } catch { return null; }
}
export function requireConfig(): AuthConfig {
  const value = config();
  if (!value) throw new AuthError(503, "auth_not_configured");
  return value;
}
export const CHALLENGE_SECONDS = 300;
export const SESSION_SECONDS = 28800;
export function randomSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
}
const enc = new TextEncoder();
export async function hash(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value))), n => n.toString(16).padStart(2, "0")).join("");
}
export async function keyedHash(keyText: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(keyText), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(value))), n => n.toString(16).padStart(2, "0")).join("");
}
export function cookieName(kind: "device" | "confirm" | "session" | "invite", cfg: AuthConfig): string {
  return `${cfg.secure ? "__Host-" : ""}cdv-${kind}`;
}
export function readCookie(request: Request, name: string): string | null {
  const values = (request.headers.get("cookie") || "").split(";").map(p => p.trim()).filter(p => p.startsWith(name + "="));
  if (values.length !== 1) return null; // Reject ambiguous/duplicated cookies.
  return values[0].slice(name.length + 1);
}
export function setCookie(response: Response, cfg: AuthConfig, kind: "device" | "confirm" | "session" | "invite", value: string, seconds: number) {
  response.headers.append("Set-Cookie", `${cookieName(kind, cfg)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${cfg.secure ? "; Secure" : ""}`);
}
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private",
    "Pragma": "no-cache", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
    "Vary": "Cookie", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  } });
}
export function failure(error: unknown): Response {
  const known = error instanceof AuthError ? error : new AuthError(503, "auth_unavailable");
  const response = json({ error: known.code }, known.status);
  if (known.status === 429) response.headers.set("Retry-After", "3");
  return response; // Never echo provider exceptions, request URLs, emails or credentials.
}
export function sameOrigin(request: Request, cfg: AuthConfig, mutation = true) {
  if (new URL(request.url).origin !== cfg.origin) throw new AuthError(403, "invalid_origin");
  const origin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
  if (mutation && origin !== cfg.origin) throw new AuthError(403, "invalid_origin");
  if (origin && origin !== cfg.origin) throw new AuthError(403, "invalid_origin");
  if (site && site !== "same-origin") throw new AuthError(403, "invalid_origin");
  // GET poll consumes state: require browser fetch metadata or explicit same-origin Origin.
  if (!mutation && site !== "same-origin" && origin !== cfg.origin) throw new AuthError(403, "invalid_origin");
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new AuthError(415, "json_required");
  if (Number(request.headers.get("content-length") || 0) > 2048) throw new AuthError(413, "body_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError(400, "invalid_body");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 2048) { await reader.cancel(); throw new AuthError(413, "body_too_large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch { throw new AuthError(400, "invalid_body"); }
}
export function email(value: unknown): string {
  if (typeof value !== "string") throw new AuthError(400, "invalid_email");
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(normalized)) throw new AuthError(400, "invalid_email");
  return normalized;
}
export function isId(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
export function maskEmail(value: string): string {
  const [name, domain] = value.split("@"); return `${name.slice(0, 1)}***@${domain}`;
}
export type Confirmation = { challengeId: string; tokenHash: string; exp: number };
async function sealKey(cfg: AuthConfig) {
  const raw = Uint8Array.from(cfg.sealKey.match(/../g)!, p => parseInt(p, 16));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
function base64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
function unbase64(value: string): Uint8Array { return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), ch => ch.charCodeAt(0)); }
export async function seal(cfg: AuthConfig, value: Confirmation): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(`cdv-confirm-v1:${cfg.origin}`) }, await sealKey(cfg), enc.encode(JSON.stringify(value)));
  return `${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
}
export async function unseal(cfg: AuthConfig, value: string | null): Promise<Confirmation> {
  try {
    if (!value || value.length > 2000) throw new Error();
    const parts = value.split("."); if (parts.length !== 2) throw new Error();
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unbase64(parts[0]), additionalData: enc.encode(`cdv-confirm-v1:${cfg.origin}`) }, await sealKey(cfg), unbase64(parts[1]));
    const payload = JSON.parse(new TextDecoder().decode(decrypted));
    if (!isId(payload.challengeId) || !/^[a-zA-Z0-9_-]{32,256}$/.test(payload.tokenHash) || !Number.isFinite(payload.exp) || payload.exp <= Date.now() || payload.exp > Date.now() + CHALLENGE_SECONDS * 1000 + 1000) throw new Error();
    return payload;
  } catch { throw new AuthError(401, "confirmation_expired"); }
}
