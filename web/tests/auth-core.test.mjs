import test from 'node:test';
import assert from 'node:assert/strict';
import { config, randomSecret, hash, keyedHash, seal, unseal, sameOrigin, body, setCookie, json, readCookie, cookieName } from '../lib/auth/core.ts';
import { session, start, confirm } from '../lib/auth/handlers.ts';

const env = { AUTH_ENABLED:'true', AUTH_ORIGIN:'https://example.test', SUPABASE_URL:'https://auth.example.test',
  SUPABASE_ANON_KEY:'public-test-key', SUPABASE_SERVICE_ROLE_KEY:'private-test-key', AUTH_COOKIE_KEY:'ab'.repeat(32), NODE_ENV:'production' };
const cfg = config(env);

test('configuration fails closed for missing settings, insecure production and noncanonical origin', () => {
  assert.equal(config({}), null);
  assert.equal(config({...env, AUTH_COOKIE_KEY:'short'}), null);
  assert.equal(config({...env, AUTH_ORIGIN:'http://localhost:3000'}), null);
  assert.equal(config({...env, AUTH_ORIGIN:'https://example.test/path'}), null);
  assert.equal(config({...env, SUPABASE_URL:'https://name:password@auth.example.test'}), null);
  assert.ok(cfg);
  assert.equal(cfg.otpLength,6);
  assert.equal(config({...env,AUTH_OTP_LENGTH:'6'}).otpLength,6);
  assert.equal(config({...env,AUTH_OTP_LENGTH:'8'}),null);
  assert.equal(config({...env,AUTH_OTP_LENGTH:'7'}),null);
});

test('256-bit secrets and independent device/session hashes', async () => {
  const secret = randomSecret(); assert.match(secret,/^[a-f0-9]{64}$/);
  assert.notEqual(secret, randomSecret());
  const sessionSecret = await keyedHash(secret, 'session:challenge');
  assert.notEqual(secret, sessionSecret);
  assert.notEqual(await hash(secret), await hash(sessionSecret));
});

test('sealed confirmation rejects tampering, expiry, key and origin changes', async () => {
  const payload = {challengeId:randomSecret(), tokenHash:randomSecret(), exp:Date.now()+60000};
  const sealed = await seal(cfg, payload);
  assert.equal(sealed.includes(payload.tokenHash), false);
  assert.deepEqual(await unseal(cfg,sealed),payload);
  const [iv,cipher] = sealed.split('.');
  await assert.rejects(unseal(cfg, `${iv}.${cipher[0] === 'A' ? 'B' : 'A'}${cipher.slice(1)}`));
  await assert.rejects(unseal({...cfg,origin:'https://other.test'},sealed));
  await assert.rejects(unseal({...cfg,sealKey:'cd'.repeat(32)},sealed));
  await assert.rejects(unseal(cfg,await seal(cfg,{...payload,exp:Date.now()-1})));
});

test('CSRF requires exact origin for POST and same-origin metadata for consuming GET', () => {
  const req = (headers={}) => new Request('https://example.test/api/auth/logout',{headers});
  assert.throws(()=>sameOrigin(req(),cfg));
  assert.throws(()=>sameOrigin(req({origin:'https://evil.test'}),cfg));
  assert.throws(()=>sameOrigin(req({origin:cfg.origin,'sec-fetch-site':'same-site'}),cfg));
  assert.doesNotThrow(()=>sameOrigin(req({origin:cfg.origin}),cfg));
  assert.throws(()=>sameOrigin(req(),cfg,false));
  assert.doesNotThrow(()=>sameOrigin(req({'sec-fetch-site':'same-origin'}),cfg,false));
});

test('cookies have HttpOnly Secure SameSite Lax host scope and reject duplicates', () => {
  const response=json({}); setCookie(response,cfg,'session',randomSecret(),60);
  const value=response.headers.get('set-cookie');
  for(const flag of ['__Host-cdv-session=','HttpOnly','Secure','SameSite=Lax','Path=/','Max-Age=60']) assert.ok(value.includes(flag));
  assert.equal(value.includes('Domain='),false);
  assert.equal(readCookie(new Request(cfg.origin,{headers:{cookie:'a=1; a=2'}}),'a'),null);
  assert.equal(cookieName('device',cfg),'__Host-cdv-device');
});

test('JSON bodies bounded and strict; no form CSRF', async () => {
  await assert.rejects(body(new Request(cfg.origin,{method:'POST',body:'email=a'})),{code:'json_required'});
  await assert.rejects(body(new Request(cfg.origin,{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(2049)})),{code:'body_too_large'});
  await assert.rejects(body(new Request(cfg.origin,{method:'POST',headers:{'content-type':'application/json'},body:'[]'})),{code:'invalid_body'});
});

test('without env session is honest and login/callback unavailable without network', async () => {
  const saved=process.env.AUTH_ENABLED; process.env.AUTH_ENABLED='false';
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error('Network must not be called');};
  try {
    const result=await session(new Request(cfg.origin));
    assert.equal(result.status,503);
    assert.deepEqual(await result.json(),{configured:false,authenticated:false,authorized:false,role:null,permissions:[],reason:'auth_not_configured'});
    assert.equal((await start(new Request(cfg.origin,{method:'POST'}))).status,503);
    assert.equal((await confirm(new Request(cfg.origin))).status,503);
  } finally { globalThis.fetch=previousFetch; if(saved===undefined)delete process.env.AUTH_ENABLED; else process.env.AUTH_ENABLED=saved; }
});
