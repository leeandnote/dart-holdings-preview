import fs from 'node:fs';
import {server} from './preview_renewal.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const outputDir=process.env.RENEWAL_ARTIFACTS||'artifacts/renewal-phase1';
fs.mkdirSync(outputDir,{recursive:true});
const results=[];
try {
 for(const width of [1440,1280,375]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());
  for(const [label,url] of [['home','/'],['article','/blog/issues/rights-offering-disclosure-guide/'],['daily','/blog/5percent/2026-11-19/'],['long','/blog/5percent/2026-08-25/'],['data','/5percent'],['blog','/blog/']]) {
   for(const mode of ['before','after']) {
    await page.goto(`http://127.0.0.1:${process.env.PORT||4178}${url}${mode==='before'?'?before=1':''}`);
    await page.screenshot({path:`${outputDir}/${label}-${width}-${mode}.png`,fullPage:true});
    if(mode==='after') {
     const check=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,logo:document.querySelector('.rn-logo img').naturalWidth>0,header:document.querySelectorAll('#rn-header').length}));
     results.push({label,width,...check});
     if(check.overflow||!check.logo||check.header!==1)throw new Error(JSON.stringify(results.at(-1)));
    }
   }
  }
  await page.locator('.rn-header-tools [data-rn=search]').click();
  if(!await page.locator('#rn-search').evaluate(e=>e.open))throw new Error('Search did not open');
  await page.keyboard.press('Escape');
  if(await page.locator('#rn-search').evaluate(e=>e.open))throw new Error('Escape failed');
  await page.locator('[data-rn=dismiss-banner]').click();
  await page.reload();
  if(await page.locator('#rn-announcement').isVisible())throw new Error('Banner dismissal not persisted');
  if(width===375){
   await page.locator('[data-rn=social]').click();
   if(!await page.locator('#rn-social').evaluate(e=>e.open))throw new Error('Social sheet failed');
   await page.keyboard.press('Escape');
  }
  await page.close();
 }
 fs.writeFileSync(`${outputDir}/results.json`,JSON.stringify(results,null,2));
 console.log(JSON.stringify(results));
} finally {await browser.close();server.close();}
