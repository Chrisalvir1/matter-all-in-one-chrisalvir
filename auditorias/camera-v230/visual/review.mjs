import { chromium } from '/Users/chrisalvir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
const output='/Users/chrisalvir/Documents/ChatGPT/Matter all in one HA/miao-v230-camera/auditorias/camera-v230/visual';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const sizes=[[320,568],[375,667],[390,844],[430,932],[768,1024],[1024,768],[1440,900]];
const results=[];
for(const mode of ['camera','unpaired','cameraui','discovered','scrypted']) {
 for(const [width,height] of sizes) {
  const page=await browser.newPage({viewport:{width,height}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/custom/**',route=>route.fulfill({contentType:'application/json',body:route.request().url().endsWith('/cameraui/cameras')?JSON.stringify([{id:'test_camera',name:'Cámara de prueba con nombre contextual extenso '+ 'segmento'.repeat(12),status:'unknown',homeKitEnabled:false,rtspUrl:'rtsp://example.invalid/source'}]):'[]'}));
  await page.goto(`http://127.0.0.1:5179/camera-review.html?mode=${mode}`);
  await page.locator('[role=dialog]').waitFor();
  await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
  if(mode==='discovered'){ await page.getByRole('button',{name:/Cámaras Descubiertas/}).click(); await page.getByRole('button',{name:'Configurar cámara'}).waitFor(); }
  const collapsed=await page.locator('details[open]').count();
  const measure=()=>page.evaluate(()=>({documentOverflow:document.documentElement.scrollWidth>innerWidth+1, overflow:[...document.querySelectorAll('[role=dialog] *')].filter(e=>!['INPUT','TEXTAREA','SELECT'].includes(e.tagName)&&e.getBoundingClientRect().width>0&&e.scrollWidth>e.clientWidth+2&&getComputedStyle(e).overflowX!=='auto'&&getComputedStyle(e).overflowX!=='scroll').map(e=>({tag:e.tagName,cls:e.className,width:e.clientWidth,scroll:e.scrollWidth})).slice(0,15)}));
  const normal=await measure();
  await page.screenshot({path:`${output}/${mode}-${width}-normal.png`});
  let expanded;
  if(mode==='camera'||mode==='unpaired'){
   if(mode==='unpaired') await page.getByText('Exportación avanzada',{exact:true}).click();
   await page.getByText('Diagnóstico avanzado',{exact:true}).click();
   await page.getByText('Fuente detectada',{exact:true}).click();
   expanded=await measure();
   await page.getByRole('button',{name:'Cerrar',exact:true}).scrollIntoViewIfNeeded();
   await page.screenshot({path:`${output}/${mode}-${width}-advanced.png`});
  }
  results.push({mode,width,height,collapsed,normal,expanded,errors});
  await page.close();
 }
}
await fs.writeFile(`${output}/results.json`,JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(r=>({mode:r.mode,width:r.width,collapsed:r.collapsed,overflow:r.normal,expanded:r.expanded,errors:r.errors})),null,2));
await browser.close();
