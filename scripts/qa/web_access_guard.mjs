// Synthetic server authorization proof; every provider fetch is intercepted in this process.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {readAnalyticsAccess} from '../../web/lib/auth/guard.ts';
import {GET as analytics} from '../../web/app/api/analytics/route.ts';
import {GET as csv} from '../../web/app/api/export/route.ts';
const checks=[];let calls=0;let providerResult={status:'anonymous'};let unavailable=false;
Object.assign(process.env,{AUTH_ENABLED:'true',AUTH_ORIGIN:'https://qa.example.test',SUPABASE_URL:'https://identity.example.test',SUPABASE_ANON_KEY:'synthetic-public',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',AUTH_COOKIE_KEY:'ab'.repeat(32),AUTH_OTP_LENGTH:'8',NODE_ENV:'production'});
globalThis.fetch=async()=>{calls++;if(unavailable)throw new Error('Synthetic provider outage');return new Response(JSON.stringify(providerResult),{headers:{'Content-Type':'application/json'}})};
const cookie='__Host-cdv-session='+'01'.repeat(32);
const request=(path,c=cookie)=>new Request('https://qa.example.test'+path,{headers:c?{Cookie:c}:{}});
function checked(name,condition){assert.ok(condition,name);checks.push(name)}
checked('Anonymous guard is 401',(await readAnalyticsAccess(null)).status===401);
checked('Malformed cookie guard is 401',(await readAnalyticsAccess('__Host-cdv-session=forged')).status===401);
checked('Duplicated cookie rejected',(await readAnalyticsAccess(cookie+'; '+cookie)).status===401);
providerResult={status:'authenticated',email:'qa@example.invalid',permissions:[],user_metadata:{role:'analyst',permissions:['analytics:read']}};
checked('Identity without grant is 403 even with forged user_metadata',(await readAnalyticsAccess(cookie)).status===403);
for(const [name,handler,path] of [['analytics',analytics,'/api/analytics?operation=INVALID'],['CSV',csv,'/api/export?kind=invalid']]){
 const response=await handler(request(path));checked(name+' authorizes before parsing filters',response.status===403);
 const body=await response.text();checked(name+' denied response contains no dataset',!body.includes('Ana Souza')&&!body.includes('transaction_id'));
}
providerResult={status:'authenticated',email:'qa@example.invalid',permissions:['analytics:read']};
checked('Permission without required analyst role is denied',(await readAnalyticsAccess(cookie)).status===403);
providerResult.role='analyst';
checked('Verified explicit grant authorizes',(await readAnalyticsAccess(cookie)).status===200);
const allowed=await analytics(request('/api/analytics'));checked('Authorized API returns baseline',allowed.status===200&&(await allowed.json()).summary.transactionCount===98);
const exportResponse=await csv(request('/api/export?kind=transactions'));checked('Authorized export returns CSV',exportResponse.status===200&&(await exportResponse.text()).includes('T001'));
const callsBefore=calls;providerResult={status:'authenticated',email:'qa@example.invalid',permissions:[]};
checked('Revoked grant denies next request',(await analytics(request('/api/analytics'))).status===403&&calls>callsBefore);
for(const malformed of [{status:'authenticated',email:'qa@example.invalid'},{status:'authenticated',email:'qa@example.invalid',permissions:'analytics:read'}]){
 providerResult=malformed;checked('Malformed provider permission response fails closed',(await readAnalyticsAccess(cookie)).status===503);
}
unavailable=true;checked('Provider failure closes guard',(await readAnalyticsAccess(cookie)).status===503);
checked('Provider failure closes API',(await analytics(request('/api/analytics'))).status===503);
process.env.AUTH_ENABLED='false';
checked('Disabled auth closes guard',(await readAnalyticsAccess(cookie)).status===503);
checked('Disabled auth closes CSV',(await csv(request('/api/export?kind=clients'))).status===503);
await writeFile(new URL('../../docs/qa/web_access_guard_role_results.json',import.meta.url),JSON.stringify({scope:'Synthetic identity responses only; no network or real cookies',passed:true,checks},null,2)+'\n');
console.log(`PASS ${checks.length} synthetic server authorization checks`);
