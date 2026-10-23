// Local-only rendering with dummy OTP/link; never clicks or submits the email CTA.
const {default:puppeteer}=await import(process.env.CDV_PUPPETEER_MODULE || 'puppeteer-core');
import { readFile,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const report={at:new Date().toISOString(),checks:[],networkRequests:0,emailSent:false};
const browser=await puppeteer.launch({executablePath:process.env.CDV_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage();
await page.setRequestInterception(true);
page.on('request',r=>{report.networkRequests++;r.abort();});
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
try{
 for(const name of ['magic_link','confirmation']){
  const source=await readFile(new URL(`../supabase/templates/${name}.html`,import.meta.url),'utf8');
  check(source.includes('{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email'),`${name}: original safe callback template retained`);
  check(!/ConfirmationURL|<script|<form|<img|https?:\/\//i.test(source),`${name}: no consuming provider URL, scripts, forms or remote assets`);
  const html=source.replaceAll('{{ .Token }}','012345').replaceAll('{{ .RedirectTo }}','https://example.test/api/auth/confirm?challengeId=qa-challenge').replaceAll('{{ .TokenHash }}','qa-token-hash');
  for(const width of [320,720]){
   await page.setViewport({width,height:1100,deviceScaleFactor:1});
   await page.setContent(html,{waitUntil:'domcontentloaded'});
   const state=await page.evaluate(()=>{
    const otp=[...document.querySelectorAll('p')].find(e=>e.textContent.trim()==='012345');
    const a=document.querySelector('a');
    return {scroll:document.documentElement.scrollWidth,width:innerWidth,text:document.body.innerText,otp:otp?.innerText,otpSize:otp?parseFloat(getComputedStyle(otp).fontSize):0,href:a?.href,cta:a?.textContent.trim(),ctaHeight:a?.getBoundingClientRect().height,tables:document.querySelectorAll('table[role="presentation"]').length};
   });
   check(state.scroll<=state.width,`${name}/${width}: no horizontal overflow`);
   check(state.otp==='012345'&&state.otpSize>=32,`${name}/${width}: six-digit OTP including leading zero legible`);
   check(!state.text.includes('8 dígitos')&&state.text.includes('5 minutos')&&state.text.length<300,`${name}/${width}: minimal email includes expiry and no second code`);
   check(state.cta==='Autenticar navegador'&&state.ctaHeight>=44&&state.tables>=2,`${name}/${width}: table layout and touch-sized CTA`);
   const link=new URL(state.href);
   check(link.origin==='https://example.test'&&link.pathname==='/api/auth/confirm'&&link.searchParams.get('challengeId')==='qa-challenge'&&link.searchParams.get('token_hash')==='qa-token-hash'&&link.searchParams.get('type')==='email',`${name}/${width}: rendered callback parameters intact`);
   await page.screenshot({path:`web/tests/auth-email-${name}-${width}.png`,fullPage:true});
  }
 }
 check(report.networkRequests===0,'Render generated no network requests');
 report.result='passed';
}finally{
 await browser.close();
 await writeFile('web/tests/auth-email-render-results.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({checks:report.checks.length,result:report.result,networkRequests:report.networkRequests,emailSent:false}));
