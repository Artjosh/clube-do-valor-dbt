import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readAnalyticsAccess } from '../lib/auth/guard.ts';
import { claimInvite, start, verifyOtp, session } from '../lib/auth/handlers.ts';
import { hash } from '../lib/auth/core.ts';

// Any accidental eager import or denied-request import of the snapshot fails this suite.
const hooks=registerHooks({resolve(specifier,context,next){
  if(specifier.endsWith('/analytics.ts')) throw new Error('Denied path tried to load analytical snapshot');
  return next(specifier,context);
}});
const {GET:analytics}=await import('../app/api/analytics/route.ts');
const {GET:csv}=await import('../app/api/export/route.ts');
const {GET:health}=await import('../app/api/health/route.ts');
const ENV={AUTH_ENABLED:'true',AUTH_ORIGIN:'https://example.test',SUPABASE_URL:'https://auth.example.test',SUPABASE_ANON_KEY:'test-anon',SUPABASE_SERVICE_ROLE_KEY:'test-service',AUTH_COOKIE_KEY:'ab'.repeat(32),AUTH_OTP_LENGTH:'6',NODE_ENV:'production'};
const nativeFetch=globalThis.fetch;
const saved={};
let calls=[];
const request=(route,method='GET',payload,cookie,extra={})=>new Request(`https://example.test${route}`,{
  method,headers:{origin:ENV.AUTH_ORIGIN,'sec-fetch-site':'same-origin',...(payload?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...extra},body:payload?JSON.stringify(payload):undefined
});
const secret='12'.repeat(32), id='34'.repeat(32);
const sessionCookie=`__Host-cdv-session=${secret}`;
const deviceCookie=`__Host-cdv-device=${id}.${secret}`;
function mock(responder){globalThis.fetch=async(url,init)=>{
  const payload=JSON.parse(init.body);calls.push({url:String(url),payload});
  const result=await responder(String(url),payload);
  return result instanceof Response?result:new Response(JSON.stringify(result),{headers:{'content-type':'application/json'}});
};}
beforeEach(()=>{for(const key of Object.keys(ENV)){saved[key]=process.env[key];process.env[key]=ENV[key];}calls=[];mock(()=>{throw new Error('Unexpected provider request');});});
afterEach(()=>{globalThis.fetch=nativeFetch;for(const key of Object.keys(ENV)){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}});

test('disabled auth returns 503 before snapshot and before malformed filters/export kind',async()=>{
  process.env.AUTH_ENABLED='false';
  for(const handler of [analytics,csv]){
    const response=await handler(request('/api/analytics?from=bad&kind=bad'));
    assert.equal(response.status,503);assert.match(response.headers.get('cache-control'),/no-store/);
    assert.deepEqual(await response.json(),{error:'auth_not_configured'});
  }
  assert.equal(calls.length,0);
});
test('anonymous requests and forged session return 401 without parsing filters/loading data',async()=>{
  for(const cookie of [undefined,'__Host-cdv-session=analyst'])for(const handler of [analytics,csv]){
    assert.equal((await handler(request('/api/export?kind=invalid&from=bad','GET',undefined,cookie))).status,401);
  }
  assert.equal(calls.length,0);
});
test('authenticated normal login without role/grant is 403, client metadata cannot grant',async()=>{
  mock(()=>({status:'authenticated',email:'user@example.test',role:null,permissions:[],user_metadata:{role:'analyst',permissions:['analytics:read']}}));
  for(const handler of [analytics,csv])assert.equal((await handler(request('/api/analytics?from=bad','GET',undefined,sessionCookie))).status,403);
  const access=await readAnalyticsAccess(sessionCookie);assert.equal(access.authenticated,true);assert.equal(access.authorized,false);assert.equal(access.role,null);
});
test('both durable role and permission required; missing response contract fails closed',async()=>{
  mock(()=>({status:'authenticated',email:'user@example.test',role:null,permissions:['analytics:read']}));
  assert.equal((await readAnalyticsAccess(sessionCookie)).status,403);
  mock(()=>({status:'authenticated',email:'user@example.test',role:'analyst'}));
  assert.equal((await readAnalyticsAccess(sessionCookie)).status,503);
});
test('authorization rereads provider on every call so revocation affects next read',async()=>{
  let granted=true;mock(()=>({status:'authenticated',email:'user@example.test',role:granted?'analyst':null,permissions:granted?['analytics:read']:[]}));
  assert.equal((await readAnalyticsAccess(sessionCookie)).status,200);granted=false;
  assert.equal((await readAnalyticsAccess(sessionCookie)).status,403);assert.equal(calls.length,2);
  assert.ok(calls.every(c=>c.url.endsWith('/rpc/cdv_authz')));
});
test('provider failure is sanitized 503 and never falls back to public snapshot',async()=>{
  mock(()=>new Response('PRIVATE PROVIDER ERROR',{status:500}));
  const response=await analytics(request('/api/analytics','GET',undefined,sessionCookie));
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'auth_unavailable'});
});
test('health returns no dataset metadata and performs no remote request',async()=>{
  const response=await health();assert.deepEqual(await response.json(),{status:'ok',auth:{configured:true,providerHealth:'not_probed'}});assert.equal(calls.length,0);
});
test('invite claim sends only hash to database, returns HttpOnly binding and no session',async()=>{
  mock(()=>({status:'claimed',expires_at:new Date(Date.now()+600000).toISOString()}));
  const code='ef'.repeat(32);const response=await claimInvite(request('/api/auth/invite/claim','POST',{code}));
  assert.equal(response.status,200);const result=await response.json();assert.equal(result.accepted,true);
  assert.ok(response.headers.get('set-cookie').includes('__Host-cdv-invite='));
  assert.ok(!response.headers.get('set-cookie').includes('cdv-session'));
  assert.equal(calls[0].payload.p_payload.code_hash,await hash(`cdv-invite-v1:${code}`));
  assert.ok(!JSON.stringify(calls[0].payload).includes(code));assert.ok(!('authenticated'in result));
});
test('client claim IDs, user metadata and permission fields cannot attach invite to normal login',async()=>{
  mock((url,payload)=>url.includes('/otp?')?{}:{status:'created',expires_at:new Date(Date.now()+300000).toISOString()});
  const response=await start(request('/api/auth/device/start','POST',{email:'user@example.test',claim_id:id,permissions:['analytics:read'],user_metadata:{role:'analyst'}}));
  assert.equal(response.status,200);const challenge=await response.json();assert.equal(challenge.otpLength,6);
  assert.match(challenge.displayCode,/^\d{8}$/);
  assert.ok(!('claim_id'in calls[0].payload.p_payload));
  const missing=await start(request('/api/auth/device/start','POST',{email:'user@example.test',useInvite:true}));assert.equal(missing.status,403);
});
test('OTP verification uses bound challenge email and real provider verify contract, never POST email',async()=>{
  mock((url,p)=>{
    if(url.endsWith('/auth/v1/verify'))return{user:{id:'test-user',email:'bound@example.test',email_confirmed_at:new Date().toISOString()}};
    if(p.p_action==='prepare_otp')return{status:'pending',email:'bound@example.test'};
    if(p.p_action==='complete_otp')return{status:'approved',expires_at:new Date(Date.now()+300000).toISOString(),authorized:false,role:null,permissions:[]};
    throw new Error('Unexpected call');
  });
  const response=await verifyOtp(request('/api/auth/device/verify','POST',{challengeId:id,code:'012345',email:'attacker@example.test',role:'analyst'},deviceCookie));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{authenticated:true,authorized:false,role:null,permissions:[]});
  assert.equal(calls[1].payload.email,'bound@example.test');assert.equal(calls[1].payload.type,'email');
  assert.equal(calls[1].payload.token,'012345');
  assert.equal(calls[2].payload.p_payload.email,'bound@example.test');
  assert.match(response.headers.get('set-cookie'),/HttpOnly/);
});
test('OTP and invite reject cross-origin, absent device cookie and format without network',async()=>{
  assert.equal((await claimInvite(request('/api/auth/invite/claim','POST',{code:'aa'.repeat(32)},undefined,{origin:'https://evil.test'}))).status,403);
  assert.equal((await verifyOtp(request('/api/auth/device/verify','POST',{challengeId:id,code:'123456'}))).status,401);
  assert.equal((await verifyOtp(request('/api/auth/device/verify','POST',{challengeId:id,code:'12345678'},deviceCookie))).status,400);
  assert.equal(calls.length,0);
});
test('session explicitly distinguishes authenticated account from authorized analyst',async()=>{
  mock(()=>({status:'authenticated',email:'user@example.test',role:null,permissions:[]}));
  const response=await session(request('/api/auth/session','GET',undefined,sessionCookie));
  const state=await response.json();assert.equal(state.authenticated,true);assert.equal(state.authorized,false);assert.equal(state.role,null);assert.deepEqual(state.permissions,[]);
});
process.on('exit',()=>hooks.deregister());
