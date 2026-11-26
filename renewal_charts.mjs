import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {articleCatalog} from './related_articles.mjs';
import {disclosureRecords,escapeHtml as e} from './renewal_search.mjs';

export function chartSpec(rows,group,date){
  const kind=group==='5percent'?'dumbbell':group==='executives'?'bar':null;
  if(!kind)return null;
  const category=kind==='dumbbell'?'5%보고':'임원·주요주주';
  const valid=rows.filter(r=>r.date===date&&r.category===category&&(kind==='dumbbell'?[r.prev,r.cur].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100):typeof r.shareDelta==='number'&&Number.isFinite(r.shareDelta)&&r.shareDelta!==0));
  const unique=[...new Map(valid.map(r=>[`${r.receiptNo}:${r.code}:${r.reporter}`,r])).values()];
  if(unique.length<(kind==='dumbbell'?3:5))return null;
  const selected=unique.sort((a,b)=>kind==='dumbbell'?Math.abs(b.cur-b.prev)-Math.abs(a.cur-a.prev):Math.abs(b.shareDelta)-Math.abs(a.shareDelta)).slice(0,5);
  return {kind,date,title:kind==='dumbbell'?'직전 보고와 이번 보유비율':'보고된 보유주식수 증감',subtitle:`${date.slice(0,4)}.${date.slice(4,6)}.${date.slice(6)} 접수 · 절대 변동폭 상위 ${selected.length}건`,note:kind==='dumbbell'?'보유비율 변화는 매수·매도와 일치하지 않을 수 있습니다. 보고 범위와 변동 사유를 원문에서 확인하세요.':'주식수 증감은 보고된 보유수량의 변화입니다. 증여·증권 전환 등도 포함될 수 있으므로 매수·매도로 단정하지 않습니다.',source:'DART 전자공시 · 리앤노트 정리',rows:selected.map(r=>({label:`${r.name} · ${r.reporter}`,prev:r.prev,cur:r.cur,value:r.shareDelta,url:r.url}))};
}
export function renderChart(spec){
  for(const key of ['title','subtitle','note','source'])if(!spec[key]?.trim())throw Error(`Chart missing ${key}`);
  if(!['dumbbell','bar'].includes(spec.kind)||spec.rows.length<(spec.kind==='dumbbell'?3:5))throw Error('Chart data gate failed');
  if(spec.rows.some(r=>!r.label||!(spec.kind==='dumbbell'?[r.prev,r.cur]:[r.value]).every(Number.isFinite)))throw Error('Invalid chart number');
  const width=680,height=spec.rows.length*92+90,left=50,right=625,top=40,bar=spec.kind==='bar';
  const min=bar?Math.min(0,...spec.rows.map(r=>r.value)):0,max=bar?Math.max(0,...spec.rows.map(r=>r.value)):Math.max(1,...spec.rows.flatMap(r=>[r.prev,r.cur]));
  const x=n=>left+(n-min)/(max-min||1)*(right-left),fmt=n=>n.toLocaleString('ko-KR',{maximumFractionDigits:2});
  const drawings=spec.rows.map((r,i)=>{
    const y=top+i*92,label=e(r.label.length>35?r.label.slice(0,34)+'…':r.label);
    const marks=bar?`<rect x="${Math.min(x(0),x(r.value))}" y="${y+15}" width="${Math.max(1,Math.abs(x(r.value)-x(0)))}" height="14" fill="${r.value>0?'#e42939':'#1f6feb'}"/><text x="${left}" y="${y+53}" font-size="14">${r.value>0?'+':''}${fmt(r.value)}주</text>`:`<line x1="${x(r.prev)}" x2="${x(r.cur)}" y1="${y+23}" y2="${y+23}" stroke="#8d8d8d" stroke-width="3"/><circle cx="${x(r.prev)}" cy="${y+23}" r="6" fill="#fff" stroke="#525252" stroke-width="2"/><circle cx="${x(r.cur)}" cy="${y+23}" r="6" fill="#ff5000"/><text x="${left}" y="${y+53}" font-size="14">직전 ${fmt(r.prev)}% → 이번 ${fmt(r.cur)}%</text>`;
    return `<text x="${left}" y="${y}" font-size="14">${label}</text>${marks}`;
  }).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${e(spec.title)}" style="background:#fff;font-family:Arial,sans-serif;fill:#262626"><title>${e(spec.title)}</title><desc>${e(spec.subtitle)}. ${e(spec.note)}. 정확한 종목·보고자와 수치는 아래 데이터 표에서 확인할 수 있습니다.</desc><line x1="${x(0)}" x2="${x(0)}" y1="40" y2="${height-65}" stroke="#e0e0e0"/>${drawings}<text x="${left}" y="${height-30}" font-size="12">${e(spec.source)} · ${e(spec.date)} · LEE&amp;NOTE</text></svg>`;
  return `<figure class="rn-data-chart"><figcaption><h2>${e(spec.title)}</h2><p>${e(spec.subtitle)}</p></figcaption>${svg}<p>${e(spec.note)}</p><details><summary>차트 데이터와 원문</summary><div class="rn-chart-table"><table><thead><tr><th>종목 · 보고자</th>${bar?'<th>증감 주식수</th>':'<th>직전 비율</th><th>이번 비율</th>'}<th>출처</th></tr></thead><tbody>${spec.rows.map(r=>`<tr><th>${e(r.label)}</th>${bar?`<td>${fmt(r.value)}주</td>`:`<td>${fmt(r.prev)}%</td><td>${fmt(r.cur)}%</td>`}<td><a href="${e(r.url)}" target="_blank" rel="noopener noreferrer">DART 원문</a></td></tr>`).join('')}</tbody></table></div></details></figure>`;
}
export function buildDailyCharts(dir){
  const rows=disclosureRecords(dir);let count=0;
  for(const page of articleCatalog(dir)){
    if(!page.date)continue;
    const spec=chartSpec(rows,page.group,page.date.replaceAll('-',''));if(!spec)continue;
    const {document}=parseHTML(fs.readFileSync(page.file,'utf8'));if(document.querySelector('.rn-data-chart'))continue;
    const container=document.createElement('div');container.innerHTML=renderChart(spec);document.querySelector('.articleBody').prepend(container.firstElementChild);
    fs.writeFileSync(page.file,document.toString());count++;
  }
  return count;
}
