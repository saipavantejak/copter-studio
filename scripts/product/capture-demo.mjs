/** Capture actual interaction; never substitutes synthetic footage. */
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const server=spawn(process.execPath,['--import','tsx','scripts/product/serve-preview.ts'],{stdio:'inherit'});
let browser;
try {
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:4173')).ok)break;}catch{}if(i===49)throw Error('Preview unavailable');await new Promise(r=>setTimeout(r,100));}
 await mkdir('reports/product',{recursive:true});
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:'reports/product/raw-demo',size:{width:1280,height:720}}});
 const page=await context.newPage();page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:4173');
 await page.waitForTimeout(5000);
 await page.getByRole('button',{name:/INITIALISE MISSION/i}).click();
 await page.waitForTimeout(5000);
 const start=page.getByRole('button',{name:'Start Simulation',exact:true});
 if(await start.isEnabled())await start.click();
 await page.waitForTimeout(30000);
 await page.getByRole('button',{name:'Benchmark',exact:true}).click();
 await page.waitForTimeout(20000);
 await page.getByRole('button',{name:'Simulation',exact:true}).click();
 await page.waitForTimeout(20000);
 const video=page.video();await context.close();await video.saveAs('reports/product/demo.webm');
 console.log('Actual demo saved; inspect before publishing.');
}finally{await browser?.close();server.kill();}
