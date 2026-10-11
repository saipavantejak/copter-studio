/** Browser regressions only, intentionally no Lighthouse or timing scores. */
import {chromium} from 'playwright-core';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
const stage=process.argv[2];if(!['before','after'].includes(stage))throw Error('Use before|after');
const server=spawn(process.execPath,['--import','tsx','scripts/product/serve-preview.ts'],{stdio:'inherit'});
let browser;
try {
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:4173')).ok)break;}catch{}if(i===49)throw Error('Preview unavailable');await new Promise(r=>setTimeout(r,100));}
 const args=process.env.CHROME_PATH?['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[];
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args});
 const records=[];
 for(const [name,viewport]of [['desktop',{width:1365,height:768}],['mobile',{width:390,height:844}],['no-webgl',{width:1365,height:768}]]){
  const context=await browser.newContext({viewport});const page=await context.newPage(),errors=[],uncaught=[];
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('pageerror',e=>uncaught.push(e.message));
  if(name==='no-webgl')await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:original.call(this,type,...args)}});
  await page.goto('http://127.0.0.1:4173');const welcome=page.getByRole('button',{name:/INITIALISE MISSION/i});await welcome.waitFor();
  const hiddenWorkspace=await page.evaluate(()=>{const w=document.querySelector('header')?.parentElement;return {inert:w?.inert??false,ariaHidden:w?.getAttribute('aria-hidden'),focusableControls:w?.querySelectorAll('button,a,input').length??0};});
  await welcome.click();await welcome.waitFor({state:'detached'});await page.getByRole('button',{name:'Benchmark',exact:true}).waitFor();
  const state=await page.evaluate(()=>({viewportWidth:innerWidth,documentWidth:document.documentElement.scrollWidth,hasCanvas:!!document.querySelector('canvas'),canvasBox:(()=>{const r=document.querySelector('canvas')?.getBoundingClientRect();return r?{width:r.width,height:r.height}:null})(),fallbackVisible:!!document.querySelector('[data-webgl-unavailable]'),startDisabled:Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Start Simulation'))?.disabled??null}));
  await page.getByRole('button',{name:'Benchmark',exact:true}).click();
  const benchmarkUsable=await page.getByRole('button',{name:'Simulation',exact:true}).isEnabled();
  records.push({name,viewport,hiddenWorkspace,state,benchmarkUsable,errors,uncaught});await context.close();
 }
 const result={sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),command:`CHROME_PATH=/tmp/chromium node scripts/product/check-browser.mjs ${stage}`,stage,driverSha256:createHash('sha256').update(readFileSync('scripts/product/check-browser.mjs')).digest('hex'),browserVersion:browser.version(),scope:'Isolated local headless regression; no login, cloud credentials, performance scores or training.',records};
 await mkdir('reports/product',{recursive:true});
 if(existsSync(`reports/product/browser-${stage}.json`)){let n=1;while(existsSync(`reports/product/browser-${stage}-retained-${n}.json`))n++;await copyFile(`reports/product/browser-${stage}.json`,`reports/product/browser-${stage}-retained-${n}.json`);}
 await writeFile(`reports/product/browser-${stage}.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(records,null,2));
 if(stage==='after'&&records.some(r=>(r.state.hasCanvas&&(!r.state.canvasBox?.width||!r.state.canvasBox?.height))||r.uncaught.length||r.errors.length||r.state.documentWidth>r.state.viewportWidth||!r.hiddenWorkspace.inert||!r.benchmarkUsable||(r.name==='no-webgl'&&(!r.state.fallbackVisible||!r.state.startDisabled))))throw Error('Product regression failed; retained observations');
}finally{await browser?.close();server.kill();}
