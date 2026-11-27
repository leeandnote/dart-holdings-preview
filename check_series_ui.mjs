import fs from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const base=process.env.SERIES_PREVIEW_URL||'http://127.0.0.1:4187',out='artifacts/series-qa';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),results=[];
try{
 for(const width of [1280,375]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const [name,url] of [['home','/'],['series','/series/'],['disclosure','/series/disclosure/'],['blog','/blog/']]){
   await page.goto(base+url);await page.evaluate(()=>document.fonts.ready);
   await page.locator('img').evaluateAll(images=>{for(const image of images)image.loading='eager';});
   await page.waitForFunction(()=>[...document.images].every(i=>i.complete));
   assert.equal(await page.locator('img').evaluateAll(images=>images.filter(i=>i.naturalWidth===0).length),0,`${name} broken image`);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} horizontal overflow ${width}`);
   await page.screenshot({path:`${out}/${name}-${width}.png`,fullPage:true});
   if(name==='home'){
    const tabs=page.getByRole('tab');assert.equal(await tabs.count(),2);
    assert.deepEqual(await tabs.allTextContents(),['공시 해부','큰손 노트']);
    await tabs.nth(1).click();assert.equal(await tabs.nth(1).getAttribute('aria-selected'),'true');assert.equal(await page.locator('[role="tabpanel"]:not([hidden]) .rn-note-card').count(),3);
    await page.locator('.rn-series-browser').screenshot({path:`${out}/investor-tab-${width}.png`});
    await tabs.nth(1).press('ArrowLeft');assert.equal(await tabs.nth(0).getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('.rn-series-tile').count(),2);
   }
   if(name==='disclosure'){
    await page.getByRole('button',{name:'1편부터'}).click();const nums=await page.locator('[data-sortable-notes]>article').evaluateAll(ns=>ns.map(n=>Number(n.dataset.seriesNo)));assert.deepEqual(nums,[...nums].sort((a,b)=>a-b));
    await page.getByRole('button',{name:'최신순'}).click();assert.equal(await page.getByRole('button',{name:'최신순'}).getAttribute('aria-pressed'),'true');
   }
   results.push({name,width,passed:true});
  }
  for(const url of ['/blog/issues/lockup-disclosure/','/stock-terms/lockup-disclosure/'])assert.equal((await page.request.get(base+url)).status(),404,`Draft exposed ${url}`);
  assert.deepEqual(errors,[]);await page.close();
 }
 const nojs=await browser.newPage({javaScriptEnabled:false});await nojs.goto(base+'/');assert.ok(await nojs.locator('[role="tabpanel"]:not([hidden]) .rn-note-card').count());await nojs.close();
 fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
process.exit(0);
