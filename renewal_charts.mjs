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
function renderLegacyChart(spec){
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
export function renderChart(spec){
  const {document:d}=parseHTML(`<html><body>${renderLegacyChart(spec)}</body></html>`);
  const caption=d.querySelector('figcaption'),tag=d.createElement('span');tag.className='rn-exhibit-label';tag.textContent='EXHIBIT 01';caption.prepend(tag);
  const formattedDate=spec.date.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1.$2.$3');
  const fmt=n=>n.toLocaleString('ko-KR',{maximumFractionDigits:2});
  if(spec.kind==='dumbbell'){
    const first=spec.rows[0],change=first.cur-first.prev;
    caption.querySelector('h2').textContent=`${first.label.split(' · ')[0]}의 보고 비율 변동폭이 ${fmt(Math.abs(change))}%p로 가장 컸습니다`;
    caption.querySelector('p').textContent=`직전 → 이번 보유비율 · 단위 % · ${formattedDate} 접수 · 확인된 보고 중`;
    const max=Math.max(...spec.rows.flatMap(r=>[r.prev,r.cur]))>50?100:50,left=220,right=630,height=spec.rows.length*86+110,x=n=>left+n/max*(right-left);
    const ticks=Array.from({length:6},(_,i)=>max*i/5).map(n=>`<line x1="${x(n)}" x2="${x(n)}" y1="35" y2="${height-70}" stroke="#e0e0e0"/><text x="${x(n)}" y="22" text-anchor="middle" font-size="13">${fmt(n)}%</text>`).join('');
    const marks=spec.rows.map((r,i)=>{const y=65+i*86,parts=r.label.split(' · '),clip=s=>e(s.length>16?s.slice(0,15)+'…':s);return `<text x="16" y="${y}" font-size="15">${clip(parts[0])}</text><text x="16" y="${y+22}" font-size="13" fill="#525252">${clip(parts.slice(1).join(' · '))}</text><line x1="${x(r.prev)}" x2="${x(r.cur)}" y1="${y}" y2="${y}" stroke="${i===0?'#ff5000':'#8d8d8d'}" stroke-width="3"/><circle cx="${x(r.prev)}" cy="${y}" r="5" fill="white" stroke="#525252"/><circle cx="${x(r.cur)}" cy="${y}" r="5" fill="${i===0?'#ff5000':'#8d8d8d'}"/><text x="220" y="${y+25}" font-size="13">${fmt(r.prev)}% → ${fmt(r.cur)}%</text>`;}).join('');
    const container=d.createElement('div');container.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 ${height}" role="img" aria-label="직전과 이번 보유비율 비교"><title>직전과 이번 보유비율 비교</title><desc>빈 원은 직전, 채운 원은 이번 보고. 단위 %. 전체 보고자명은 아래 표에서 확인.</desc>${ticks}${marks}<text x="16" y="${height-25}" font-size="13">자료: DART · ${formattedDate} · LEE&amp;NOTE</text></svg>`;
    d.querySelector('svg').replaceWith(container.firstElementChild);
  }else{
    const svg=d.querySelector('svg');svg.innerHTML=svg.innerHTML.replaceAll(spec.date,formattedDate);
  }
  const mobile=d.createElement('ol');mobile.className='rn-chart-mobile';
  mobile.innerHTML=spec.rows.map(r=>`<li><div class="rn-chart-mobile-label"><strong>${e(r.label.split(' · ')[0])}</strong><span>${spec.kind==='dumbbell'?`${fmt(r.prev)}% → ${fmt(r.cur)}%`:fmt(r.value)+'주'}</span></div><p>${e(r.label.split(' · ').slice(1).join(' · '))}</p></li>`).join('');caption.after(mobile);d.querySelector('figure').classList.add('rn-exhibit');
  return d.body.innerHTML;
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
