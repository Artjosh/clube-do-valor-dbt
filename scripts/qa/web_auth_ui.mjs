// Synthetic UI state tests. Every /api/auth request is intercepted; no provider/email traffic.
import puppeteer from '../../presentation/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const base=process.argv[2]||'http://127.0.0.1:3000';
const browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const evidence={scope:'Synthetic UI only; all auth requests intercepted, no real provider/email/session',checks:[],errors:[]};
async function scenario(mode){
 const page=await browser.newPage();await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
 const calls=[];let startedAt=0;
 await page.setRequestInterception(true);
 page.on('request',async req=>{
  const url=new URL(req.url());
  if(!url.pathname.startsWith('/api/auth/'))return req.continue();
  const time=Date.now();calls.push({path:url.pathname,method:req.method(),time});
  let body={};
  if(url.pathname.endsWith('/session'))body={configured:mode!=='disabled',authenticated:false};
  else if(url.pathname.endsWith('/start')){startedAt=time;body={challengeId:'01'.repeat(32),displayCode:'12345678',expiresAt:new Date(time+(mode==='expired'?1000:60000)).toISOString(),pollInterval:3};}
  else if(url.pathname.endsWith('/poll'))body={status:'approved'};
  else if(url.pathname.endsWith('/confirmation'))body={challengeId:'01'.repeat(32),displayCode:null,email:'q***@example.invalid',expiresAt:new Date(time+60000).toISOString()};
  else if(url.pathname.endsWith('/approve'))body={approved:true};
  else return req.abort();
  await req.respond({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(base+(mode==='confirm'?'/confirm':'/login'),{waitUntil:'networkidle0'});
 if(mode==='disabled'){
  assert.ok(await page.evaluate(()=>document.body.innerText.includes('Autenticação não configurada')&&!document.querySelector('#auth-email')));
  assert.ok(!calls.some(c=>c.path.endsWith('/start')));evidence.checks.push('Disabled state has no sending form or simulated authorization');
 }else if(mode==='confirm'){
  await page.waitForSelector('#display-code');
  assert.ok(await page.$eval('.auth-form button',e=>e.disabled));
  await page.type('#display-code','12345678');assert.ok(await page.$eval('.auth-form button',e=>e.disabled));
  assert.ok(!calls.some(c=>c.path.endsWith('/approve')));evidence.checks.push('Confirmation cannot approve before explicit checkbox even with code');
  await page.click('.confirm-checkbox input');await page.click('.auth-form button');
  await page.waitForFunction(()=>document.body.innerText.includes('Confirmação concluída'));
  assert.equal(calls.filter(c=>c.path.endsWith('/approve')).length,1);evidence.checks.push('Explicit checkbox and code submit exactly one approval');
 }else{
  await page.waitForSelector('#auth-email:not(:disabled)');
  await page.type('#auth-email','qa@example.invalid');await page.click('.auth-form button[type=submit]');
  await page.waitForSelector('.device-code');assert.equal(await page.$eval('.device-code',e=>e.textContent),'12345678');
  evidence.checks.push(mode+': PC displays synthetic code from challenge');
  if(mode==='expired'){
   await page.waitForFunction(()=>document.body.innerText.includes('Código expirado'),{timeout:7000});
   assert.ok(!calls.some(c=>c.path.endsWith('/poll')));evidence.checks.push('Expired challenge stops without polling provider');
  }else{
   await page.waitForFunction(()=>document.body.innerText.includes('Este computador está autorizado'),{timeout:7000});
   const poll=calls.find(c=>c.path.endsWith('/poll'));assert.ok(poll.time-startedAt>=2900);
   await new Promise(resolve=>setTimeout(resolve,3300));
   assert.equal(calls.filter(c=>c.path.endsWith('/poll')).length,1);evidence.checks.push('Polling waits at least three seconds and stops after approval');
  }
 }
 await page.close();
}
try{for(const mode of ['disabled','approved','expired','confirm'])await scenario(mode)}catch(error){evidence.errors.push(error.stack)}finally{
 await browser.close();await writeFile(new URL('../../docs/qa/web_auth_ui_results.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence,null,2));if(evidence.errors.length)process.exitCode=1;
}
