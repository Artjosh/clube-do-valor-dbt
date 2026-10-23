/** Dedicated-project, no-email HTTP QA. Run only after coordinator confirms deployment:
 * node web/tests/vercel-auth.mjs --allow-dedicated-project --deploy-ready
 * Secrets/cookies/tokens remain in memory. Never calls device/start or provider /otp.
 */
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const WEB = fileURLToPath(new URL('../', import.meta.url));
const REF = 'igucxanapndewkbtarfn';
const TARGET = 'https://clube-do-valor.vercel.app';
if (!process.argv.includes('--allow-dedicated-project') || !process.argv.includes('--deploy-ready')) {
  console.error('Requires --allow-dedicated-project and coordinator-confirmed --deploy-ready');
  process.exit(2);
}
const env = { ...process.env, ...parseEnv(await readFile(path.join(WEB, '.dev.vars'), 'utf8')) };
if (env.SUPABASE_URL !== `https://${REF}.supabase.co` || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Dedicated project credentials required');
const report = { executedAt: new Date().toISOString(), target: TARGET, projectRef: REF,
  deployment: process.env.CDV_VERCEL_DEPLOYMENT || 'coordinator-confirmed-ready',
  mode: 'vercel-http-no-email', checks: [], responses: [], emailSent: false, hostedDeviceStartCalls: 0,
  generatedLinks: 0, cleanup: false, limitations: ['HTTP client simulates the PC; Chromium runs automatic phone confirmation. Physical devices and SMTP delivery are outside this run.', 'Challenge creation uses dedicated RPC fixtures to avoid SMTP.'] };
const owned = { users: [], challenges: [], claims: [], invites: [] };
const temp = await mkdtemp(path.join(tmpdir(), 'cdv-vercel-qa-'));
const secret = () => randomBytes(32).toString('hex');
const hash = value => createHash('sha256').update(value).digest('hex');
const check = (ok, label) => { if (!ok) throw new Error(label); report.checks.push(label); console.log(`PASS ${label}`); };
const serviceHeaders = { 'content-type': 'application/json', apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
async function service(route, value, method = 'POST') {
  let r;
  try { r = await fetch(`${env.SUPABASE_URL}${route}`, { method, headers: serviceHeaders, body: value === undefined ? undefined : JSON.stringify(value), redirect: 'manual', signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error('Dedicated provider transport failed; details withheld'); }
  if (!r.ok) throw new Error(`Dedicated provider operation failed (${r.status}); details withheld`);
  return r.status === 204 ? {} : r.json();
}
const rpc = (action, payload) => service('/rest/v1/rpc/cdv_authz', { p_action: action, p_payload: payload });
async function sql(query) {
  const file = path.join(temp, 'fixture.sql');
  await writeFile(file, query);
  try {
    return JSON.parse(execFileSync(process.execPath, [env.CDV_NPM_CLI || 'C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js', 'exec', '--yes', '--package=supabase', '--', 'supabase', 'db', 'query', '--linked', '--project-ref', REF, '--file', file, '--output', 'json'], { cwd: WEB, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 }));
  } catch { throw new Error('Dedicated fixture SQL failed; details withheld'); }
}
function cookie(r, kind) { return r.headers.getSetCookie().find(v => v.startsWith(`__Host-cdv-${kind}=`))?.split(';')[0]; }
function secureCookie(r, kind) {
  const raw = r.headers.getSetCookie().find(v => v.startsWith(`__Host-cdv-${kind}=`));
  check(raw && /; Secure/i.test(raw) && /; HttpOnly/i.test(raw) && /; SameSite=Lax/i.test(raw) && /; Path=\//i.test(raw) && !/; Domain=/i.test(raw), `${kind} cookie has secure host-only attributes`);
  return cookie(r, kind);
}
async function http(route, { method = 'GET', value, cookies, headers = {} } = {}) {
  const url = new URL(route, TARGET);
  if (url.origin !== TARGET || url.pathname.includes('/device/start')) throw new Error('Forbidden HTTP target or email initiation');
  let r;
  try { r = await fetch(url, { method, headers: { origin: TARGET, 'sec-fetch-site': 'same-origin', ...(cookies ? { cookie: cookies } : {}), ...(value !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: value === undefined ? undefined : JSON.stringify(value), redirect: 'manual', signal: AbortSignal.timeout(25000) }); }
  catch { throw new Error('Vercel HTTP transport failed; URL and details withheld'); }
  const text = await r.text();
  // Persist only pathname, metadata and size; callback query contains credentials.
  report.responses.push({ route: url.pathname, method, status: r.status, cacheControl: r.headers.get('cache-control'), vary: r.headers.get('vary'), bytes: Buffer.byteLength(text) });
  let data; try { data = JSON.parse(text); } catch { /* HTML/RSC/CSV */ }
  return { r, text, data };
}
async function identity() {
  const email = `cdv-vercel-${randomUUID()}@example.test`;
  const u = await service('/auth/v1/admin/users', { email, email_confirm: false });
  if (!/^[a-f0-9-]{36}$/.test(u.id)) throw new Error('Fixture identity missing');
  owned.users.push(u.id);
  return { id: u.id, email };
}
async function begin(user, invite) {
  let binding = {};
  if (invite) {
    const claim = await http('/api/auth/invite/claim', { method: 'POST', value: { code: invite.code } });
    check(claim.r.status === 200 && claim.data?.accepted, 'HTTP QA invitation claim accepted');
    const claimCookie = secureCookie(claim.r, 'invite');
    const [id, browser] = claimCookie.split('=')[1].split('.');
    owned.claims.push(id);
    binding = { claim_id: id, claim_browser_hash: hash(browser) };
  }
  const id = secret(), browser = secret(), displayCode = String(randomBytes(4).readUInt32BE() % 100000000).padStart(8, '0');
  owned.challenges.push(id);
  const created = await rpc('create', { id, browser_hash: hash(browser), email: user.email, email_key: hash(user.email), address_key: hash(`vercel-qa:${id}`), display_code: displayCode, ...binding });
  check(created.status === 'created', 'Dedicated challenge fixture created without email');
  const link = await service('/auth/v1/admin/generate_link', { type: 'magiclink', email: user.email, redirect_to: `${TARGET}/api/auth/confirm?challengeId=${id}` });
  report.generatedLinks++;
  const otp = link.email_otp || link.properties?.email_otp, tokenHash = link.hashed_token || link.properties?.hashed_token;
  check(/^\d{6}$/.test(otp) && !!tokenHash, 'Real provider OTP contains exactly six digits');
  report.otpLength = otp.length;
  return { id, displayCode, otp, tokenHash, device: `__Host-cdv-device=${id}.${browser}` };
}
async function callback(f) {
  const c = await http(`/api/auth/confirm?challengeId=${f.id}&token_hash=${f.tokenHash}&type=email`);
  check(c.r.status === 303 && new URL(c.r.headers.get('location'), TARGET).href === `${TARGET}/confirm`, 'Callback redirects to clean same-origin confirmation URL');
  check(!cookie(c.r, 'session') && !c.text.includes(f.tokenHash), 'Callback does not issue session or echo token');
  check(c.r.headers.get('referrer-policy') === 'no-referrer', 'Callback suppresses referrer');
  return secureCookie(c.r, 'confirm');
}
async function matrix(name, cookies, expected) {
  const state = await http('/api/auth/session', { cookies });
  check(state.r.status === 200 && state.data?.configured === true && state.data.authenticated === (expected !== 401) && state.data.authorized === (expected === 200), `${name}: HTTP session distinguishes authentication and authorization`);
  for (const route of ['/api/analytics', '/api/export?kind=transactions', '/api/export?kind=clients', '/api/export?kind=portfolios', '/api/analytics?from=invalid', '/api/export?kind=invalid']) {
    const out = await http(route, { cookies });
    const status = expected === 200 && route.includes('invalid') ? 400 : expected;
    check(out.r.status === status, `${name}: ${route} status ${status}`);
    check(out.r.headers.get('cache-control')?.includes('no-store'), `${name}: API response is no-store`);
    check(out.r.headers.get('vary')?.toLowerCase().includes('cookie'), `${name}: API varies by cookie`);
    if (status !== 200) check(!['Ana Souza', 'Bruno Lima', 'transaction_id', 'Felipe Nunes'].some(m => out.text.includes(m)), `${name}: denied API contains no dataset markers`);
    else check(out.text.length > 100, `${name}: authorized payload present`);
  }
  for (const headers of [{}, { RSC: '1' }, { RSC: '1', 'Next-Router-Prefetch': '1' }]) {
    const out = await http('/', { cookies, headers });
    check(out.r.headers.get('cache-control')?.includes('no-store'), `${name}: HTML/RSC response is no-store`);
    if (headers['Next-Router-Prefetch'] === '1' && out.r.status === 200 && out.r.headers.get('content-type')?.includes('text/x-component') && out.text.length < 500 && out.text.includes('"f":')) {
      check(!['Ana Souza', 'Bruno Lima', 'Felipe Nunes', 'transaction_id'].some(m => out.text.includes(m)), `${name}: Next prefetch returns only an empty Flight shell`);
      continue;
    }
    if (expected === 200) check(out.r.status === 200 && ['Ana Souza', 'Bruno Lima', 'Felipe Nunes'].some(m => out.text.includes(m)), `${name}: HTML/RSC authorized data present`);
    else {
      const dest = name === 'anonymous' ? '/login' : '/acesso-negado';
      check(!['Ana Souza', 'Bruno Lima', 'Felipe Nunes', 'transaction_id'].some(m => out.text.includes(m)), `${name}: HTML/RSC contains no dataset markers`);
      check([200, 303, 307, 308, 401, 403].includes(out.r.status) && ((out.r.headers.get('location') || '').includes(dest) || out.text.includes(dest)), `${name}: HTML/RSC follows access guard`);
    }
  }
}
async function cleanup() {
  const ids = values => values.length ? values.map(id => `'${id}'`).join(',') : 'null';
  if (owned.challenges.length) await sql(`delete from cdv_private.device_challenges where id in (${ids(owned.challenges)});`);
  if (owned.claims.length) await sql(`delete from cdv_private.invite_claims where id in (${ids(owned.claims)});`);
  for (const id of owned.users) await service(`/auth/v1/admin/users/${id}`, undefined, 'DELETE');
  if (owned.invites.length) await sql(`delete from cdv_private.analytics_invites where id in (${ids(owned.invites)});`);
  const result = await sql(`select
    (select count(*) from auth.users where id in (${ids(owned.users)})) as users,
    (select count(*) from cdv_private.device_challenges where id in (${ids(owned.challenges)})) as challenges,
    (select count(*) from cdv_private.browser_sessions where challenge_id in (${ids(owned.challenges)})) as sessions,
    (select count(*) from cdv_private.invite_claims where id in (${ids(owned.claims)})) as claims,
    (select count(*) from cdv_private.user_roles where user_id in (${ids(owned.users)})) as roles,
    (select count(*) from cdv_private.entitlements where user_id in (${ids(owned.users)})) as entitlements,
    (select count(*) from cdv_private.analytics_invites where id in (${ids(owned.invites)})) as invites;`);
  report.cleanupRemaining = result.rows?.[0];
  check(report.cleanupRemaining && Object.values(report.cleanupRemaining).every(n => Number(n) === 0), 'Cleanup SQL confirms zero owned fixture records');
  report.cleanup = true;
}
try {
  const health = await http('/api/health');
  check(health.r.status === 200 && health.data?.auth?.configured === true, 'Vercel reports configured authentication');
  await matrix('anonymous', undefined, 401);
  const normal = await identity(), f = await begin(normal);
  await callback(f);
  const malformed = await http('/api/auth/device/verify', { method: 'POST', cookies: f.device, value: { challengeId: f.id, code: '12345678' } });
  check(malformed.r.status === 400, 'Vercel rejects eight-digit email OTP');
  const verified = await http('/api/auth/device/verify', { method: 'POST', cookies: f.device, value: { challengeId: f.id, code: f.otp, role: 'analyst', permissions: ['analytics:read'] } });
  check(verified.r.status === 200 && verified.data?.authenticated && !verified.data.authorized, 'OTP6 still valid after callback GET; client role ignored');
  const normalCookie = secureCookie(verified.r, 'session');
  await matrix('no-role', normalCookie, 403);
  const invite = { id: randomUUID(), code: secret() };
  owned.invites.push(invite.id);
  await sql(`insert into cdv_private.analytics_invites(id,code_hash,label) values('${invite.id}','${hash(`cdv-invite-v1:${invite.code}`)}','vercel-http-qa-only');`);
  const analyst = await identity(), cross = await begin(analyst, invite);
  const pending = await http(`/api/auth/device/poll?challengeId=${cross.id}`, { cookies: cross.device });
  check(pending.r.status === 200 && pending.data?.status === 'pending', 'PC polling starts pending');
  await callback(cross); // Scanner GET must leave the same token valid for the phone.
  const phone = await callback(cross);
  const info = await http('/api/auth/device/confirmation', { cookies: phone });
  check(info.r.status === 200 && info.data?.displayCode === null && info.data.email !== analyst.email, 'Phone receives masked email and no visual code');
  const phoneSession = await http('/api/auth/session', { cookies: phone });
  check(phoneSession.r.status === 200 && !phoneSession.data?.authenticated, 'Phone callback creates no authenticated session');
  check((await http(`/api/auth/device/poll?challengeId=${cross.id}`, { cookies: phone })).r.status === 401, 'Phone cannot poll using confirmation cookie as PC binding');
  check((await http('/api/auth/device/approve', { method: 'POST', cookies: phone, value: { displayCode: cross.displayCode }, headers: { origin: 'https://example.test' } })).r.status === 403, 'Cross-origin approval is denied');
  const {default:puppeteer}=await import(process.env.CDV_PUPPETEER_MODULE || 'puppeteer-core');
  const browser=await puppeteer.launch({executablePath:process.env.CDV_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try {
    const page=await browser.newPage();
    let approvalPosts=0;
    page.on('request',r=>{if(new URL(r.url()).pathname==='/api/auth/device/approve'&&r.method()==='POST')approvalPosts++});
    const separator=phone.indexOf('=');
    await browser.setCookie({name:phone.slice(0,separator),value:phone.slice(separator+1),url:TARGET,secure:true,httpOnly:true,sameSite:'Lax'});
    await page.goto(TARGET+'/confirm',{waitUntil:'networkidle0'});
    await page.waitForFunction(()=>document.body.innerText.includes('Navegador autenticado'),{timeout:25000});
    check(await page.locator('h2').map(e=>e.textContent).wait()==='Navegador autenticado','Phone page automatically approves on load without typing or clicking');
    check(approvalPosts===1,'Phone makes exactly one automatic approval POST');
    check((await page.$$('input,button')).length===0,'Phone confirmation has no input or additional approval button');
    check(!(await browser.cookies()).some(c=>c.name==='__Host-cdv-session'),'Phone does not receive original PC session');
  }finally{await browser.close()}
  await new Promise(resolve => setTimeout(resolve, 3100));
  const consumed = await http(`/api/auth/device/poll?challengeId=${cross.id}`, { cookies: cross.device });
  check(consumed.r.status === 200 && consumed.data?.status === 'approved' && consumed.data.authorized && consumed.data.role === 'analyst', 'Original PC polling issues authorized analyst session');
  const analystCookie = secureCookie(consumed.r, 'session');
  await new Promise(resolve => setTimeout(resolve, 3100));
  const retry = await http(`/api/auth/device/poll?challengeId=${cross.id}`, { cookies: cross.device });
  check(retry.r.status === 200 && cookie(retry.r, 'session') === analystCookie, 'Polling retry recovers identical session');
  await matrix('analyst', analystCookie, 200);
  for (const [name, cookies] of [['anonymous', undefined], ['no-role', normalCookie]]) check((await http('/api/analytics', { cookies })).r.status === (name === 'anonymous' ? 401 : 403), `${name}: remains denied after analyst cache warmup`);
  const count = await sql(`select count(*) as sessions from cdv_private.browser_sessions where challenge_id='${cross.id}';`);
  check(Number(count.rows?.[0]?.sessions) === 1, 'Polling retries create exactly one database session');
  const loginPage=await http('/login');
  check(loginPage.r.status===200&&!loginPage.text.includes('auth-methods')&&!loginPage.text.includes('Entre por contrassenha'),'Login has a single email entry');
  const unlockPage=await http('/acesso-negado',{cookies:normalCookie});
  check(unlockPage.r.status===200&&unlockPage.text.includes('access-code'),'Authenticated account sees contrassenha form');
  check((await http('/api/auth/invite/activate',{method:'POST',value:{code:invite.code}})).r.status===401,'Anonymous activation denied');
  check((await http('/api/auth/invite/activate',{method:'POST',cookies:normalCookie,value:{code:invite.code},headers:{origin:'https://example.test'}})).r.status===403,'Cross-origin activation denied');
  check((await http('/api/auth/invite/activate',{method:'POST',cookies:normalCookie,value:{code:secret()}})).r.status===403,'Invalid contrassenha denied');
  const activated=await http('/api/auth/invite/activate',{method:'POST',cookies:normalCookie,value:{code:invite.code,user_id:analyst.id}});
  check(activated.r.status===200&&activated.data?.authorized,'Existing OTP session activated without second login');
  check(!cookie(activated.r,'session'),'Activation preserves existing session cookie');
  await matrix('activated',normalCookie,200);
  await sql(`update cdv_private.entitlements set revoked_at=now() where user_id='${normal.id}';`);
  check((await http('/api/analytics',{cookies:normalCookie})).r.status===403,'Revocation immediately denies activated user');
  check((await http('/api/auth/invite/activate',{method:'POST',cookies:normalCookie,value:{code:invite.code}})).r.status===403,'Contrassenha cannot restore revoked entitlement');
  for (const [name, cookies, device] of [['analyst', analystCookie, cross.device], ['no-role', normalCookie, f.device]]) {
    const out = await http('/api/auth/logout', { method: 'POST', cookies: `${cookies}; ${device}`, value: {} });
    check(out.r.status === 200 && out.data?.authenticated === false, `${name}: HTTP logout succeeds`);
    check(out.r.headers.getSetCookie().filter(v => /Max-Age=0/i.test(v)).length === 4, `${name}: logout clears all four cookies`);
    check((await http('/api/analytics', { cookies })).r.status === 401, `${name}: replay of revoked session rejected`);
    const id = name === 'analyst' ? cross.id : f.id;
    const replay = await http(`/api/auth/device/poll?challengeId=${id}`, { cookies: device });
    check(!cookie(replay.r, 'session') && replay.data?.status !== 'approved', `${name}: polling after logout cannot resurrect session`);
  }
  report.result = 'passed';
} catch (error) {
  // Only explicitly constructed messages are retained; fetch/provider exceptions are caught above.
  report.result = 'failed';
  report.failure = error instanceof Error && !error.message.includes('http') ? error.message : 'HTTP validation failed; details withheld';
} finally {
  try { await cleanup(); } catch { report.cleanup = false; report.cleanupRequired = owned; }
  const resolvedTemp = path.resolve(temp);
  if (path.dirname(resolvedTemp) !== path.resolve(tmpdir()) || !path.basename(resolvedTemp).startsWith('cdv-vercel-qa-')) throw new Error('Unexpected temporary directory');
  await rm(resolvedTemp, { recursive: true, force: true });
  await writeFile(path.join(WEB, '../docs/qa/vercel-auth.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(path.join(WEB, '../docs/qa/vercel-auth.md'), `# Vercel authentication HTTP QA\n\nExecuted: ${report.executedAt}. Target: ${TARGET}. Dedicated Supabase: ${REF}.\n\nResult: **${report.result}**; ${report.checks.length} passed assertions. Cleanup: **${report.cleanup}**. No email sent and no hosted device/start calls.\n\n${report.failure ? `Failure: ${report.failure}.\n\n` : ''}Coverage and sanitized metadata: [vercel-auth.json](vercel-auth.json). Fixtures use admin generate_link and dedicated challenge RPC; subsequent callback, OTP, approval, polling, guards and logout use real Vercel HTTP. Only this execution's exact fixture IDs are removed; shared rate buckets and real invitations are preserved.\n\n${report.cleanupRemaining ? `Remaining owned records: ${JSON.stringify(report.cleanupRemaining)}.\n\n` : ''}Chromium verifies automatic confirmation without interaction; PC polling uses HTTP. This does not prove physical-device UX or SMTP delivery. Secrets, generated tokens, cookies, emails and response bodies are never persisted. No typecheck, linter, runtime/config changes, migrations, resets or paid upgrades were run.\n`);
}
console.log(JSON.stringify({ result: report.result, checks: report.checks.length, cleanup: report.cleanup, emailSent: false, failure: report.failure }));
if (report.result !== 'passed' || !report.cleanup) process.exitCode = 1;
