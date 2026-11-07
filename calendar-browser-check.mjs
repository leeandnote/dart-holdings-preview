import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {fixtures} from './calendar-pipeline.test.mjs';
import {validateCandidate} from './calendar_pipeline.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root=path.resolve('site');
const server=createServer(async(req,res)=>{
  try {
    const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!file.startsWith(root+path.sep))throw Error('outside root');
    const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
    res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
  }catch{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser=await chromium.launch({headless:true,channel:'msedge'});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/data/calendar-auto.json',route=>route.fulfill({json:{updatedAt:'2026-11-06T00:00:00Z',events:fixtures.map(({event,article})=>validateCandidate(event,article))}}));
  await page.route('**/pagead/**',route=>route.abort());
  await fs.mkdir('.qa',{recursive:true});
  for(const [width,height] of [[1365,900],[390,844]]){
    await page.setViewportSize({width,height});
    await page.goto(`http://127.0.0.1:${server.address().port}/calendar.html`);
    await page.locator('#scope').waitFor();
    await page.getByText(/뉴스 일정 갱신:/).waitFor();
    // Pin the desired test month independent of the executing machine's date.
    for(let i=0;i<60 && await page.locator('#monthLabel').textContent()!=='2026년 11월';i++){
      const label=await page.locator('#monthLabel').textContent();
      const match=label.match(/(\d+)년 (\d+)월/);const n=Number(match[1])*12+Number(match[2]);
      await page.locator(n>2026*12+11?'#previous':'#next').click();
    }
    await page.locator('#monthView').click();
    for(const {event} of fixtures){
      const cell=page.locator('.calDay').filter({has:page.locator(`time[datetime="${event.date}"]`)});
      const item=cell.getByRole('button',{name:new RegExp(event.title)});
      assert.equal(await item.count(),1);
      assert.match(await item.textContent(),/뉴스 기반/);
    }
    await page.locator('#type').selectOption('politics');
    assert.equal(await page.locator('.calEvent').count(),3);
    await page.locator('.calEvent').filter({hasText:'예시위원회'}).click();
    assert.match(await page.locator('#detailMeta').textContent(),/추출 근거/);
    await page.locator('#closeDialog').click();
    await page.locator('#listView').click();
    assert.equal(await page.locator('#agenda .agendaRow').count(),3);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.screenshot({path:`.qa/calendar-news-${width}.png`,fullPage:true});
  }
  assert.deepEqual(errors,[]);console.log('Desktop/mobile calendar dates, badges, filters and dialogs passed');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
