// Hosted negative checks through external Edge's actual browser network stack.
import puppeteer from '../../presentation/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import {writeFile} from 'node:fs/promises';
const base=process.argv[2],label=process.argv[3]||'final';
if(!base||!/^https:\/\//.test(base)||!/^[a-z0-9_-]+$/i.test(label))throw Error('HTTPS URL and simple label required');
const browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage(),report={at:new Date().toISOString(),base,checks:[],responses:[],errors:[]};
const check=(name,passed)=>report.checks.push({name,passed:!!passed});
try{
 await page.goto(base+'/login',{waitUntil:'networkidle0'});
 check('Public entry reaches app without platform login',new URL(page.url()).origin===new URL(base).origin&&await page.evaluate(()=>document.body.innerText.includes('Autenticação indisponível')));
 check('Disabled auth has no sending form',await page.evaluate(()=>document.querySelectorAll('form').length===0));
 const paths=['/api/analytics','/api/analytics?client=C1','/api/export?kind=transactions','/api/export?kind=clients','/api/export?kind=portfolios'];
 for(const path of paths){
  const row=await probe(path);check('Configured-off API 503 '+path,row.status===503&&row.error==='auth_not_configured');check('API no-store '+path,row.cache?.includes('no-store'));check('API no dataset '+path,!row.markers.length);
 }
 for(const tier of ['copper','silver','gold'])for(const variant of ['html','rsc-header','rsc-path','prefetch']){
  const path=(variant==='rsc-path'?'/.rsc':'/')+'?tier='+tier;
  const row=await probe(path,variant==='rsc-header'?{RSC:'1'}:variant==='prefetch'?{RSC:'1','Next-Router-Prefetch':'1'}:{});
  check(`SSR/RSC ${tier} ${variant} no data`,!row.markers.length&&row.status===200);check(`SSR/RSC ${tier} ${variant} no-store`,row.cache?.includes('no-store'));
 }
 for(const path of ['/data/analytics.json','/analytics.json','/web/data/analytics.json']){
  const row=await probe(path);check('Direct snapshot denied '+path,row.status!==200&&!row.markers.length);
 }
 const assets=await page.evaluate(()=>[...new Set(performance.getEntriesByType('resource').map(x=>x.name).filter(x=>new URL(x).origin===location.origin&&/\.(?:js|mjs)(?:\?|$)/.test(x)))]);
 for(const url of assets){const row=await probe(new URL(url).pathname);check('Public chunk no data '+row.path,row.status===200&&!row.markers.length)}
 report.assetCount=assets.length;
}catch(e){report.errors.push(e.message)}finally{
 await browser.close();await writeFile(new URL(`../../docs/qa/web_access_hosted_${label}.json`,import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({checks:report.checks.length,failed:report.checks.filter(x=>!x.passed),assets:report.assetCount,errors:report.errors},null,2));
 if(report.errors.length||report.checks.some(x=>!x.passed))process.exitCode=1;
}
async function probe(path,headers={}){
 const row=await page.evaluate(async({path,headers})=>{
  const r=await fetch(path,{headers,cache:'no-store'}),body=await r.text();let error=null;try{error=JSON.parse(body).error}catch{}
  return {path,status:r.status,type:r.headers.get('content-type'),cache:r.headers.get('cache-control'),bytes:body.length,error,markers:['Ana Souza','Bruno Lima','T001','215915'].filter(x=>body.includes(x))};
 },{path,headers});report.responses.push(row);return row;
}
