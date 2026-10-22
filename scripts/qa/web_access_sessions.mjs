// Real isolated QA cookies, GET-only external Edge. Never log/persist cookies or identity text.
import puppeteer from '../../presentation/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import {readFile,writeFile} from 'node:fs/promises';
const base=process.argv[2]||'http://127.0.0.1:3001';
const fixtures=JSON.parse(await readFile(new URL('../../web/.sites-runtime/authz-http-fixtures.json',import.meta.url),'utf8'));
const browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const report={at:new Date().toISOString(),base,checks:[],errors:[]};
const check=(name,passed)=>report.checks.push({name,passed:!!passed});
try{
 for(const identity of ['analyst','noRole','anonymous']){
  const context=await browser.createBrowserContext();
  if(identity!=='anonymous'){
   const raw=fixtures[identity].cookie,split=raw.indexOf('=');
   await context.setCookie({name:raw.slice(0,split),value:raw.slice(split+1),url:base,httpOnly:true,sameSite:'Lax'});
  }
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  for(const width of [1440,390]){
   await page.setViewport({width,height:900,isMobile:width===390,hasTouch:width===390});
   for(const tier of ['copper','silver','gold']){
    await page.goto(`${base}/?tier=${tier}`,{waitUntil:'networkidle0'});
    if(identity==='analyst'&&width===390)await page.click('[aria-label="Abrir menu"]');
    const state=await page.evaluate(()=>({path:location.pathname,hasData:document.body.innerText.includes('215.915,00'),hasAudit:document.body.innerText.includes('71 PASS')&&document.body.innerText.includes('6 WARN'),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,hasTier:document.body.innerText.includes('Copper')&&document.body.innerText.includes('Silver')&&document.body.innerText.includes('Gold')}));
    check(`${identity} ${width} ${tier} server permission`,identity==='analyst'?state.path==='/'&&(tier==='gold'?state.hasAudit:state.hasData):!state.hasData&&!state.hasAudit&&state.path===(identity==='noRole'?'/acesso-negado':'/login'));
    check(`${identity} ${width} ${tier} no overflow`,!state.overflow);
    if(identity==='analyst')check(`${width} ${tier} tier controls present`,state.hasTier);
   }
  }
  const statuses=await page.evaluate(async()=>{
   const result={};
   for(const path of ['/api/analytics','/api/export?kind=transactions','/api/export?kind=clients','/api/export?kind=portfolios'])result[path]=(await fetch(path,{cache:'no-store'})).status;
   return result;
  });
  for(const [path,status] of Object.entries(statuses))check(`${identity} browser GET ${path}`,status===(identity==='analyst'?200:identity==='noRole'?403:401));
  await context.close();
 }
}catch(e){report.errors.push(e.message)}finally{
 await browser.close();
 await writeFile(new URL('../../docs/qa/web_access_sessions.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({checks:report.checks.length,failed:report.checks.filter(x=>!x.passed),errors:report.errors},null,2));
 if(report.errors.length||report.checks.some(x=>!x.passed))process.exitCode=1;
}
