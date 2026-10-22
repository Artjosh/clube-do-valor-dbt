import test from 'node:test';
import assert from 'node:assert/strict';
import { provider } from '../lib/auth/provider.ts';

test('provider uses Worker-compatible manual redirect and rejects every redirect without forwarding credentials',async()=>{
  const nativeFetch=globalThis.fetch;
  const cfg={supabaseUrl:'https://provider.example.test',serviceKey:'test-service',publicKey:'test-public'};
  try {
    for(const status of [301,302,303,307,308]) {
      let calls=0;
      globalThis.fetch=async(url,init)=>{
        calls++;
        assert.equal(url,'https://provider.example.test/rest/v1/rpc/cdv_authz');
        assert.equal(init.redirect,'manual');
        assert.equal(init.headers.Authorization,'Bearer test-service');
        return new Response('sensitive provider detail',{status,headers:{Location:'https://untrusted.example.test/collect'}});
      };
      await assert.rejects(provider(cfg,'/rest/v1/rpc/cdv_authz',{},true),error=>error.status===503 && error.message==='auth_unavailable');
      assert.equal(calls,1);
    }
  } finally {globalThis.fetch=nativeFetch;}
});

test('manual mode preserves successful provider response',async()=>{
  const nativeFetch=globalThis.fetch;
  try {
    globalThis.fetch=async()=>new Response(JSON.stringify({status:'anonymous'}));
    assert.deepEqual(await provider({supabaseUrl:'https://provider.example.test',publicKey:'test-public'},'/rest/v1/rpc/cdv_authz',{}),{status:'anonymous'});
  } finally {globalThis.fetch=nativeFetch;}
});
