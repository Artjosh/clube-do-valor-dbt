import { AuthError, body, CHALLENGE_SECONDS, config, cookieName, email, failure, hash, isId, json, keyedHash, maskEmail, randomSecret, readCookie, requireConfig, sameOrigin, seal, SESSION_SECONDS, setCookie, unseal } from "./core.ts";
import { addressKey, provider, rpc } from "./provider.ts";
import { readAnalyticsAccess } from "./guard.ts";

function boundDevice(request: Request, cfg: ReturnType<typeof requireConfig>, id: unknown) {
  const binding = readCookie(request, cookieName("device", cfg))?.split(".");
  if (!isId(id) || !binding || binding.length !== 2 || binding[0] !== id || !isId(binding[1])) throw new AuthError(401, "invalid_device");
  return { id, secret: binding[1] };
}

export async function claimInvite(request: Request): Promise<Response> {
  try {
    const cfg = requireConfig(); sameOrigin(request, cfg);
    const code = (await body(request)).code;
    // Invite is a shared 256-bit seed, never a personal password. Canonical hex only.
    if (typeof code !== "string" || !/^[a-fA-F0-9]{64}$/.test(code.trim())) throw new AuthError(400, "invalid_invite_format");
    const id = randomSecret(), secret = randomSecret();
    const result = await rpc(cfg, "claim_invite", { id, browser_hash: await hash(secret),
      code_hash: await hash(`cdv-invite-v1:${code.trim().toLowerCase()}`), address_key: await addressKey(request, cfg) });
    if (result.status !== "claimed") throw new AuthError(403, "invalid_invite");
    const response = json({ accepted: true, expiresAt: result.expires_at });
    setCookie(response, cfg, "invite", `${id}.${secret}`, 600);
    return response;
  } catch (error) { return failure(error); }
}

export async function start(request: Request): Promise<Response> {
  try {
    const cfg = requireConfig(); sameOrigin(request, cfg);
    const input = await body(request);
    const requestedEmail = email(input.email);
    if (input.useInvite !== undefined && typeof input.useInvite !== "boolean") throw new AuthError(400, "invalid_invite_mode");
    let claim: Record<string, string> = {};
    if (input.useInvite === true) {
      const binding = readCookie(request, cookieName("invite", cfg))?.split(".");
      if (!binding || binding.length !== 2 || !isId(binding[0]) || !isId(binding[1])) throw new AuthError(403, "invite_required");
      claim = { claim_id: binding[0], claim_browser_hash: await hash(binding[1]) };
    }
    const challengeId = randomSecret(), browserSecret = randomSecret();
    const random = crypto.getRandomValues(new Uint32Array(1))[0];
    const displayCode = (random % 100000000).toString().padStart(8, "0");
    const result = await rpc(cfg, "create", { id: challengeId, browser_hash: await hash(browserSecret),
      email: requestedEmail, email_key: await keyedHash(cfg.sealKey, `email:${requestedEmail}`),
      address_key: await addressKey(request, cfg), display_code: displayCode, ...claim });
    if (result.status === "invalid_invite") throw new AuthError(403, "invalid_invite");
    if (result.status !== "created") throw new AuthError(503, "auth_unavailable");
    const redirect = `${cfg.origin}/api/auth/confirm?challengeId=${challengeId}`;
    try {
      await provider(cfg, `/auth/v1/otp?redirect_to=${encodeURIComponent(redirect)}`, { email: requestedEmail, create_user: true });
    } catch (error) {
      // A failed/uncertain delivery cannot remain an approvable challenge.
      try { await rpc(cfg, "cancel", { id: challengeId, browser_hash: await hash(browserSecret) }); } catch { /* TTL still bounds an unavailable DB. */ }
      throw error;
    }
    const response = json({ challengeId, displayCode, expiresAt: result.expires_at, pollInterval: 3, otpLength: cfg.otpLength });
    setCookie(response, cfg, "device", `${challengeId}.${browserSecret}`, CHALLENGE_SECONDS);
    if (!input.useInvite) setCookie(response, cfg, "invite", "", 0);
    return response;
  } catch (error) { return failure(error); }
}

