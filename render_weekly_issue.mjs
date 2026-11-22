import {readFile,mkdir} from 'node:fs/promises';
import {loadWeeklyIssue} from './weekly_issue.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const issue=await loadWeeklyIssue(process.argv[2]);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const flags={};for(const c of ['us','jp','kr','cn'])flags[c]=`data:image/png;base64,${(await readFile(`site/assets/flags/${c}.png`)).toString('base64')}`;
const rows=Array.from({length:7},(_,i)=>{
  const date=new Date(Date.parse(issue.week)+i*86400000).toISOString().slice(0,10);
  const events=issue.events.filter(e=>e.date===date);
  return `<section><div class="date"><b>${date.slice(5).replace('-','.')}</b><span>${['월','화','수','목','금','토','일'][i]}요일</span></div><div class="events">${events.length?events.map(e=>`<article><img src="${flags[e.country]}" alt="${e.country}"><div><h2>${esc(e.title)}</h2><p>${esc(e.detail)}</p></div></article>`).join(''):'<p class="empty">선별 일정 없음</p>'}</div></section>`;
}).join('');
await mkdir('site/assets/weekly',{recursive:true});
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
try {for(const portrait of [false,true]){
 const height=portrait?1920:1350;
 const page=await browser.newPage({viewport:{width:1080,height},deviceScaleFactor:1});
 await page.setContent(`<!doctype html><html lang="ko"><meta charset="utf-8"><style>*{box-sizing:border-box;letter-spacing:0}body{margin:0;background:white;color:#20242a;font-family:'Malgun Gothic','Noto Sans KR',sans-serif}main{width:1080px;height:${height}px;padding:${portrait?'170px 70px':'44px 64px'};display:flex;flex-direction:column}header{padding-bottom:24px}header p{color:#ff5b30;font-size:22px;font-weight:700;margin:0 0 14px}h1{font-size:60px;line-height:1.3;margin:0 0 12px}header span{font-size:30px;color:#666}section{display:grid;grid-template-columns:165px 1fr;border-top:1px solid #cbd0d5;padding:${portrait?'27':'17'}px 0}.date b{display:block;font-size:34px}.date span{font-size:23px;color:#666}.events{border-left:1px solid #d6d8dc;padding-left:28px;display:grid;gap:13px}article{display:flex;gap:24px;align-items:flex-start}article img{width:36px;height:24px;object-fit:contain;margin-top:8px}h2{font-size:28px;line-height:1.35;font-weight:700;margin:0}article p,.empty{font-size:21px;line-height:1.45;color:#676b72;margin:3px 0 0}.empty{font-size:25px}footer{border-top:1px solid #bfc4ca;margin-top:8px;padding-top:18px;font-size:18px;line-height:1.7;color:#74787f}.brand{display:flex;justify-content:space-between;margin-top:20px;font-size:22px;color:#20242a}</style><main><header><p>LEE&NOTE / WEEKLY CALENDAR</p><h1>이번 주 증시 일정</h1><span>${issue.week.replaceAll('-','.')} — ${issue.end.slice(5).replace('-','.')}</span></header>${rows}<footer>시간 KST · 해외 행사는 현지 날짜 · 일정 변경 가능<br>주요 일정 선별 · 여러 날 행사는 시작일에 표시<br>출처: JPX · BEA · 한국은행 · NYSE · 일본 통계국 · RSNA<div class="brand"><b>리앤노트</b><span>leeandnote.com/calendar</span></div></footer></main></html>`);
 if(!portrait)await page.addStyleTag({content:'h1{font-size:54px}header{padding-bottom:18px}section{padding:12px 0}.events{gap:10px}h2{font-size:27px}article p{font-size:20px}footer{font-size:17px;padding-top:12px}.brand{margin-top:12px}'});
 await page.evaluate(()=>document.fonts.ready);
 const bad=await page.evaluate(()=>({bottom:document.querySelector('footer').getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>1080,images:[...document.images].some(i=>!i.complete||!i.naturalWidth)}));
 if(bad.bottom>height-30||bad.overflow||bad.images)throw Error(`Layout failed ${JSON.stringify(bad)}`);
 await page.screenshot({path:`site/assets/weekly/${issue.week}${portrait?'': '-instagram'}.${portrait?'png':'jpg'}`,type:portrait?'png':'jpeg',...(portrait?{}:{quality:95})});
 console.log({width:1080,height,...bad});await page.close();
}}finally{await browser.close();}
