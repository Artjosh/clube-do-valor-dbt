// Isolated UI tests with synthetic empty analytics, never a production permission bypass.
import puppeteer from '../../presentation/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import fs from 'node:fs/promises';
const origin=process.env.FRONTEND_QA_ORIGIN||'http://127.0.0.1:3000';
const checks=[],errors=[];
const browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const fixture={meta:{dataset:'synthetic UI fixture',generatedAt:'2000-01-01',sourceHash:'fixture',sourceFiles:[],dateRange:{from:'2000-01-01',to:'2000-01-01'},originalTransactions:0,originalClients:0,validTransactions:0,canonicalClients:0,tests:{pass:0,warn:0,total:0},warnings:[],semantics:'test'},filters:{},options:{clients:[{client_id:'UI-TEST',client_name:'PRIVATE_UI_SENTINEL'}],assets:[],dateRange:{from:'2000-01-01',to:'2000-01-01'}},summary:{transactionCount:0,activeClients:0,registeredClients:0,assetCount:0,buyCount:0,sellCount:0,buyAmount:0,sellAmount:0,netAmount:0,grossAmount:0,portfolioCount:0,negativePositions:0},transactions:[],clients:[],portfolios:[],daily:[],assets:[],quality:{negativePositions:[],rejectedTransactions:[],duplicatePayloadIds:[],testResults:[]}};
function check(name,value){checks.push({name,pass:!!value});if(!value)throw new Error(name)}
async function mount(component='Dashboard'){
 const page=await browser.newPage();const state={status:200,exportStatus:200,destination:'',logout:false};
 page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:390,height:844});await page.setRequestInterception(true);
 page.on('request',async req=>{const url=new URL(req.url());if(url.origin!==origin)return req.continue();
  if(state.mounted&&req.isNavigationRequest()){state.destination=url.pathname+url.search;return req.abort('aborted')}
  if(url.pathname==='/api/analytics')return req.respond({status:state.status,contentType:'application/json',body:JSON.stringify(state.status===200?fixture:{error:'access_denied'})});
  if(url.pathname==='/api/export')return req.respond({status:state.exportStatus,contentType:'application/json',body:JSON.stringify({error:'access_denied'})});
  if(url.pathname==='/api/auth/session')return req.respond({status:200,contentType:'application/json',body:JSON.stringify({configured:false,authenticated:false,authorized:false})});
  if(url.pathname==='/api/auth/logout'){state.logout=true;await pause(400);return req.respond({status:200,contentType:'application/json',body:'{"ok":true}'})}
  return req.continue();
 });
 await page.goto(origin+'/login',{waitUntil:'networkidle0'});
 await page.evaluate(async({fixture,component})=>{
  const source=await(await fetch('/components/dashboard.tsx')).text();
  const reactPath=source.match(/from "([^"]*\/react\.js[^\"]*)"/)[1];
  const React=(await import(reactPath)).default;
  const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const module=await import(component==='Dashboard'?'/components/dashboard.tsx':'/components/access-denied.tsx');
  document.body.innerHTML='<div id="isolated-ui-root"></div>';
  createRoot(document.getElementById('isolated-ui-root')).render(React.createElement(module[component],component==='Dashboard'?{initialData:fixture}:{}));
 },{fixture,component});
 await page.waitForSelector(component==='Dashboard'?'.filter-submit':'.denied-actions');state.mounted=true;return {page,state};
}
try{
 for(const status of [401,403,503]){
  const {page,state}=await mount();await page.waitForFunction(()=>document.body.textContent.includes('PRIVATE_UI_SENTINEL'));
  state.status=status;await page.click('.filter-submit'); // unchanged filters do not fetch, so modify a search first
  await page.type('input[name=q]','UI-TEST');await page.click('.filter-submit');
  await page.waitForFunction(()=>document.body.textContent.includes('Encerrando acesso'));
  check(`${status} removes all rendered analytics`,!await page.evaluate(()=>document.body.textContent.includes('PRIVATE_UI_SENTINEL')||!!document.querySelector('.metric')));
  check(`${status} redirects fail-closed`,state.destination===(status===401?'/login':status===403?'/acesso-negado':'/login?error=auth_unavailable'));await page.close();
 }
 {
  const {page,state}=await mount();await page.click('.account-button');await page.waitForFunction(()=>document.body.textContent.includes('Encerrando acesso'));
  check('Logout removes analytics while request is pending',state.logout&&!await page.evaluate(()=>document.body.textContent.includes('PRIVATE_UI_SENTINEL')||!!document.querySelector('.metric')));
  await pause(600);check('Logout navigates to login',state.destination==='/login');await page.close();
 }
 {
  const {page,state}=await mount();state.exportStatus=403;await page.click('.page-heading button');await page.waitForFunction(()=>document.body.textContent.includes('Encerrando acesso'));
  check('Export 403 removes data and routes to access denied',state.destination==='/acesso-negado'&&!await page.evaluate(()=>!!document.querySelector('.metric')));await page.close();
 }
 {
  const {page,state}=await mount('AccessDenied');check('Denied screen has no metrics',!await page.$('.metric'));
  check('Denied screen links to invitation',await page.$eval('.denied-actions a',e=>e.getAttribute('href')==='/login?mode=invite'));
  check('Denied mobile has no overflow',await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
  await page.screenshot({path:'web/components/private-denied-mobile.png',fullPage:true});await page.click('.denied-actions button');await pause(600);check('Denied screen logout works',state.logout&&state.destination==='/login');await page.close();
 }
 check('No dashboard UI runtime errors',errors.length===0);
}catch(e){errors.push(e.stack);process.exitCode=1}
finally{await browser.close();await fs.writeFile('web/components/private-dashboard-checks.json',JSON.stringify({at:new Date().toISOString(),checks,errors,scope:'Isolated real components mounted with synthetic empty fixture; navigation aborted to inspect cleared DOM; auth and analytics intercepted.'},null,2));console.log(JSON.stringify({checks:checks.length,passed:checks.filter(c=>c.pass).length,errors}));}
