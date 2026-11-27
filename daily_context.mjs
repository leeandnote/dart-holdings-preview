import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {articleCatalog} from './related_articles.mjs';
import {disclosureRecords,escapeHtml as e} from './renewal_search.mjs';
export function dailyContext(rows,category,date){
 const today=rows.filter(r=>r.category===category&&r.date===date);if(!today.length)return null;
 const cutoff=new Date(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6)}T00:00:00Z`);cutoff.setUTCDate(cutoff.getUTCDate()-30);
 const start=cutoff.toISOString().slice(0,10).replaceAll('-','');
 const past=rows.filter(r=>r.category===category&&r.date>=start&&r.date<date);
 const repeated=today.map(r=>({r,count:new Set(past.filter(p=>p.code===r.code&&p.reporter===r.reporter).map(p=>p.receiptNo)).size})).sort((a,b)=>b.count-a.count)[0];
 const values=today.filter(r=>category==='5%보고'?[r.prev,r.cur].every(n=>typeof n==='number'&&Number.isFinite(n)):typeof r.shareDelta==='number'&&Number.isFinite(r.shareDelta));
 const magnitude=r=>category==='5%보고'?r.cur-r.prev:r.shareDelta;
 const largest=values.sort((a,b)=>Math.abs(magnitude(b))-Math.abs(magnitude(a)))[0];
 const points=[`오늘 수집한 고유 공시는 ${new Set(today.map(r=>r.receiptNo)).size}건, 종목은 ${new Set(today.map(r=>r.code)).size}개입니다.`,repeated.count?`${repeated.r.name} · ${repeated.r.reporter}: 이전 30일 수집분에서 같은 종목·제출인의 보고 ${repeated.count}건을 확인했습니다.`:'이전 30일 수집분에서는 오늘과 같은 종목·제출인의 반복 보고를 확인하지 못했습니다.',largest?`${largest.name} · ${largest.reporter}: 확인 가능한 수치 중 절대 변동폭이 가장 큽니다. ${category==='5%보고'?'보유비율':'보유주식수'} 변화 ${magnitude(largest)>0?'+':''}${magnitude(largest).toLocaleString('ko-KR',{maximumFractionDigits:2})}${category==='5%보고'?'%p':'주'}입니다.`:'비교할 수 있는 증감 수치가 없어 최대 변동 보고를 산출하지 않았습니다.'];
 return {points,historyDates:new Set(past.map(r=>r.date)).size,source:largest?.url||today[0].url};
}
export function buildDailyContext(dir){
 const rows=disclosureRecords(dir);let count=0;
 for(const page of articleCatalog(dir)){
  if(!['5percent','executives'].includes(page.group)||!page.date)continue;
  const result=dailyContext(rows,page.group==='5percent'?'5%보고':'임원·주요주주',page.date.replaceAll('-',''));if(!result)continue;
  const {document:d}=parseHTML(fs.readFileSync(page.file,'utf8'));if(d.querySelector('.rn-daily-context'))continue;
  const section=d.createElement('section');section.className='rn-daily-context';section.innerHTML=`<h2>오늘 눈여겨볼 3가지</h2><ol>${result.points.map(p=>`<li>${e(p)}</li>`).join('')}</ol><p>이전 30일 중 자료가 있는 ${result.historyDates}개 접수일의 수집분과 비교했습니다. 전 시장 전수 통계나 최근 20영업일 평균이 아니며, 보고 횟수는 거래 횟수와 다릅니다. <a href="${e(result.source)}" target="_blank" rel="noopener noreferrer">비교 보고 원문</a></p>`;
  const summary=d.querySelector('.articleBody .summaryBox');if(summary)summary.after(section);else d.querySelector('.articleBody').prepend(section);fs.writeFileSync(page.file,d.toString());count++;
 }
 return count;
}
