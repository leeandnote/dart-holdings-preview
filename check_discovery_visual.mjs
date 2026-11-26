import fs from 'node:fs';
import assert from 'node:assert/strict';
process.env.PREVIEW_ROOT='public_dist';process.env.PORT=process.env.PORT||'4186';
const {server}=await import('./preview_renewal.mjs');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser=await chromium.launch({channel:'msedge',headless:true});
const out='artifacts/renewal-discovery';fs.mkdirSync(out,{recursive:true});
const results=[];
try{
  for(const width of [1280,375]){
    const page=await browser.newPage({viewport:{width,height:900}});
    await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    for(const [name,url] of [['home','/'],['blog','/blog/'],['search','/search/?q=삼성'],['daily','/blog/5percent/2026-11-25/']]){
      await page.goto(`http://127.0.0.1:${process.env.PORT}${url}`);await page.waitForTimeout(500);
      if(name==='search'){await page.waitForFunction(()=>!document.querySelector('#search-status').textContent.includes('불러오는 중'));assert.ok(await page.locator('#search-results li').count()>0);}
      const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(dimensions.scroll<=width+1,`${name} overflow at ${width}: ${dimensions.scroll}`);
      await page.screenshot({path:`${out}/${name}-${width}.png`,fullPage:true});
      results.push({name,width,...dimensions});
    }
    await page.close();
  }
  fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
process.exit(0);
