// Functional browser checks only. Isolated API interception never sends email or grants real access.
import puppeteer from '../../presentation/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import fs from 'node:fs/promises';
const origin=process.env.FRONTEND_QA_ORIGIN||'http://127.0.0.1:3000';
const out=new URL('./',import.meta.url);
const checks=[],errors=[];
function check(name,value){checks.push({name,pass:!!value});if(!value)throw new Error(name)}
const browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-gpu']});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function setup(options={}){
 const page=await browser.newPage();await page.setViewport({width:options.mobile?390:1440,height:options.mobile?844:1000});
 page.on('pageerror',e=>errors.push(e.message));
 const state={calls:[],approved:false,polls:0,destination:''};
 await page.setRequestInterception(true);
 page.on('request',async req=>{
  const url=new URL(req.url());
  if(url.origin!==origin)return req.continue();
  const path=url.pathname;
  if(req.isNavigationRequest()&&(path==='/'||path==='/acesso-negado')){state.destination=path;return req.respond({status:200,contentType:'text/html',body:'<main>Navigation destination recorded by isolated test.</main>'})}
  if(!path.startsWith('/api/auth/'))return req.continue();
  state.calls.push({path,body:req.postData()?JSON.parse(req.postData()):null});
  let result={},status=200;
  if(path==='/api/auth/session')result={configured:options.configured!==false,authenticated:state.approved,authorized:state.approved&&!!options.authorized,role:state.approved&&options.authorized?'analyst':null,permissions:state.approved&&options.authorized?['analytics:read']:[]};
  else if(path==='/api/auth/invite/claim'){result=options.rejectInvite?{error:'invalid_invite'}:{accepted:true,expiresAt:new Date(Date.now()+600000).toISOString()};if(options.rejectInvite)status=403}
  else if(path==='/api/auth/device/start')result={challengeId:'test-challenge',displayCode:'12345678',expiresAt:new Date(Date.now()+(options.expiry||300000)).toISOString(),pollInterval:3,otpLength:options.otpLength||6};
  else if(path==='/api/auth/device/verify'){state.approved=true;result={authenticated:true,authorized:!!options.authorized,role:options.authorized?'analyst':null,permissions:options.authorized?['analytics:read']:[]}}
  else if(path==='/api/auth/device/poll'){state.polls++;if(options.pollApprove&&state.polls>=2)state.approved=true;result={status:state.approved?'approved':'pending'}}
  else if(path==='/api/auth/device/confirmation')result={challengeId:'test-challenge',displayCode:null,email:'a***@example.com',expiresAt:new Date(Date.now()+300000).toISOString()};
  else if(path==='/api/auth/device/approve')result={approved:true};
  else if(path==='/api/auth/logout')result={ok:true};
  else {status=400;result={error:'unexpected_test_request'}}
  await req.respond({status,contentType:'application/json',body:JSON.stringify(result)});
 });
 return {page,state};
}
async function login(page){await page.goto(origin+'/login',{waitUntil:'networkidle0'});await page.waitForSelector('#auth-email:not([disabled])')}
async function start(page){await page.type('#auth-email','avaliador@example.com');await page.click('form button[type="submit"],form .primary-button');await page.waitForSelector('#email-otp')}
try{
 // Real SSR response, no request interception.
 const html=await (await fetch(origin+'/')).text();
 check('SSR anonymous/config-disabled response contains no analytics rows or snapshot fields',!html.includes('net_financial_amount')&&!html.includes('215.915')&&!html.includes('T021')&&!html.includes('initialData'));
 const loginHtml=await(await fetch(origin+'/login')).text();
 check('Login SSR contains no snapshot values',!loginHtml.includes('net_financial_amount')&&!loginHtml.includes('T021'));
 {
  const {page,state}=await setup();await login(page);
  check('Login has no create-account button or personal password field',await page.evaluate(()=>!Array.from(document.querySelectorAll('button,a')).some(e=>/criar conta/i.test(e.textContent))&&!document.querySelector('input[type=password]')));
  await page.screenshot({path:new URL('private-login-desktop.png',out).pathname.slice(1),fullPage:true});
  await start(page);check('OTP length follows six-digit server response',await page.$eval('#email-otp',el=>el.maxLength===6));
  await page.type('#email-otp','123456');await page.click('.auth-form .primary-button');await page.waitForFunction(()=>document.body.textContent.includes('Navigation destination'));
  check('Normal first login routes to access-denied',state.destination==='/acesso-negado');
  check('Normal start does not claim invite',state.calls.find(c=>c.path.endsWith('/start')).body.useInvite===false&&!state.calls.some(c=>c.path.endsWith('/claim')));
  check('OTP verification sends challenge and code only',JSON.stringify(state.calls.find(c=>c.path.endsWith('/verify')).body)===JSON.stringify({challengeId:'test-challenge',code:'123456'}));await page.close();
 }
 {
  const {page,state}=await setup({authorized:true,otpLength:8,mobile:true});await page.goto(origin+'/login?mode=invite',{waitUntil:'networkidle0'});await page.waitForSelector('#invite-code:not([disabled])');
  check('Invite asks no email before claim',!(await page.$('#auth-email')));
  await page.type('#invite-code','a'.repeat(64));await page.click('.auth-form .primary-button');await page.waitForSelector('#auth-email');
  check('Email appears only after accepted invite',state.calls.some(c=>c.path.endsWith('/claim')));
  await start(page);check('OTP length follows eight-digit server response',await page.$eval('#email-otp',e=>e.maxLength===8));
  await page.click('.phone-alternative summary');
  check('PC comparison code distinguished from email OTP',await page.$eval('.device-code',e=>e.textContent==='12345678'));
  check('Mobile challenge has no document overflow',await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
  await page.screenshot({path:new URL('private-otp-mobile.png',out).pathname.slice(1),fullPage:true});
  await page.type('#email-otp','12345678');await page.click('.auth-form .primary-button');await page.waitForFunction(()=>document.body.textContent.includes('Navigation destination'));
  check('Verified invite routes to dashboard',state.destination==='/');check('Invite start explicitly binds claim',state.calls.find(c=>c.path.endsWith('/start')).body.useInvite===true);await page.close();
 }
 {
  const {page,state}=await setup({rejectInvite:true});await page.goto(origin+'/login?mode=invite',{waitUntil:'networkidle0'});await page.waitForSelector('#invite-code:not([disabled])');await page.type('#invite-code','bad');await page.click('.auth-form .primary-button');await page.waitForSelector('[role=alert]');
  check('Rejected invite never exposes email or starts challenge',!(await page.$('#auth-email'))&&!state.calls.some(c=>c.path.endsWith('/start')));await page.close();
 }
 {
  const {page,state}=await setup({configured:false,mobile:true});await page.goto(origin+'/login',{waitUntil:'networkidle0'});await page.waitForSelector('.auth-unavailable');
  check('Disabled configuration offers no demo or email form',!(await page.$('#auth-email'))&&await page.evaluate(()=>!document.body.textContent.includes('Demonstração pública')&&!document.body.textContent.includes('Explorar demonstração')));
  check('Disabled configuration performs no mutation',!state.calls.some(c=>c.body));check('Mobile disabled login has no overflow',await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));await page.close();
 }
 {
  const {page,state}=await setup({pollApprove:true});await login(page);await start(page);await page.waitForFunction(()=>document.body.textContent.includes('Navigation destination'),{timeout:15000});const polls=state.polls;await pause(3400);
  check('Phone approval polling routes according to server grant',state.destination==='/acesso-negado');check('Polling stops after approval',polls===2&&state.polls===2);await page.close();
 }
 {
  const {page,state}=await setup({expiry:1500});await login(page);await start(page);await page.waitForFunction(()=>document.body.textContent.includes('Solicitação expirada'));
  check('Expiry disables OTP submission',await page.$eval('#email-otp',e=>e.disabled));await pause(3200);check('Expiry prevents polling',state.polls===0);await page.close();
 }
 {
  const {page,state}=await setup({mobile:true});await page.goto(origin+'/confirm',{waitUntil:'networkidle0'});await page.waitForSelector('#display-code');
  check('Phone confirmation does not reveal PC code',!await page.evaluate(()=>document.body.textContent.includes('12345678')));
  await page.type('#display-code','12345678');check('Phone approval requires explicit consent',await page.$eval('.auth-form .primary-button',e=>e.disabled));await page.click('input[type=checkbox]');await page.click('.auth-form .primary-button');await page.waitForFunction(()=>document.body.textContent.includes('Confirmação concluída'));
  check('Phone sends user-entered comparison code',state.calls.find(c=>c.path.endsWith('/approve')).body.displayCode==='12345678');check('Phone confirmation has no overflow',await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));await page.close();
 }
 check('No browser runtime errors',errors.length===0);
}catch(e){errors.push(e.stack);process.exitCode=1}
finally{await browser.close();await fs.writeFile(new URL('private-auth-checks.json',out),JSON.stringify({at:new Date().toISOString(),origin,checks,errors,scope:'Browser auth APIs intercepted; no actual email or real permission granted. SSR anonymous checks use actual local server.'},null,2));console.log(JSON.stringify({checks:checks.length,passed:checks.filter(c=>c.pass).length,errors}));}
