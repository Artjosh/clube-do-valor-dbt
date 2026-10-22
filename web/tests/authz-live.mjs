/** Explicit opt-in, dedicated-project integration test. Never sends email.
 * Run from repository root: node web/tests/authz-live.mjs --allow-dedicated-project
 * Reads ignored web/.dev.vars; admin generate_link replaces ONLY OTP delivery.
 * All verification, RPC, row locks, expiry and revocation use real Supabase/PostgreSQL.
 */
import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
import { start, confirm, confirmation, approve, poll, session, logout, claimInvite, verifyOtp } from '../lib/auth/handlers.ts';
import { config, cookieName, hash, randomSecret } from '../lib/auth/core.ts';

const WEB = fileURLToPath(new URL('../', import.meta.url));
const REF = 'igucxanapndewkbtarfn';
if (!process.argv.includes('--allow-dedicated-project')) throw new Error('Explicit dedicated-project opt-in required');
Object.assign(process.env, parseEnv(await readFile(path.join(WEB,'.dev.vars'),'utf8')));
process.env.AUTH_TRUST_CLOUDFLARE = 'false';
process.env.AUTH_ENABLED = 'true';
let cfg = config();
if (!cfg || cfg.supabaseUrl !== `https://${REF}.supabase.co`) throw new Error('Dedicated identity project config required');
const nativeFetch = globalThis.fetch;
const temp = await mkdtemp(path.join(tmpdir(),'cdv-auth-fixtures-'));
const report = { executedAt:new Date().toISOString(), projectRef:REF, mode:'live-authz-provider-no-email', checks:[], cleanup:false };
let users = [], challenges = [], claims = [], invites = [];
const generated = new Map();
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

import { readAnalyticsAccess } from '../lib/auth/guard.ts';
import { GET as analytics } from '../app/api/analytics/route.ts';
import { GET as exportCsv } from '../app/api/export/route.ts';

