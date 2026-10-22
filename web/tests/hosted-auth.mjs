/** Explicit opt-in, dedicated-project integration test. Never sends email.
 * Run from repository root: node web/tests/hosted-auth.mjs --allow-dedicated-project
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
process.env.AUTH_ORIGIN='https://clube-do-valor-intelligence.artjosh.chatgpt.site';
let cfg = config();
if (!cfg || cfg.supabaseUrl !== `https://${REF}.supabase.co`) throw new Error('Dedicated identity project config required');
const nativeFetch = globalThis.fetch;
const temp = await mkdtemp(path.join(tmpdir(),'cdv-auth-fixtures-'));
const report = { executedAt:new Date().toISOString(), projectRef:REF, mode:'hosted-three-identities-no-email', deployment:'appgdep_6ada9064f1bc8191b60c95ab16a9b248',environmentRevision:4,responses:[], checks:[], cleanup:false };
let users = [], challenges = [], claims = [], invites = [];
const generated = new Map();
let verificationCalls=0, deliveryCalls=0;
let matrix=false;
const check = (ok,label) => { if(!ok) {if(!matrix)throw new Error(label);(report.failedChecks??=[]).push(label);console.log(`FAIL ${label}`);return;} report.checks.push(label); console.log(`PASS ${label}`); };
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

const fixturePath=path.join(WEB,'.sites-runtime/hosted-auth-fixtures.json');
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
  report.cleanupRemaining=remaining.rows[0];
  users=[]; challenges=[]; claims=[]; invites=[];
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

// Only two fixture logins are performed in process; no hosted device/start request.
import { getAnalytics, analyticsCsv, parseFilters } from '../lib/analytics.ts';
import { isDeepStrictEqual } from 'node:util';
const target='https://clube-do-valor-intelligence.artjosh.chatgpt.site';
const markers=['Ana Souza','Bruno Lima','Felipe Nunes','transaction_id'];
async function hosted(route,sessionCookie,extra={},method='GET',redirects=0) {
  if(route.includes('/device/start')) throw new Error('Hosted email initiation prohibited');
  const response=await nativeFetch(target+route,{method,headers:{...(sessionCookie?{cookie:sessionCookie}:{}),...extra},redirect:'manual',signal:AbortSignal.timeout(20000)});
  const text=await response.text();
  report.responses.push({route,method,status:response.status,contentType:response.headers.get('content-type'),cacheControl:response.headers.get('cache-control'),vary:response.headers.get('vary'),bytes:Buffer.byteLength(text)});
  if(response.headers.get('cf-mitigated')==='challenge') throw new Error('Hosting WAF challenge; no bypass attempted');
  // Follow only same-path query canonicalization (hosting normalizes _rsc values).
  // Preserve access redirects to /login or /acesso-negado for explicit assertions.
  const location=response.headers.get('location');
  if([307,308].includes(response.status)&&location&&redirects<3) {
    const next=new URL(location,target);
    if(next.origin===target&&next.pathname===new URL(target+route).pathname&&next.href!==target+route) {
      (report.canonicalRedirects??=[]).push({from:route,to:next.pathname+next.search});
      return hosted(next.pathname+next.search,sessionCookie,extra,method,redirects+1);
    }
  }
  return {response,text};
}
let failed;
const csvOnly=process.argv.includes('--csv-only');
try {
  execFileSync('git',['check-ignore',fixturePath],{cwd:WEB,stdio:'pipe'});
  // The orchestration command creates this empty file with user-only ACL before execution.
  const aclProbe=execFileSync('powershell.exe',['-NoProfile','-Command',`$a=Get-Acl -LiteralPath '${fixturePath}';$u=[Security.Principal.WindowsIdentity]::GetCurrent().User;$r=$a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]);if(-not $a.AreAccessRulesProtected -or $r.Count -ne 1 -or $r[0].IdentityReference -ne $u){exit 1}`],{stdio:'pipe'});
  const qaInvite=await invitation(), analyst=await identity(), noRole=csvOnly?null:await identity();
  const a=await begin(analyst,await claim(qaInvite.code)), aResponse=await otp(a);
  const b=noRole?await begin(noRole):null, bResponse=b?await otp(b):null;
  const analystCookie=cookie(aResponse,'session'), noRoleCookie=bResponse?cookie(bResponse,'session'):undefined;
  check(analystCookie?.startsWith('__Host-cdv-session=') && (csvOnly||noRoleCookie?.startsWith('__Host-cdv-session=')),'HTTPS session cookies use __Host prefix');
  check((await access(analystCookie)).status===200 && (csvOnly||(await access(noRoleCookie)).status===403),'Minimal real fixtures have expected authorization');
  await writeFile(fixturePath,JSON.stringify({purpose:'hosted-auth-qa',analyst:{cookie:analystCookie},noRole:{cookie:noRoleCookie},cleanup:{users,challenges,claims,invites}},null,2));
  matrix=true;
  if(csvOnly) {
    for(const kind of ['transactions','clients','portfolios']) {
      const {response,text}=await hosted('/api/export?kind='+kind,analystCookie);
      check(response.status===200,`Focused hosted CSV ${kind} status 200`);
      check(text.replace(/^\uFEFF/,'')===analyticsCsv(kind,{}).replace(/^\uFEFF/,''),`Focused CSV ${kind}: every byte after transport BOM normalization equals local export`);
    }
  } else {
  for(const [name,sessionCookie,expected] of [['anonymous',undefined,401],['no-role',noRoleCookie,403],['analyst',analystCookie,200]]) {
    for(const route of ['/api/analytics','/api/export?kind=transactions','/api/export?kind=clients','/api/export?kind=portfolios']) {
      const {response,text}=await hosted(route,sessionCookie);
      check(response.status===expected,`${name}: ${route} status ${expected}`);
      check(response.headers.get('cache-control')?.includes('no-store'),`${name}: ${route} no-store`);
      if(expected!==200)check(!markers.some(m=>text.includes(m)),`${name}: ${route} no data`);
      else if(route==='/api/analytics')check(isDeepStrictEqual(JSON.parse(text),getAnalytics()),'Hosted analytics equals full local snapshot calculation');
      else check(text.replace(/^\uFEFF/,'')===analyticsCsv(new URL(target+route).searchParams.get('kind'),{}).replace(/^\uFEFF/,''),`Hosted CSV reconciliation after transport BOM normalization ${route}`);
    }
    for(const tier of ['copper','silver','gold'])for(const [variant,route,headers] of [
      ['html',`/?tier=${tier}`,{}],['rsc-header',`/?tier=${tier}&_rsc=hostedqa`,{RSC:'1'}],
      ['rsc-path',`/.rsc?tier=${tier}`,{}],['prefetch',`/?tier=${tier}&_rsc=hostedqa`,{RSC:'1','Next-Router-Prefetch':'1'}]]) {
      const {response,text}=await hosted(route,sessionCookie,headers);
      if([307,308].includes(response.status) && text==='') {
        if(!response.headers.get('cache-control')) {
          report.redirectsWithoutExplicitCacheControl=(report.redirectsWithoutExplicitCacheControl||0)+1;
        }
      } else check(response.headers.get('cache-control')?.includes('no-store'),`${name}: ${tier}/${variant} no-store`);
      if(expected===200) check(response.status===200 && markers.some(m=>text.includes(m)),`${name}: ${tier}/${variant} authorized data`);
      else {
        check(!markers.some(m=>text.includes(m)),`${name}: ${tier}/${variant} no data`);
        const destination=name==='anonymous'?'/login':'/acesso-negado';
        check([200,307,308,401,403].includes(response.status) && ((response.headers.get('location')||'').includes(destination)||text.includes(destination)),`${name}: ${tier}/${variant} access redirect`);
      }
    }
  }
  for(const query of ['client=C001','operation=BUY','asset=PETR4','from=2024-01-01&to=2024-12-31']) {
    const {response,text}=await hosted('/api/analytics?'+query,analystCookie);
    check(response.status===200 && isDeepStrictEqual(JSON.parse(text),getAnalytics(parseFilters(new URLSearchParams(query)))),`Hosted filters reconcile: ${query}`);
  }
  for(const [name,c,expected] of [['anonymous',undefined,401],['no-role',noRoleCookie,403],['analyst',analystCookie,400]]) {
    const {response}=await hosted('/api/analytics?from=invalid',c);
    check(response.status===expected,`${name}: authorization before invalid filters`);
  }
  // Verify no response cached from authorized requests reaches another identity.
  check((await hosted('/api/analytics',undefined)).response.status===401,'Anonymous remains denied after analyst cache warmup');
  check((await hosted('/api/analytics',noRoleCookie)).response.status===403,'No-role remains denied after analyst cache warmup');
  }
  const loggedOut=await hosted('/api/auth/logout',analystCookie,{origin:target,'sec-fetch-site':'same-origin'},'POST');
  check(loggedOut.response.status===200,'Hosted logout succeeds for analyst');
  check((await hosted('/api/analytics',analystCookie)).response.status===401,'Replaying hosted logged-out session denied');
  check((await access(analystCookie)).status===401,'Hosted logout revocation confirmed directly in database guard');
  report.result=report.failedChecks?.length?'failed':'passed';
  if(report.failedChecks?.length)failed='Hosted matrix has failed assertions; see sanitized report';
} catch(error) {
  failed=error instanceof Error ? error.message : 'Hosted auth validation failed';
  report.result='failed';report.failure=failed;
} finally {
  globalThis.fetch=nativeFetch;
  try {await cleanup(); await rm(fixturePath); report.cleanup=true;report.fixtureFileRemoved=true;}
  catch {report.cleanup=false;report.cleanupRequired={users,challenges,claims,invites};}
  report.emailSent=false;report.hostedDeviceStartCalls=0;report.generatedLinks=deliveryCalls;
  await writeFile(path.join(WEB,`../docs/qa/hosted-auth${csvOnly?'-csv':''}-results.json`),JSON.stringify(report,null,2)+'\n');
  await rm(temp,{recursive:true,force:true});
}
console.log(JSON.stringify({checks:report.checks.length,result:report.result,cleanup:report.cleanup,emailSent:false,...(failed?{failure:failed}:{})}));
if(failed || !report.cleanup)process.exitCode=1;
