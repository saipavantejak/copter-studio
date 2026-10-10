/** Registered local production measurements. Never trains or sends real AI calls. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const stage=process.argv[2];if(!['before','after'].includes(stage))throw Error('Use before|after');
const dir=resolve(process.env.COPTER_BROWSER_TOOLS??'/tmp/copter-browser-tools');
const require=createRequire(dir+'/runner.cjs');
const load=async name=>import(pathToFileURL(require.resolve(name)).href);
const chromium=(await load('@sparticuz/chromium')).default;
const lighthouse=(await load('lighthouse')).default;
const chromeLauncher=await load('chrome-launcher');
const playwright=await load('playwright-core');
const desktop=(await import(pathToFileURL(dir+'/node_modules/lighthouse/core/config/desktop-config.js').href)).default;
const url='http://127.0.0.1:4173',destination='reports/product/'+stage;
mkdirSync(destination,{recursive:true});
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(execFileSync('git',['diff','HEAD','--','src','vite.config.ts','package-lock.json'],{encoding:'utf8'}).trim())throw Error('Commit product source before measuring');
const runtime={node:process.version,...Object.fromEntries(['@sparticuz/chromium','lighthouse','playwright-core'].map(name=>[name,JSON.parse(readFileSync(dir+'/node_modules/'+name+'/package.json')).version]))};
const chromePath=process.env.CHROME_PATH??await chromium.executablePath();
const records=[];
for(const profile of ['desktop','mobile'])for(let run=1;run<=3;run++){
 console.log(`${stage} Lighthouse ${profile} ${run}`,true);
 const chrome=await chromeLauncher.launch({chromePath,chromeFlags:chromium.args,logLevel:'silent'});
 try{
  const result=await lighthouse(url,{port:chrome.port,logLevel:'error',onlyCategories:['performance','accessibility'],output:'json'},profile==='desktop'?desktop:undefined);
  const filename=`${destination}/lighthouse-${profile}-${run}.json`;writeFileSync(filename,JSON.stringify(result.lhr,null,2)+'\n');
  records.push({profile,run,rawFile:filename,performance:result.lhr.categories.performance.score,accessibility:result.lhr.categories.accessibility.score,
   fcpMs:result.lhr.audits['first-contentful-paint'].numericValue,lcpMs:result.lhr.audits['largest-contentful-paint'].numericValue,tbtMs:result.lhr.audits['total-blocking-time'].numericValue});
  if(result.lhr.runtimeError)throw Error('Invalid Lighthouse run: '+JSON.stringify(result.lhr.runtimeError));
 }finally{await chrome.kill();}
}
const checks=[];
for(const [profile,viewport]of [['desktop',{width:1365,height:768}],['mobile',{width:390,height:844}],['no-webgl',{width:1365,height:768}],['ai-network-failure',{width:1365,height:768}]]){
 console.log(`${stage} browser boundary ${profile}`);
 const browser=await playwright.chromium.launch({executablePath:chromePath,headless:true,args:chromium.args});
 try{
  const context=await browser.newContext({viewport}),page=await context.newPage(),consoleErrors=[],uncaught=[];
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});page.on('pageerror',e=>uncaught.push(e.message));
  if(profile==='no-webgl')await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:original.call(this,type,...args);};});
  if(profile==='ai-network-failure')await page.route('**/api/gemini',route=>route.abort());
  const start=performance.now();await page.goto(url,{waitUntil:'load'});
  const welcome=page.getByRole('button',{name:/INITIALISE MISSION/i});await welcome.waitFor({state:'visible'});
  const enabled=await welcome.isEnabled(),interactiveMs=performance.now()-start;
  const navigation=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];return {domContentLoadedMs:n.domContentLoadedEventEnd,loadEventMs:n.loadEventEnd};});
  await welcome.click();await welcome.waitFor({state:'detached'});
  await page.getByRole('button',{name:'Benchmark',exact:true}).waitFor({state:'visible'});
  const state=await page.evaluate(()=>({viewportWidth:innerWidth,documentWidth:document.documentElement.scrollWidth,
   hasCanvas:!!document.querySelector('canvas'),text:document.body.innerText,
   startControls:Array.from(document.querySelectorAll('button')).filter(b=>b.textContent.includes('Start Simulation')).map(b=>({text:b.textContent,disabled:b.disabled})),
   fallbackVisible:!!document.querySelector('[data-webgl-unavailable]')}));
  const screenshot=`${destination}/${profile}.png`;await page.screenshot({path:screenshot,fullPage:true});
  checks.push({profile,viewport,welcomeEnabled:enabled,interactiveMs,navigation,state,consoleErrors,uncaught,screenshot});
 }finally{await browser.close();}
}
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const summaries=['desktop','mobile'].map(profile=>({profile,runs:3,...Object.fromEntries(['performance','accessibility','fcpMs','lcpMs','tbtMs'].map(k=>[k,median(records.filter(r=>r.profile===profile).map(r=>r[k]))]))}));
writeFileSync(`${destination}/summary.json`,JSON.stringify({stage,sourceCommit:commit,protocolSha256:hash('reports/product/measurement-protocol.md'),runtime,chromeArgs:chromium.args,url,sourceHashes:{'package-lock.json':hash('package-lock.json'),'vite.config.ts':hash('vite.config.ts')},records,summaries,checks,scope:'Repeated local headless production observations, not real-user telemetry or bit-for-bit timing experiments.'},null,2)+'\n');
console.log(JSON.stringify(summaries,null,2));