export async function confirm(request: Request): Promise<Response> {
  try {
    const cfg = requireConfig();
    const url = new URL(request.url);
    if (url.origin !== cfg.origin) throw new AuthError(403, "invalid_origin");
    const challengeId = url.searchParams.get("challengeId"), tokenHash = url.searchParams.get("token_hash");
    if (!isId(challengeId) || !tokenHash || !/^[a-zA-Z0-9_-]{32,256}$/.test(tokenHash) || url.searchParams.get("type") !== "email") throw new AuthError(400, "invalid_email_link");
    await rpc(cfg, "callback_rate", { address_key: await addressKey(request, cfg) });
    // GET is deliberately NOT /verify: mail scanners cannot consume the one-time token.
    const response = json(null, 303);
    response.headers.set("Location", `${cfg.origin}/confirm`);
    setCookie(response, cfg, "confirm", await seal(cfg, { challengeId, tokenHash, exp: Date.now() + CHALLENGE_SECONDS * 1000 }), CHALLENGE_SECONDS);
    return response;
  } catch (error) { return failure(error); }
}

export async function confirmation(request: Request): Promise<Response> {
  try {
    const cfg = requireConfig(); sameOrigin(request, cfg, false);
    const pending = await unseal(cfg, readCookie(request, cookieName("confirm", cfg)));
    const result = await rpc(cfg, "confirmation", { id: pending.challengeId, address_key: await addressKey(request, cfg) });
    if (result.status !== "pending") throw new AuthError(410, "challenge_expired");
    // Deliberately omit the secret visual code here: the person must read it from the PC.
    return json({ challengeId: pending.challengeId, displayCode: null, email: maskEmail(result.email), expiresAt: result.expires_at });
  } catch (error) { return failure(error); }
}

export async function approve(request: Request): Promise<Response> {
  try {
    const cfg = requireConfig(); sameOrigin(request, cfg);
    const input = await body(request);
    if (typeof input.displayCode !== "string" || !/^\d{8}$/.test(input.displayCode)) throw new AuthError(400, "invalid_display_code");
    const pending = await unseal(cfg, readCookie(request, cookieName("confirm", cfg)));
    // This checks the code + durable attempt count BEFORE consuming the provider token.
    const prepared = await rpc(cfg, "prepare_approval", { id: pending.challengeId, display_code: input.displayCode, address_key: await addressKey(request, cfg) });
    if (prepared.status !== "pending") throw new AuthError(410, "challenge_expired_or_invalid_code");
    const verified = await provider(cfg, "/auth/v1/verify", { token_hash: pending.tokenHash, type: "email" });
    const user = verified.user;
    // Provider access/refresh tokens stay in this scope only; never persisted, returned or logged.
    if (!user?.id || typeof user.email !== "string" || !user.email_confirmed_at || email(user.email) !== prepared.email) throw new AuthError(403, "email_mismatch");
    const result = await rpc(cfg, "approve", { id: pending.challengeId, email: email(user.email), user_id: user.id, display_code: input.displayCode });
    if (result.status !== "approved") throw new AuthError(410, "challenge_expired");
    const response = json({ approved: true });
    setCookie(response, cfg, "confirm", "", 0);
    return response;
  } catch (error) { return failure(error); }
}

export async function poll(request: Request): Promise<Response> {
  try {
    const cfg = requireConfig(); sameOrigin(request, cfg, false);
    const id = new URL(request.url).searchParams.get("challengeId");
    const binding = boundDevice(request, cfg, id);
    // Deterministic per-device secret permits a lost HTTP response retry without creating another session.
    const sessionSecret = await keyedHash(binding.secret, `cdv-session-v1:${id}`);
    const result = await rpc(cfg, "consume", { id, browser_hash: await hash(binding.secret), session_hash: await hash(sessionSecret) });
    if (result.status === "invalid_invite") throw new AuthError(403, "invalid_invite");
    if (!["pending", "approved", "expired"].includes(result.status)) throw new AuthError(401, "invalid_device");
    const response = json({ status: result.status, ...(result.status === "approved" ? { authorized: result.authorized === true, role: result.role || null, permissions: result.permissions || [] } : {}) });
    if (result.status === "approved") {
      const remaining = Math.max(0, Math.min(SESSION_SECONDS, Math.floor((Date.parse(result.expires_at) - Date.now()) / 1000)));
      if (remaining <= 0) return json({ status: "expired" });
      setCookie(response, cfg, "session", sessionSecret, remaining);
      setCookie(response, cfg, "invite", "", 0);
    }
    if (result.status === "expired") setCookie(response, cfg, "device", "", 0);
    return response;
  } catch (error) { return failure(error); }
}

