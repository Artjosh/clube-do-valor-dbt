// External Edge, disposable profile. No OTP submissions or real email.
import puppeteer from '../../presentation/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import {writeFile} from 'node:fs/promises';
const base=process.argv[2]||'http://127.0.0.1:3000';
const label=process.argv[3]||'disabled';
if(!/^[a-z0-9_-]+$/i.test(label))throw Error('Invalid label');
const browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const result={at:new Date().toISOString(),base,browser:await browser.version(),checks:[],pages:[],errors:[]};
const page=await browser.newPage();
page.on('pageerror',e=>result.errors.push(e.message));
try{
 for(const width of [1440,390]){
  await page.setViewport({width,height:900,isMobile:width===390,hasTouch:width===390});
  for(const path of process.argv.includes('--login-only')?['/login','/login?mode=invite']:['/?tier=copper','/?tier=silver','/?tier=gold','/login','/login?mode=invite','/acesso-negado']){
   await page.goto(base+path,{waitUntil:'networkidle0',timeout:45000});
   const state=await page.evaluate(()=>({path:location.pathname+location.search,text:document.body.innerText,width:innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,inputs:[...document.querySelectorAll('input')].map(e=>({id:e.id,type:e.type,disabled:e.disabled})),buttons:[...document.querySelectorAll('button,a')].map(e=>e.textContent)}));
   result.pages.push({viewport:width,...state});
   result.checks.push({name:`${width} ${path} no dataset`,passed:!['Ana Souza','Bruno Lima','215.915,00','T001'].some(s=>state.text.includes(s))});
   result.checks.push({name:`${width} ${path} no overflow`,passed:state.scrollWidth<=state.clientWidth});
   result.checks.push({name:`${width} ${path} no signup action`,passed:!state.buttons.some(s=>/criar conta|cadastre|cadastrar/i.test(s))});
   if(path==='/login')result.checks.push({name:`${width} passwordless login`,passed:!state.inputs.some(i=>i.type==='password')});
   if(path==='/login?mode=invite')result.checks.push({name:`${width} invitation before email`,passed:!state.inputs.some(i=>i.type==='email')});
   if(process.argv.includes('--disabled'))result.checks.push({name:`${width} ${path} explicit unavailable with no submission`,passed:state.text.includes('Autenticação indisponível')&&state.inputs.length===0});
   if(path==='/login'||path==='/login?mode=invite')await page.screenshot({path:new URL(`../../docs/qa/web_access_${label}_${width}_${path.includes('?')?'invite':'login'}.png`,import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});
  }
 }
}catch(e){result.errors.push(e.stack||e.message)}finally{
 await browser.close();
 await writeFile(new URL(`../../docs/qa/web_access_browser_${label}.json`,import.meta.url),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({checks:result.checks.length,failed:result.checks.filter(c=>!c.passed),errors:result.errors},null,2));
 if(result.errors.length||result.checks.some(c=>!c.passed))process.exitCode=1;
}
