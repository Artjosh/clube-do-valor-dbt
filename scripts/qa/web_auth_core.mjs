// Independent security invariants with synthetic data; no provider calls or credentials.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { config, sameOrigin, readCookie, setCookie, seal, unseal, body, failure, AuthError } from '../../web/lib/auth/core.ts';

const checks = [];
function check(name, action) { action(); checks.push(name); }
const env = {AUTH_ENABLED:'true',AUTH_ORIGIN:'https://example.test',SUPABASE_URL:'https://identity.example.test',SUPABASE_ANON_KEY:'synthetic-public',SUPABASE_SERVICE_ROLE_KEY:'synthetic-private',AUTH_COOKIE_KEY:'ab'.repeat(32),NODE_ENV:'production'};
const cfg = config(env);
check('complete synthetic config accepted',()=>assert.ok(cfg));
for (const name of ['AUTH_ORIGIN','SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','AUTH_COOKIE_KEY']) {
  check(`missing ${name} fails closed`,()=>assert.equal(config({...env,[name]:undefined}),null));
}
check('disabled auth fails closed',()=>assert.equal(config({...env,AUTH_ENABLED:'false'}),null));
check('HTTP production rejected',()=>assert.equal(config({...env,AUTH_ORIGIN:'http://localhost'}),null));
check('origin path rejected',()=>assert.equal(config({...env,AUTH_ORIGIN:'https://example.test/path'}),null));
check('provider credentials in URL rejected',()=>assert.equal(config({...env,SUPABASE_URL:'https://user:pass@identity.example.test'}),null));
check('malformed seal key rejected',()=>assert.equal(config({...env,AUTH_COOKIE_KEY:'short'}),null));
const req = headers => new Request('https://example.test/api/auth/device/approve',{method:'POST',headers});
check('same-origin mutation accepted',()=>sameOrigin(req({Origin:cfg.origin,'Sec-Fetch-Site':'same-origin'}),cfg));
for (const headers of [{},{Origin:'https://attacker.invalid'},{Origin:cfg.origin,'Sec-Fetch-Site':'cross-site'}]) {
  check('CSRF mutation rejected '+JSON.stringify(headers),()=>assert.throws(()=>sameOrigin(req(headers),cfg), e=>e.status===403));
}
check('poll requires same-origin metadata',()=>assert.throws(()=>sameOrigin(new Request('https://example.test/api/auth/device/poll'),cfg,false),e=>e.status===403));
check('duplicate cookies rejected',()=>assert.equal(readCookie(new Request(cfg.origin,{headers:{Cookie:'x=one; x=two'}}),'x'),null));
const response=new Response();setCookie(response,cfg,'session','synthetic',60);
check('secure HttpOnly host cookie',()=>assert.match(response.headers.get('Set-Cookie'),/__Host-cdv-session=synthetic; Path=\/; HttpOnly; SameSite=Lax; Max-Age=60; Secure/));
const pending={challengeId:'01'.repeat(32),tokenHash:'synthetic-token-not-real-'.repeat(2),exp:Date.now()+60000};
const sealed=await seal(cfg,pending);
assert.deepEqual(await unseal(cfg,sealed),pending);checks.push('sealed pending state roundtrip');
await assert.rejects(()=>unseal(cfg,sealed.slice(0,-2)+'zz'),e=>e.status===401);checks.push('tampered confirmation rejected');
await assert.rejects(()=>unseal({...cfg,origin:'https://another.example.test'},sealed),e=>e.status===401);checks.push('cross-origin sealed state rejected');
await assert.rejects(()=>unseal(cfg,null),e=>e.status===401);checks.push('missing confirmation rejected');
const expired=await seal(cfg,{...pending,exp:Date.now()-1000});
await assert.rejects(()=>unseal(cfg,expired),e=>e.status===401);checks.push('expired confirmation rejected');
await assert.rejects(()=>body(new Request(cfg.origin,{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(2049)})),e=>e.status===413);checks.push('oversized body rejected without declared length');
await assert.rejects(()=>body(new Request(cfg.origin,{method:'POST',headers:{'Content-Type':'application/json'},body:'[]'})),e=>e.status===400);checks.push('array body rejected');
const safe=await failure(new Error('synthetic-private')).text();
check('provider errors sanitized',()=>assert.equal(safe,'{"error":"auth_unavailable"}'));
const rate=failure(new AuthError(429,'rate_limited'));check('rate retry header',()=>assert.equal(rate.headers.get('Retry-After'),'3'));
await writeFile(new URL('../../docs/qa/web_auth_core_results.json',import.meta.url),JSON.stringify({passed:true,checks,scope:'Synthetic local core only; no real email, provider, PostgreSQL concurrency or remote replay tested'},null,2)+'\n');
console.log(`PASS ${checks.length} independent auth core checks`);
