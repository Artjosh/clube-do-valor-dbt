// Final deployment-mode gate: read-only browser/API checks; never submit auth.
import puppeteer from '../../presentation/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const base=process.argv[2]||'http://127.0.0.1:3000';
const evidence={at:new Date().toISOString(),url:base,checks:[],headers:[],errors:[]};
function check(name,passed){evidence.checks.push({name,passed:!!passed})}
for(const path of ['/','/login','/confirm','/api/auth/session']){
 const response=await fetch(base+path);const headers=Object.fromEntries(['x-frame-options','content-security-policy','referrer-policy','x-content-type-options'].map(k=>[k,response.headers.get(k)]));
 evidence.headers.push({path,status:response.status,...headers});
 check(path+' returns 200',response.status===200);
 check(path+' anti-framing headers',headers['x-frame-options']==='DENY'&&headers['content-security-policy']?.includes("frame-ancestors 'none'"));
 check(path+' referrer suppressed',headers['referrer-policy']==='no-referrer');
 check(path+' MIME sniffing blocked',headers['x-content-type-options']==='nosniff');
 if(path==='/api/auth/session'){const body=await response.json();check('Final session configured:false authenticated:false',body.configured===false&&body.authenticated===false)}
}
const browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage();page.on('pageerror',error=>evidence.errors.push(error.message));
 for(const [width,label] of [[1440,'desktop'],[390,'mobile']]){
  await page.setViewport({width,height:900,isMobile:width<500,hasTouch:width<500});
  for(const path of ['/login','/confirm']){
   await page.goto(base+path,{waitUntil:'networkidle0'});
   const state=await page.evaluate(()=>({text:document.body.innerText,scrollWidth:document.documentElement.scrollWidth,width:document.documentElement.clientWidth,emailInput:!!document.querySelector('#auth-email'),approveButton:!!document.querySelector('#display-code')}));
   check(label+path+' no overflow',state.scrollWidth===state.width&&state.width===width);
   if(path==='/login')check(label+' real disabled UI has no sending form',state.text.includes('Autenticação não configurada')&&!state.emailInput);
   if(path==='/confirm')check(label+' no valid confirmation cannot approve',state.text.includes('Não há confirmação válida nesta aba')&&!state.approveButton);
   await page.screenshot({path:fileURLToPath(new URL(`../../docs/qa/web_${label}_${path.slice(1)}.png`,import.meta.url)),fullPage:true});
  }
 }
}finally{await browser.close()}
await writeFile(new URL('../../docs/qa/web_final_results.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({checks:evidence.checks.length,failures:evidence.checks.filter(r=>!r.passed),errors:evidence.errors},null,2));
if(evidence.errors.length||evidence.checks.some(r=>!r.passed))process.exitCode=1;
