// External Microsoft Edge, isolated synthetic profile; no integrated Orca browser.
import puppeteer from '../../presentation/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const base=process.argv[2]||'http://127.0.0.1:3000';
const browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const evidence={browser:await browser.version(),url:base,pages:[],errors:[],checks:[]};
const page=await browser.newPage();
page.on('pageerror',error=>evidence.errors.push(error.message));
async function check(name,test){const passed=await test();evidence.checks.push({name,passed});}
async function visit(path){await page.goto(base+path,{waitUntil:'networkidle0'});await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));}
async function capture(label){
 const state=await page.evaluate(()=>({url:location.pathname+location.search,title:document.title,width:innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,heading:document.querySelector('h1')?.textContent,text:document.body.innerText,links:[...document.querySelectorAll('a')].map(a=>({text:a.innerText,href:a.getAttribute('href')})),inputs:[...document.querySelectorAll('input,select')].map(e=>({tag:e.tagName,type:e.getAttribute('type'),name:e.getAttribute('name'),label:e.closest('label')?.innerText,options:e.tagName==='SELECT'?[...e.options].map(o=>({value:o.value,text:o.text})):undefined}))}));
 evidence.pages.push({label,...state});
 await page.screenshot({path:fileURLToPath(new URL(`../../docs/qa/web_${label}.png`,import.meta.url)),fullPage:true});
 evidence.checks.push({name:label+' no document horizontal overflow',passed:state.scrollWidth<=state.clientWidth&&state.clientWidth===page.viewport().width});
}
try{
 await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});
 await visit('/');await capture('desktop_copper');
 await check('Copper baseline metrics',()=>page.evaluate(()=>document.body.innerText.includes('215.915,00')&&document.querySelector('.kpi-grid')?.innerText.includes('98')));
 await visit('/?tier=silver&view=transactions');await capture('desktop_silver');
 await check('Silver 98 records',()=>page.evaluate(()=>document.querySelector('.table-pagination')?.textContent.includes('98 registros')));
 await page.click('[aria-label="Próxima página"]');
 await check('Pagination next works',()=>page.evaluate(()=>document.querySelector('.table-pagination')?.textContent.includes('9–16')));
 await page.click('th:first-child button');
 await check('Sort toggles descending',()=>page.evaluate(()=>document.querySelector('th')?.getAttribute('aria-sort')==='descending'));
 await page.click('.detail-button');await page.waitForSelector('dialog[open]');
 await check('Detail dialog opens',()=>page.evaluate(()=>!!document.querySelector('dialog[open]')));
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 await check('Escape closes detail',()=>page.evaluate(()=>!document.querySelector('dialog[open]')));
 await page.select('.filter-bar select','C5');
 const selects=await page.$$('.filter-bar select');await selects[1].select('BBDC4');
 await page.click('.filter-submit');await page.waitForFunction(()=>location.search.includes('client=C5')&&!document.querySelector('[aria-busy="true"]'));
 await check('Applied filters update URL and rows',()=>page.evaluate(()=>location.search.includes('asset=BBDC4')&&document.querySelector('.table-pagination')?.textContent.includes('2 registros')));
 await check('CSV link preserves filter and current view',()=>page.evaluate(()=>{const url=new URL(document.querySelector('.page-heading a').href);return url.searchParams.get('kind')==='transactions'&&url.searchParams.get('client')==='C5'&&url.searchParams.get('asset')==='BBDC4'}));
 await page.goBack({waitUntil:'networkidle0'});await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));
 await check('Browser back restores filters',()=>page.evaluate(()=>!location.search.includes('client=')&&document.querySelector('.table-pagination')?.textContent.includes('98 registros')));
 await visit('/?tier=silver&view=clients&client=C11');
 await check('Inactive client remains visible',()=>page.evaluate(()=>document.body.innerText.includes('Karen Ribeiro')&&document.querySelector('.table-pagination')?.textContent.includes('1 registros')));
 await visit('/?tier=silver&view=transactions&from=2025-01-01');
 await check('Empty dataset state',()=>page.evaluate(()=>document.body.innerText.includes('Nenhum registro neste recorte')));
 await visit('/?tier=gold');await capture('desktop_gold');
 await check('Gold history and global-scope disclaimer',()=>page.evaluate(()=>document.body.innerText.includes('71 PASS')&&document.body.innerText.includes('6 WARN')&&document.body.innerText.includes('Dataset completo · sem filtros')&&document.body.innerText.includes('Não é monitoramento ao vivo')));
 await check('No paid tier semantics',()=>page.evaluate(()=>document.body.innerText.includes('Sem planos ou cobranças')));
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1});
 await visit('/');await capture('mobile_copper');
 await page.click('[aria-label="Abrir menu"]');
 await check('Mobile menu opens',()=>page.evaluate(()=>document.querySelector('.sidebar')?.classList.contains('is-open')));
 await page.click('nav a[href*="tier=silver"]');
 await check('Mobile tier navigation closes drawer',()=>page.evaluate(()=>location.search.includes('tier=silver')&&!document.querySelector('.sidebar')?.classList.contains('is-open')));
 await capture('mobile_silver');
 await visit('/?tier=gold');await capture('mobile_gold');
 if(process.argv.includes('--auth'))for(const path of ['/login','/confirm']){await visit(path);await capture('mobile_'+path.slice(1));}
}catch(error){evidence.errors.push(error.stack||error.message)}finally{
 await browser.close();
 await writeFile(new URL('../../docs/qa/web_browser_results.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({checks:evidence.checks.length,failures:evidence.checks.filter(c=>!c.passed),errors:evidence.errors},null,2));
 if(evidence.errors.length||evidence.checks.some(c=>!c.passed))process.exitCode=1;
}