const fixturePath=path.join(WEB,'.sites-runtime/authz-http-fixtures.json');
async function cleanup() {
  if(challenges.length) await sql(`delete from cdv_private.device_challenges where id in (${challenges.map(id=>`'${id}'`).join(',')});`);
  if(claims.length) await sql(`delete from cdv_private.invite_claims where id in (${claims.map(id=>`'${id}'`).join(',')});`);
  for(const id of users) await admin(`users/${id}`,undefined,'DELETE');
  if(invites.length) await sql(`delete from cdv_private.analytics_invites where id in (${invites.map(id=>`'${id}'`).join(',')});`);
  const inIds=values=>values.length?values.map(id=>`'${id}'`).join(','):'null';
  const remaining=await sql(`select
    (select count(*) from cdv_private.device_challenges where id in (${inIds(challenges)})) as challenges,
    (select count(*) from cdv_private.browser_sessions where challenge_id in (${inIds(challenges)})) as sessions,
    (select count(*) from cdv_private.invite_claims where id in (${inIds(claims)})) as claims,
    (select count(*) from auth.users where id in (${inIds(users)})) as users,
    (select count(*) from cdv_private.entitlements where user_id in (${inIds(users)})) as entitlements,
    (select count(*) from cdv_private.user_roles where user_id in (${inIds(users)})) as roles,
    (select count(*) from cdv_private.analytics_invites where id in (${inIds(invites)})) as invites;`);
  if(!remaining.rows?.[0] || Object.values(remaining.rows[0]).some(value=>Number(value)!==0)) throw new Error('QA cleanup left identity records');
  users=[]; challenges=[]; claims=[]; invites=[];
}
if(process.argv.includes('--cleanup-http-fixtures')) {
  const stored=JSON.parse(await readFile(fixturePath,'utf8'));
  if(stored.projectRef!==REF || stored.purpose!=='cdv-authz-http-qa') throw new Error('Unexpected fixture manifest');
  ({users,challenges,claims,invites}=stored.cleanup);
  if(![...users,...invites].every(v=>/^[a-f0-9-]{36}$/.test(v)) || ![...challenges,...claims].every(v=>/^[a-f0-9]{64}$/.test(v))) throw new Error('Invalid fixture IDs');
  await cleanup(); await rm(fixturePath); await rm(temp,{recursive:true,force:true});
  const previous=JSON.parse(await readFile(path.join(WEB,'tests/authz-live-results.json'),'utf8'));
  previous.httpFixtures='removed after coordinator QA';
  previous.httpFixturesCleanup=true;
  previous.httpFixturesRemaining={users:0,challenges:0,sessions:0,claims:0,entitlements:0,roles:0,invites:0};
  previous.httpFixturesFileRemoved=true;
  previous.httpFixturesCleanedAt=new Date().toISOString();
  await writeFile(path.join(WEB,'tests/authz-live-results.json'),JSON.stringify(previous,null,2)+'\n');
  console.log('HTTP fixture identities, sessions, claims and QA invitation removed.');
  process.exit(0);
}
async function identity() {
  const address=`cdv-authz-${crypto.randomUUID()}@example.test`;
  const u=await admin('users',{email:address,email_confirm:false});
  if(!/^[a-f0-9-]{36}$/.test(u.id)) throw new Error('Missing QA identity');
  users.push(u.id); return {id:u.id,email:address};
}
async function invitation() {
  const id=crypto.randomUUID(), code=randomSecret(), digest=await hash(`cdv-invite-v1:${code}`);
  await sql(`insert into cdv_private.analytics_invites(id,code_hash,label) values('${id}','${digest}','authz-qa-only');`);
  invites.push(id); return {id,code};
}
async function claim(code) {
  const response=await claimInvite(request('/api/auth/invite/claim','POST',{code}));
  check(response.status===200,'Valid shared invitation creates browser-bound claim');
  const bound=cookie(response,'invite');
  claims.push(bound.split('=')[1].split('.')[0]);
  return bound;
}
async function begin(user, inviteCookie) {
  const response=await start(request('/api/auth/device/start','POST',{email:user.email,useInvite:!!inviteCookie},inviteCookie));
  check(response.status===200,'Bound email challenge created without SMTP');
  const data=await response.json(); challenges.push(data.challengeId);
  return {...data,device:cookie(response,'device'),...generated.get(data.challengeId)};
}
async function otp(f,extra={}) {
  return verifyOtp(request('/api/auth/device/verify','POST',{challengeId:f.challengeId,code:f.otp,...extra},f.device));
}
async function access(c) { return readAnalyticsAccess(c); }
async function resetPoll(id) { await sql(`update cdv_private.device_challenges set next_poll_at=null where id='${id}';`); }
globalThis.fetch=async(input,options={})=>{
  const url=new URL(String(input));
  if(url.origin===cfg.supabaseUrl && url.pathname==='/auth/v1/otp') {
    deliveryCalls++;
    const payload=JSON.parse(options.body), redirect=url.searchParams.get('redirect_to');
    const link=await admin('generate_link',{type:'magiclink',email:payload.email,redirect_to:redirect});
    const otpValue=link.email_otp || link.properties?.email_otp;
    const tokenHash=link.hashed_token || link.properties?.hashed_token;
    if(!/^(?:\d{6}|\d{8})$/.test(otpValue)||!tokenHash) throw new Error('Invalid generated token; response withheld');
    if(report.otpLength && report.otpLength!==otpValue.length) throw new Error('Provider OTP length changed');
    report.otpLength=otpValue.length;
    process.env.AUTH_OTP_LENGTH=String(otpValue.length); cfg=config();
    generated.set(new URL(redirect).searchParams.get('challengeId'),{otp:otpValue,tokenHash});
    return new Response('{}',{headers:{'content-type':'application/json'}});
  }
  if(url.origin===cfg.supabaseUrl && url.pathname==='/auth/v1/verify') verificationCalls++;
  return nativeFetch(input,options);
};
let failed;
try {
  process.env.AUTH_ENABLED='false';
  check((await analytics(request('/api/analytics?from=bad'))).status===503,'Disabled authentication denies analytics before filter parsing');
  process.env.AUTH_ENABLED='true';
  check((await analytics(request('/api/analytics?from=bad'))).status===401,'Anonymous analytics denied before filter parsing');
  check((await exportCsv(request('/api/export?kind=bad'))).status===401,'Anonymous export denied before kind parsing');
  const denied=await nativeFetch(`${cfg.supabaseUrl}/rest/v1/rpc/cdv_authz`,{method:'POST',headers:{apikey:cfg.publicKey,'content-type':'application/json'},body:JSON.stringify({p_action:'session',p_payload:{}})});
  check([401,403].includes(denied.status),'Anonymous cannot execute authorization RPC');
  const normal=await identity(), f=await begin(normal);
  check((await access(null)).status===401,'Challenge creation does not authenticate');
  check((await verifyOtp(request('/api/auth/device/verify','POST',{challengeId:f.challengeId,code:f.otp}))).status===401,'Real OTP alone without browser binding denied');
  const wrong=f.otp==='0'.repeat(f.otp.length)?'1'.repeat(f.otp.length):'0'.repeat(f.otp.length);
  check((await otp(f,{code:wrong})).status===401,'Incorrect OTP rejected by real Supabase');
  const normalResponse=await otp(f,{email:'attacker@example.test',role:'analyst',permissions:['analytics:read']});
  const normalCookie=cookie(normalResponse,'session'), normalBody=await normalResponse.json();
  check(normalResponse.status===200 && normalBody.authenticated && !normalBody.authorized && normalBody.role===null,'Normal OTP proves email but grants no role or permission');
  check((await analytics(request('/api/analytics?from=bad','GET',undefined,normalCookie))).status===403,'Authenticated without entitlement denied before filter parsing');
  check((await exportCsv(request('/api/export?kind=bad','GET',undefined,normalCookie))).status===403,'Authenticated without entitlement cannot export');
  check((await otp(f)).status===410,'OTP completion replay cannot create a second session');
  const invitation1=await invitation();
  check((await claimInvite(request('/api/auth/invite/claim','POST',{code:randomSecret()}))).status===403,'Unprovisioned invitation denied');
  const c=await claim(invitation1.code);
  check((await start(request('/api/auth/device/start','POST',{email:normal.email,useInvite:true}))).status===403,'Invitation claim requires original HttpOnly cookie');
  const invited=await begin(normal,c);
  check((await start(request('/api/auth/device/start','POST',{email:normal.email,useInvite:true},c))).status===403,'Claim cannot bind to a second challenge');
  check((await access(normalCookie)).status===403,'Claim and challenge do not grant before email proof');
  const granted=await otp(invited), grantedBody=await granted.json(), grantedCookie=cookie(granted,'session');
  check(granted.status===200 && grantedBody.authorized && grantedBody.role==='analyst' && grantedBody.permissions.includes('analytics:read'),'Verified invited email atomically receives analyst and analytics permission');
  check((await access(grantedCookie)).status===200,'Database guard permits granted session');
  check((await access(normalCookie)).status===200,'Existing verified session sees newly durable grant');
  await sql(`update cdv_private.entitlements set revoked_at=now() where user_id='${normal.id}';`);
  check((await access(grantedCookie)).status===403,'Entitlement revocation enforced on next read');
  const tombstone=await begin(normal,await claim(invitation1.code));
  const reproof=await otp(tombstone);
  check(reproof.status===200 && !(await reproof.json()).authorized,'Fresh invitation and real OTP cannot resurrect revoked entitlement');
  await sql(`update cdv_private.entitlements set revoked_at=null where user_id='${normal.id}'; update cdv_private.user_roles set revoked_at=now() where user_id='${normal.id}';`);
  check((await access(grantedCookie)).status===403,'Role revocation enforced independently');
  await sql(`update cdv_private.user_roles set revoked_at=null where user_id='${normal.id}'; update cdv_private.analytics_invites set expires_at=now()-interval '1 second' where id='${invitation1.id}';`);
  check((await access(grantedCookie)).status===200,'Invitation expiry does not erase durable grants');
  check((await claimInvite(request('/api/auth/invite/claim','POST',{code:invitation1.code}))).status===403,'Expired invitation rejects new admission');
  await sql(`update cdv_private.analytics_invites set expires_at=null,revoked_at=now() where id='${invitation1.id}';`);
  check((await access(grantedCookie)).status===403,'Shared invitation revocation denies associated grants immediately');
  await sql(`update cdv_private.analytics_invites set revoked_at=null where id='${invitation1.id}';`);
  const second=await identity(), cross=await begin(second,await claim(invitation1.code));
  const before=verificationCalls;
  const callback=await confirm(request(`/api/auth/confirm?challengeId=${cross.challengeId}&token_hash=${cross.tokenHash}&type=email`));
  const phone=cookie(callback,'confirm');
  check(callback.status===303 && verificationCalls===before,'Callback GET does not consume provider token');
  check((await (await confirmation(request('/api/auth/device/confirmation','GET',undefined,phone))).json()).displayCode===null,'Phone does not expose visual approval code');
  check((await approve(request('/api/auth/device/approve','POST',{displayCode:cross.displayCode},phone))).status===200,'Cross-device real email verification preserved');
  const raced=await Promise.all([1,2].map(()=>poll(request(`/api/auth/device/poll?challengeId=${cross.challengeId}`,'GET',undefined,cross.device))));
  const winner=raced.find(r=>r.status===200), crossCookie=cookie(winner,'session');
  check(raced.some(r=>r.status===429) && (await winner.json()).authorized,'Concurrent consumers serialize grant and session issuance');
  await resetPoll(cross.challengeId);
  const repeat=await poll(request(`/api/auth/device/poll?challengeId=${cross.challengeId}`,'GET',undefined,cross.device));
  check(cookie(repeat,'session')===crossCookie,'Retry recovers same opaque session');
  const rows=await sql(`select (select count(*) from cdv_private.entitlements where user_id='${second.id}') as grants,(select count(*) from cdv_private.browser_sessions where challenge_id='${cross.challengeId}') as sessions;`);
  check(Number(rows.rows[0].grants)===1 && Number(rows.rows[0].sessions)===1,'PostgreSQL contains exactly one grant and one session after race');
  check((await logout(request('/api/auth/logout','POST',undefined,`${crossCookie}; ${cross.device}`))).status===200 && (await access(crossCookie)).status===401,'Logout revokes real session');
  const expiredClaim=await claim(invitation1.code), expiredId=expiredClaim.split('=')[1].split('.')[0];
  await sql(`update cdv_private.invite_claims set expires_at=now()-interval '1 second' where id='${expiredId}';`);
  check((await start(request('/api/auth/device/start','POST',{email:second.email,useInvite:true},expiredClaim))).status===403,'Expired claim cannot initiate privileged challenge');
  const limited=await begin(second);
  const bad=limited.otp==='0'.repeat(limited.otp.length)?'1'.repeat(limited.otp.length):'0'.repeat(limited.otp.length);
  for(let i=0;i<5;i++) await otp(limited,{code:bad});
  const calls=verificationCalls;
  check((await otp(limited)).status===410 && verificationCalls===calls,'Five incorrect OTP attempts lock challenge before provider call');
  report.result='passed';
} catch(error) {
  failed=error instanceof Error ? error.message : 'Live authz validation failed';
  report.result='failed';report.failure=failed;
} finally {
  try { await cleanup(); report.cleanup=true; } catch { report.cleanup=false;report.cleanupRequired={users,challenges,claims,invites}; }
}
if(!failed && report.cleanup && process.argv.includes('--keep-http-fixtures')) {
  try {
    execFileSync('git',['check-ignore',fixturePath],{cwd:WEB,stdio:'pipe'});
    const qaInvite=await invitation(), analyst=await identity(), noRole=await identity();
    const a=await begin(analyst,await claim(qaInvite.code)), aResponse=await otp(a);
    const b=await begin(noRole), bResponse=await otp(b);
    const analystCookie=cookie(aResponse,'session'), noRoleCookie=cookie(bResponse,'session');
    check((await access(analystCookie)).status===200 && (await access(noRoleCookie)).status===403,'HTTP fixtures distinguish authorized and no-role identities');
    await mkdir(path.dirname(fixturePath),{recursive:true});
    await writeFile(fixturePath,JSON.stringify({purpose:'cdv-authz-http-qa',projectRef:REF,createdAt:new Date().toISOString(),otpLength:report.otpLength,analyst:{cookie:analystCookie},noRole:{cookie:noRoleCookie},cleanup:{users,challenges,claims,invites}},null,2));
    report.httpFixtures='retained in ignored file pending coordinator QA';
  } catch(error) { failed='HTTP fixture creation failed; credentials withheld';report.result='failed';report.failure=failed;try{await cleanup();}catch{report.cleanupRequired={users,challenges,claims,invites};report.cleanup=false;} }
}
globalThis.fetch=nativeFetch;
report.emailSent=false;report.verificationCalls=verificationCalls;report.generatedLinks=deliveryCalls;
await writeFile(path.join(WEB,'tests/authz-live-results.json'),JSON.stringify(report,null,2)+'\n');
await rm(temp,{recursive:true,force:true});
console.log(`Authz live checks: ${report.checks.length}; result: ${report.result}; cleanup: ${report.cleanup}; OTP length: ${report.otpLength}; email sent: false`);
if(failed || !report.cleanup) process.exitCode=1;
