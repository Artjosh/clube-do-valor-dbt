import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

// Run after build:vercel. No live Supabase, SMTP, credentials or migrations.
test('Next production preserves SSR/RSC, API authorization, cookies and device polling', async () => {
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  // NextURL normalizes loopback IPs to localhost. Transport stays on IPv4.
  const origin = `https://localhost:${port}`;
  const server = spawn(process.execPath, ['--import', new URL('./next-provider-fixture.mjs', import.meta.url).href,
    'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production', AUTH_ENABLED: 'true', AUTH_ORIGIN: origin,
      SUPABASE_URL: 'https://offline-provider.example.test', SUPABASE_ANON_KEY: 'offline-anon',
      SUPABASE_SERVICE_ROLE_KEY: 'offline-service', AUTH_COOKIE_KEY: 'ab'.repeat(32),
      AUTH_TRUST_CLOUDFLARE: 'false', AUTH_OTP_LENGTH: '6', NEXT_TELEMETRY_DISABLED: '1' },
  });
  let logs = ''; server.stdout.on('data', b => { logs += b; }); server.stderr.on('data', b => { logs += b; });
  const request = (path, { cookie, method = 'GET', body, headers = {} } = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
    method, redirect: 'manual', headers: { 'x-forwarded-proto': 'https', origin, 'sec-fetch-site': 'same-origin',
      ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let checks = 0;
  const privateResponse = r => {
    assert.match(r.headers.get('cache-control'), /private/); assert.match(r.headers.get('cache-control'), /no-store/);
    // Next owns HTML/RSC Vary; APIs must retain Cookie alongside its variants.
    assert.match(r.headers.get('vary'), /Cookie|rsc/i);
    if (new URL(r.url).pathname.startsWith('/api/')) assert.match(r.headers.get('vary'), /Cookie/i);
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer'); assert.equal(r.headers.get('x-frame-options'), 'DENY'); checks += 5;
  };
  const session = n => `__Host-cdv-session=${n.repeat(32)}`;
  try {
    for (let i = 0; i < 100 && !logs.includes('Ready'); i++) {
      if (server.exitCode !== null) throw new Error(logs);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.match(logs, /Ready/);
    for (const [cookie, status, location] of [[undefined, 307, '/login'], [session('22'), 307, '/acesso-negado'], [session('11'), 200]]) {
      for (const headers of [{}, { rsc: '1' }]) {
        const r = await request(headers.rsc ? '/?_rsc' : '/', { cookie, headers }); assert.equal(r.status, headers.rsc ? 200 : status); privateResponse(r); checks++;
        if (location && !headers.rsc) { assert.equal(r.headers.get('location'), location); checks++; }
        const text = await r.text();
        if (status === 200) { assert.match(text, headers.rsc ? /initialData/ : /Copper/); checks++; }
        else { assert.doesNotMatch(text, /sourceHash|initialData|transactions|portfolios/); checks++; if (headers.rsc) { assert.ok(text.includes(`NEXT_REDIRECT;replace;${location};307;`)); checks++; } }
      }
    }
    for (const path of ['/api/analytics', '/api/export?kind=transactions', '/api/export?kind=clients', '/api/export?kind=portfolios']) {
      for (const [cookie, status] of [[undefined, 401], [session('22'), 403], [session('11'), 200]]) {
        const r = await request(path, { cookie }); assert.equal(r.status, status); privateResponse(r); checks++;
        if (status === 200) { assert.ok((await r.text()).length > 100); checks++; }
      }
    }
    for (const path of ['/login', '/confirm', '/api/health', '/not-found', '/data/analytics.json', '/lib/auth/core.ts']) {
      const r = await request(path); privateResponse(r); checks++;
      if (path.includes('/data/') || path.includes('/lib/')) assert.equal(r.status, 404);
    }
    const device = id => `__Host-cdv-device=${id}.${'66'.repeat(32)}`;
    for (const [id, expected] of [['44'.repeat(32), 'pending'], ['55'.repeat(32), 'approved']]) {
      const r = await request(`/api/auth/device/poll?challengeId=${id}`, { cookie: device(id) });
      assert.equal(r.status, 200, `poll: ${await r.clone().text()} ${logs}`); privateResponse(r); assert.equal((await r.json()).status, expected); checks += 2;
      if (expected === 'approved') {
        const cookies = r.headers.getSetCookie(); assert.equal(cookies.length, 2);
        assert.match(cookies[0], /__Host-cdv-session=.*HttpOnly; SameSite=Lax; Max-Age=\d+; Secure/); checks += 2;
      }
    }
    const id = '55'.repeat(32);
    const callback = await request(`/api/auth/confirm?challengeId=${id}&token_hash=${'t'.repeat(64)}&type=email`);
    assert.equal(callback.status, 303); privateResponse(callback); checks++;
    const confirmCookie = callback.headers.getSetCookie()[0].split(';')[0];
    const confirmation = await request('/api/auth/device/confirmation', { cookie: confirmCookie });
    assert.equal(confirmation.status, 200); assert.equal((await confirmation.json()).displayCode, null); checks += 2;
    const approval = await request('/api/auth/device/approve', { cookie: confirmCookie, method: 'POST', body: {} });
    assert.equal(approval.status, 200); assert.equal((await approval.json()).approved, true); privateResponse(approval); checks += 2;
    const otp = await request('/api/auth/device/verify', { cookie: device(id), method: 'POST', body: { challengeId: id, code: '123456' } });
    assert.equal(otp.status, 200); assert.equal((await otp.json()).authorized, true); assert.equal(otp.headers.getSetCookie().length, 2); privateResponse(otp); checks += 3;
    const csrf = await request('/api/auth/logout', { method: 'POST', headers: { origin: 'https://evil.example.test' } });
    assert.equal(csrf.status, 403); checks++;
    const logout = await request('/api/auth/logout', { method: 'POST', cookie: session('11') });
    assert.equal(logout.status, 200); assert.equal(logout.headers.getSetCookie().length, 4); privateResponse(logout); checks += 2;
    console.log(`${checks} HTTP assertions passed against Next production; offline provider, no email`);
  } finally {
    server.kill();
    if (server.exitCode === null) await once(server, 'exit');
  }
});
