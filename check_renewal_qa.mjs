import fs from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser=await chromium.launch({channel:'msedge',headless:true});
const phase=process.argv[2]||'after',out='artifacts/qa-20261127';fs.mkdirSync(out,{recursive:true});const results=[];
try{
 for(const width of [1265,1440,1280,375]){
  const page=await browser.newPage({viewport:{width,height:900}});
  for(const [name,url] of [['home','/'],['blog','/blog/'],['rights','/blog/issues/rights-offering-disclosure-guide/']]){
   await page.goto(`http://127.0.0.1:4187${url}`);
   await page.evaluate(()=>document.fonts.ready);
   const metrics=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,widths:[...document.querySelectorAll('#rn-header,.rn-announcement,.rn-footer')].map(n=>n.getBoundingClientRect().width)}));
   if(phase==='after'){
    assert.ok(metrics.scroll<=width+1,`${name} overflow ${width}`);
    for(const w of metrics.widths)assert.ok(Math.abs(w-metrics.viewport)<1,`${name} chrome gap ${width}: ${w}`);
    if(name==='rights'){
     assert.equal(await page.locator('#editorial-byline').count(),0);
     assert.equal(await page.locator('.guideContents').count(),0);
     assert.equal(await page.locator('.rn-faq').count(),5);
     assert.equal(await page.locator('.rn-guide-figure').count(),3);
    }
   }
   if([1280,375].includes(width))await page.screenshot({path:`${out}/${phase}-${name}-${width}.png`,fullPage:true});
   if(name==='blog'){
    await page.evaluate(()=>scrollTo(0,600));
    const top=await page.locator('.rn-category-tabs').evaluate(n=>n.getBoundingClientRect().top);
    if(phase==='after')assert.ok(Math.abs(top)<1,`Sticky tab gap ${top}`);
    metrics.tabTop=top;
   }
   results.push({name,width,...metrics});
  }
  await page.close();
 }
 fs.writeFileSync(`${out}/${phase}-metrics.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
process.exit(0);