export async function session(request: Request): Promise<Response> {
  const access = await readAnalyticsAccess(request.headers.get("cookie"));
  const { status, ...result } = access;
  return json(result, status === 503 ? 503 : 200);
}

export async function verifyOtp(request: Request): Promise<Response> {
  try {
    const cfg = requireConfig(); sameOrigin(request, cfg);
    const input = await body(request);
    const binding = boundDevice(request, cfg, input.challengeId);
    if (typeof input.code !== "string" || !new RegExp(`^\\d{${cfg.otpLength}}$`).test(input.code)) throw new AuthError(400, "invalid_otp_format");
    const browserHash = await hash(binding.secret);
    const prepared = await rpc(cfg, "prepare_otp", { id: binding.id, browser_hash: browserHash, address_key: await addressKey(request, cfg) });
    if (prepared.status === "invalid") throw new AuthError(401, "invalid_device");
    if (prepared.status !== "pending") throw new AuthError(410, "challenge_expired");
    // Email is read exclusively from the bound database challenge, never from the POST body.
    const verified = await provider(cfg, "/auth/v1/verify", { email: prepared.email, token: input.code, type: "email" });
    const user = verified.user;
    if (!user?.id || typeof user.email !== "string" || !user.email_confirmed_at || email(user.email) !== prepared.email) throw new AuthError(403, "email_mismatch");
    const sessionSecret = await keyedHash(binding.secret, `cdv-session-v1:${binding.id}`);
    const result = await rpc(cfg, "complete_otp", { id: binding.id, browser_hash: browserHash,
      session_hash: await hash(sessionSecret), email: email(user.email), user_id: user.id });
    if (result.status === "invalid_invite") throw new AuthError(403, "invalid_invite");
    if (result.status !== "approved") throw new AuthError(410, "challenge_expired");
    const remaining = Math.max(0, Math.min(SESSION_SECONDS, Math.floor((Date.parse(result.expires_at) - Date.now()) / 1000)));
    if (remaining <= 0) throw new AuthError(410, "challenge_expired");
    const response = json({ authenticated: true, authorized: result.authorized === true, role: result.role || null, permissions: result.permissions || [] });
    setCookie(response, cfg, "session", sessionSecret, remaining);
    setCookie(response, cfg, "invite", "", 0);
    return response;
  } catch (error) { return failure(error); }
}

export async function logout(request: Request): Promise<Response> {
  try {
    const cfg = requireConfig(); sameOrigin(request, cfg);
    const token = readCookie(request, cookieName("session", cfg));
    const binding = readCookie(request, cookieName("device", cfg))?.split(".");
    const invitation = readCookie(request, cookieName("invite", cfg))?.split(".");
    if (isId(token)) await rpc(cfg, "logout", { session_hash: await hash(token) });
    if (binding?.length === 2 && isId(binding[0]) && isId(binding[1])) await rpc(cfg, "cancel", { id: binding[0], browser_hash: await hash(binding[1]) });
    if (invitation?.length === 2 && isId(invitation[0]) && isId(invitation[1])) await rpc(cfg, "cancel_invite", { id: invitation[0], browser_hash: await hash(invitation[1]) });
    const response = json({ authenticated: false });
    for (const kind of ["session", "device", "confirm", "invite"] as const) setCookie(response, cfg, kind, "", 0);
    return response;
  } catch (error) { return failure(error); }
}
