/** Explicit opt-in, dedicated-project integration test. Never sends email.
 * Run from repository root: node web/tests/auth-live.mjs --allow-dedicated-project
 * Reads ignored web/.dev.vars; admin generate_link replaces ONLY OTP delivery.
 * All verification, RPC, row locks, expiry and revocation use real Supabase/PostgreSQL.
 */
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
import { start, confirm, confirmation, approve, poll, session, logout } from '../lib/auth/handlers.ts';
import { config, cookieName, hash, randomSecret } from '../lib/auth/core.ts';

const WEB = fileURLToPath(new URL('../', import.meta.url));
const REF = 'igucxanapndewkbtarfn';
if (!process.argv.includes('--allow-dedicated-project')) throw new Error('Explicit dedicated-project opt-in required');
Object.assign(process.env, parseEnv(await readFile(path.join(WEB,'.dev.vars'),'utf8')));
process.env.AUTH_TRUST_CLOUDFLARE = 'false';
const cfg = config();
if (!cfg || cfg.supabaseUrl !== `https://${REF}.supabase.co`) throw new Error('Dedicated identity project config required');
const nativeFetch = globalThis.fetch;
const temp = await mkdtemp(path.join(tmpdir(),'cdv-auth-fixtures-'));
const report = { executedAt:new Date().toISOString(), projectRef:REF, mode:'live-provider-no-email', checks:[], cleanup:false };
const users = [], challenges = [], generated = new Map();
let verificationCalls=0, deliveryCalls=0;
const check = (ok,label) => { if(!ok) throw new Error(label); report.checks.push(label); console.log(`PASS ${label}`); };
const headers = { 'Content-Type':'application/json', apikey:cfg.serviceKey, Authorization:`Bearer ${cfg.serviceKey}` };
async function admin(endpoint, payload, method='POST') {
  const response=await nativeFetch(`${cfg.supabaseUrl}/auth/v1/admin/${endpoint}`, {method,headers,body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw new Error(`Admin operation failed (${response.status}); response withheld`);
  return response.status===204 ? {} : await response.json();
}
async function sql(query) {
  const file=path.join(temp,'fixture.sql'); await writeFile(file,query);
  try {
    const output=execFileSync(process.execPath,[process.env.CDV_NPM_CLI || 'C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js','exec','--yes','--package=supabase','--','supabase','db','query','--linked','--project-ref',REF,'--file',file,'--output','json'], {cwd:WEB,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000});
    return JSON.parse(output);
  } catch { throw new Error('Dedicated fixture SQL failed; details withheld'); }
}
function request(route, method='GET', value, cookie, extra={}) {
  return new Request(`${cfg.origin}${route}`, {method,headers:{origin:cfg.origin,'sec-fetch-site':'same-origin',...(value===undefined?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...extra},body:value===undefined?undefined:JSON.stringify(value)});
}
function cookie(response,kind) { return response.headers.getSetCookie().find(v=>v.startsWith(cookieName(kind,cfg)+'='))?.split(';')[0]; }
async function fixture(emailAddress) {
  const response=await start(request('/api/auth/device/start','POST',{email:emailAddress}));
  check(response.status===200, 'Start creates bound challenge without SMTP');
  const result=await response.json(); challenges.push(result.challengeId);
  const device=cookie(response,'device');
  check(/^[0-9]{8}$/.test(result.displayCode) && !!device,'Eight-digit visual code and HttpOnly browser binding');
  check(!JSON.stringify(result).includes(device.split('.')[1]),'Browser secret absent from JSON');
  return {...result,device,tokenHash:generated.get(result.challengeId)};
}
async function mobile(f) {
  const response=await confirm(request(`/api/auth/confirm?challengeId=${f.challengeId}&token_hash=${f.tokenHash}&type=email`));
  check(response.status===303 && response.headers.get('location')===`${cfg.origin}/confirm`,'Callback redirects without credentials in destination');
  const mobileCookie=cookie(response,'confirm');
  check(!!mobileCookie && !mobileCookie.includes(f.tokenHash),'Confirmation token encrypted in HttpOnly cookie');
  return mobileCookie;
}
async function resetPoll(id) { await sql(`update cdv_private.device_challenges set next_poll_at = now() - interval '1 second' where id='${id}';`); }

globalThis.fetch=async (input,options={})=>{
  const url=new URL(String(input));
  if(url.origin===cfg.supabaseUrl && url.pathname==='/auth/v1/otp') {
    deliveryCalls++;
    const payload=JSON.parse(options.body);
    const redirect=url.searchParams.get('redirect_to');
    const link=await admin('generate_link',{type:'magiclink',email:payload.email,redirect_to:redirect});
    const token=link.hashed_token || link.properties?.hashed_token;
    if(!token) throw new Error('Missing generated token; provider response withheld');
    generated.set(new URL(redirect).searchParams.get('challengeId'),token);
    return new Response('{}',{headers:{'content-type':'application/json'}});
  }
  if(url.origin===cfg.supabaseUrl && url.pathname==='/auth/v1/verify') verificationCalls++;
  return nativeFetch(input,options);
};

let failure;
try {
  const suffix=crypto.randomUUID();
  const email1=`cdv-qa-${suffix}@example.test`, email2=`cdv-qa-other-${suffix}@example.test`;
  for(const address of [email1,email2]) {
    const user=await admin('users',{email:address,email_confirm:true});
    if(!/^[0-9a-f-]{36}$/.test(user.id)) throw new Error('Missing QA identity');
    users.push(user.id);
  }
  const denied=await nativeFetch(`${cfg.supabaseUrl}/rest/v1/rpc/cdv_auth`,{method:'POST',headers:{apikey:cfg.publicKey,'content-type':'application/json'},body:JSON.stringify({p_action:'session',p_payload:{}})});
  check([401,403].includes(denied.status),'Anonymous role cannot execute identity RPC');

  const f=await fixture(email1);
  const countsBefore=verificationCalls;
  const phone=await mobile(f);
  const display=await confirmation(request('/api/auth/device/confirmation','GET',undefined,phone));
  const displayBody=await display.json();
  check(display.status===200 && displayBody.displayCode===null && displayBody.email.includes('***'),'Phone never exposes PC code or full email before verification');
  check(verificationCalls===countsBefore,'GET callback and scanner do not verify or consume email token');
  const wrong=await approve(request('/api/auth/device/approve','POST',{displayCode:f.displayCode==='00000000'?'11111111':'00000000'},phone));
  check(wrong.status===410 && verificationCalls===countsBefore,'Wrong visual code rejected before consuming provider token');
  check((await approve(request('/api/auth/device/approve','POST',{displayCode:f.displayCode},phone,{origin:'https://evil.example'}))).status===403,'Cross-origin approval denied');
  check((await poll(request(`/api/auth/device/poll?challengeId=${f.challengeId}`))).status===401,'Challenge ID alone cannot obtain session');
  const approved=await approve(request('/api/auth/device/approve','POST',{displayCode:f.displayCode},phone));
  check(approved.status===200,'Real Supabase email verification approves identity-bound challenge');
  const simultaneous=await Promise.all([poll(request(`/api/auth/device/poll?challengeId=${f.challengeId}`,'GET',undefined,f.device)),poll(request(`/api/auth/device/poll?challengeId=${f.challengeId}`,'GET',undefined,f.device))]);
  const issued=simultaneous.find(r=>r.status===200);
  check(issued && simultaneous.filter(r=>r.status===429).length===1,'Concurrent real PostgreSQL consumers serialized with durable polling limit');
  const desktop=cookie(issued,'session');
  check(!!desktop && (await issued.json()).status==='approved','Only bound PC receives opaque session cookie');
  await resetPoll(f.challengeId);
  const retry=await poll(request(`/api/auth/device/poll?challengeId=${f.challengeId}`,'GET',undefined,f.device));
  check(cookie(retry,'session')===desktop,'Lost-response retry returns same session, not a second session');
  const authenticated=await session(request('/api/auth/session','GET',undefined,desktop));
  const authBody=await authenticated.json();
  check(authBody.authenticated===true && authBody.user.email===email1,'PC session resolves verified identity from PostgreSQL');
  check(!JSON.stringify(authBody).includes('access_token')&&!JSON.stringify(authBody).includes('refresh_token'),'Provider tokens never returned in session JSON');

  // Expire exactly this test session, prove denial, then restore its expiry for logout test.
  const token=desktop.slice(desktop.indexOf('=')+1), tokenHash=await hash(token);
  await sql(`update cdv_private.browser_sessions set expires_at=now()-interval '1 second' where token_hash='${tokenHash}' and challenge_id='${f.challengeId}';`);
  check((await (await session(request('/api/auth/session','GET',undefined,desktop))).json()).authenticated===false,'Database expiry invalidates a valid browser cookie');
  await sql(`update cdv_private.browser_sessions set expires_at=now()+interval '1 minute' where token_hash='${tokenHash}' and challenge_id='${f.challengeId}';`);
  check((await logout(request('/api/auth/logout','POST',undefined,`${desktop}; ${f.device}`))).status===200,'Logout revokes session and cancels device challenge');
  check((await (await session(request('/api/auth/session','GET',undefined,desktop))).json()).authenticated===false,'Replaying logged-out session denied');
  check((await (await poll(request(`/api/auth/device/poll?challengeId=${f.challengeId}`,'GET',undefined,f.device))).json()).status==='expired','Consumed challenge cannot resurrect logout');
  check((await approve(request('/api/auth/device/approve','POST',{displayCode:f.displayCode},phone))).status===410,'Replaying phone approval denied');

  const other=await fixture(email2);
  const otherLink=await admin('generate_link',{type:'magiclink',email:email1});
  other.tokenHash=otherLink.hashed_token || otherLink.properties?.hashed_token;
  const otherPhone=await mobile(other);
  const mismatch=await approve(request('/api/auth/device/approve','POST',{displayCode:other.displayCode},otherPhone));
  check(mismatch.status===403,'A real valid token for another email cannot approve requested email');

  const expired=await fixture(email2), expiredPhone=await mobile(expired);
  await sql(`update cdv_private.device_challenges set expires_at=now()-interval '1 second' where id='${expired.challengeId}';`);
  const beforeExpiry=verificationCalls;
  check((await approve(request('/api/auth/device/approve','POST',{displayCode:expired.displayCode},expiredPhone))).status===410 && verificationCalls===beforeExpiry,'Expired challenge rejects approval before provider verification');
  check((await (await poll(request(`/api/auth/device/poll?challengeId=${expired.challengeId}`,'GET',undefined,expired.device))).json()).status==='expired','Expired challenge cannot be polled into session');

  const third=await fixture(email2);
  const calls=deliveryCalls;
  check((await start(request('/api/auth/device/start','POST',{email:email2}))).status===429 && deliveryCalls===calls,'Durable per-email request limit blocks further delivery');
  const thirdPhone=await mobile(third);
  const bad=third.displayCode==='00000000'?'11111111':'00000000';
  for(let i=0;i<5;i++) await approve(request('/api/auth/device/approve','POST',{displayCode:bad},thirdPhone));
  check((await approve(request('/api/auth/device/approve','POST',{displayCode:third.displayCode},thirdPhone))).status===410,'Five failed visual-code attempts lock challenge durably');
  report.result='passed';
} catch(error) {
  // Messages are only our own fixed labels, never raw provider bodies or assertion values.
  failure = error instanceof Error ? error.message : 'Live validation failed';
  report.result='failed'; report.failure=failure;
} finally {
  globalThis.fetch=nativeFetch;
  try {
    // Delete only rows whose IDs this run generated. Never truncate shared tables.
    if(challenges.length) await sql(`delete from cdv_private.device_challenges where id in (${challenges.map(id=>`'${id}'`).join(',')});`);
    for(const id of users) await admin(`users/${id}`,undefined,'DELETE');
    report.cleanup=true;
    await rm(temp,{recursive:true,force:true});
  } catch { report.cleanup=false; report.cleanupRequired={userIds:users,challengeIds:challenges}; }
  report.emailSent=false;
  report.verificationCalls=verificationCalls;
  report.generatedLinks=deliveryCalls;
  await writeFile(path.join(WEB,'tests/auth-live-results.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(`Live checks: ${report.checks.length}; result: ${report.result}; cleanup: ${report.cleanup}; email sent: false`);
if(failure || !report.cleanup) process.exitCode=1;
