import fs from 'node:fs';
import path from 'node:path';
import {parseHTML} from 'linkedom';
import {articleCatalog} from './related_articles.mjs';
import {escapeHtml as e} from './renewal_search.mjs';
import {institutionDefinitions} from './institution_topics.mjs';

const official=url=>{try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='dart.fss.or.kr'&&/^\d{14}$/.test(u.searchParams.get('rcpNo')||'');}catch{return false;}};
const matchesReceipt=r=>official(r.DART_URL)&&new URL(r.DART_URL).searchParams.get('rcpNo')===r['접수번호'];
const format=n=>n.toLocaleString('ko-KR',{maximumFractionDigits:2});
export function contractChart(rows,date){
  const unique=new Map();
  for(const r of rows){
    if(r['접수일']!==date||r['접수번호']?.slice(0,8)!==date||!matchesReceipt(r)||!/단일판매|공급계약/.test(r['공시유형']||''))continue;
    const amount=r['계약금액'],revenue=r['최근매출액'],ratio=r['매출대비비율'];
    if(![amount,revenue,ratio].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0))continue;
    const calculated=amount/revenue*100;
    if(Math.abs(calculated-ratio)>0.05)continue;
    unique.set(r['접수번호'],{label:r['종목명'],value:ratio,detail:`계약 ${format(amount/1e8)}억원 / 매출 ${format(revenue/1e8)}억원`,url:r.DART_URL});
  }
  if(unique.size<5)return null;
  return {kind:'rank',title:'최근 매출액 대비 계약 규모',subtitle:`${date} 접수 · 확인된 비율 상위 5건`,note:'공시의 최근 매출액 기준이며 올해 실적 기여율이나 이익률이 아닙니다. 계약 조건과 정정 내역은 원문을 확인하세요.',unit:'%',rows:[...unique.values()].sort((a,b)=>b.value-a.value).slice(0,5)};
}
export function eventTimeline(rows,date){
  const unique=new Map();
  for(const r of rows){
    if(r['접수일']!==date||r['접수번호']?.slice(0,8)!==date||r['공시유형']!=='투자판단관련주요경영사항'||!matchesReceipt(r)||!r['보고서명'])continue;
    unique.set(r['접수번호'],{label:r['종목명'],detail:r['보고서명'],date,url:r.DART_URL});
  }
  if(unique.size<3)return null;
  return {kind:'timeline',title:'투자판단 공시 접수 타임라인',subtitle:`${date} 접수 · ${unique.size}건`,note:'표시한 날짜는 DART 접수일이며 사건 발생일·승인일·거래일과 다를 수 있습니다. 같은 날의 접수번호 순서이며 시간 순서를 추정하지 않습니다.',rows:[...unique.values()].sort((a,b)=>a.url.localeCompare(b.url))};
}
export function institutionCharts(document){
  const canonical=document.querySelector('link[rel="canonical"]')?.getAttribute('href')||'';
  const definition=institutionDefinitions.find(([slug])=>canonical.endsWith(`/${slug}/`));
  if(!definition)return [];
  const records=new Map();
  for(const tr of document.querySelectorAll('.articleBody table tbody tr')){
    const cells=[...tr.querySelectorAll('td')];if(cells.length!==4)continue;
    const a=cells[3].querySelector('a'),url=a?.getAttribute('href');if(!official(url))continue;
    const receipt=new URL(url).searchParams.get('rcpNo'),reporter=cells[1].textContent.trim();
    if(!definition[2].test(reporter))continue;
    const rates=cells[2].textContent.match(/^\s*([\d,.]+)%\s*→\s*([\d,.]+)%\s*$/);
    const code=cells[0].querySelector('small')?.textContent.trim();if(!code)continue;
    const label=cells[0].cloneNode(true);label.querySelectorAll('small').forEach(n=>n.remove());
    records.set(`${receipt}:${code}:${reporter}`,{receipt,code,reporter,label:label.textContent.trim(),url,value:rates?Number(rates[2].replaceAll(',','')):null});
  }
  const all=[...records.values()],specs=[];
  const latest=new Map();
  for(const r of all.sort((a,b)=>b.receipt.localeCompare(a.receipt)))if(!latest.has(`${r.code}:${r.reporter}`))latest.set(`${r.code}:${r.reporter}`,r);
  const valid=[...latest.values()].filter(r=>r.value!==null&&Number.isFinite(r.value)&&r.value>=0&&r.value<=100);
  if(valid.length>=5)specs.push({kind:'rank',title:`${definition[1]} 보고 보유비율`,subtitle:'종목·제출인별 수집된 최신 보고 중 상위 5건',note:'현재 전체 포트폴리오가 아닙니다. 보고 시점과 공동보유 범위가 다를 수 있으며 시점별 잔고를 합산하지 않았습니다.',unit:'%',rows:valid.sort((a,b)=>b.value-a.value).slice(0,5).map(r=>({...r,detail:`접수 ${r.receipt.slice(0,8)} · ${r.reporter}`}))});
  const months=new Map();for(const r of all){const month=r.receipt.slice(0,6);if(!months.has(month))months.set(month,new Map());months.get(month).set(r.receipt,r.url);}
  const keys=[...months.keys()].sort();
  const consecutive=keys.length>=6&&keys.every((key,i)=>i===0||Number(key.slice(0,4))*12+Number(key.slice(4))===Number(keys[i-1].slice(0,4))*12+Number(keys[i-1].slice(4))+1);
  if(consecutive)specs.push({kind:'rank',title:`${definition[1]} 월별 수집 공시`,subtitle:'접수번호 중복 제외 · 수집된 보고 건수',note:'매수 횟수나 거래량이 아닙니다. 수집 범위 밖의 보고가 빠질 수 있으며 첫 달과 마지막 달은 부분 기간일 수 있습니다.',unit:'건',rows:keys.map(key=>({label:`${key.slice(0,4)}.${key.slice(4)}`,value:months.get(key).size,detail:'수집된 고유 접수번호 기준',urls:[...months.get(key).values()],url:[...months.get(key).values()][0]}))});
  return specs;
}
function renderExtendedSvg(spec){
  for(const key of ['title','subtitle','note'])if(!spec[key]?.trim())throw Error(`Missing chart ${key}`);
  const timeline=spec.kind==='timeline';if(!['rank','timeline'].includes(spec.kind)||spec.rows.length<(timeline?3:5))throw Error('Extended chart data gate');
  if(spec.rows.some(r=>!official(r.url)||!r.label||(!timeline&&(!Number.isFinite(r.value)||r.value<0))))throw Error('Invalid chart data');
  const clip=s=>e(String(s).length>34?String(s).slice(0,33)+'…':s),height=spec.rows.length*88+60,max=timeline?1:Math.max(1,...spec.rows.map(r=>r.value));
  const drawing=spec.rows.map((r,i)=>{const y=30+i*88;return timeline?`<circle cx="24" cy="${y}" r="5" fill="${i===0?'#ff5000':'#8d8d8d'}"/><text x="44" y="${y+5}" font-size="15">${clip(r.label)}</text><text x="44" y="${y+31}" font-size="13">${clip(r.detail)}</text><text x="44" y="${y+53}" font-size="12">접수일 ${e(r.date)}</text>`:`<text x="24" y="${y}" font-size="15">${clip(r.label)}</text><rect x="24" y="${y+12}" width="${r.value/max*500}" height="12" fill="${i===0?'#ff5000':'#8d8d8d'}"/><text x="${34+r.value/max*500}" y="${y+23}" font-size="13">${format(r.value)}${e(spec.unit)}</text><text x="24" y="${y+49}" font-size="12">${clip(r.detail)}</text>`;}).join('');
  return `<figure class="rn-data-chart rn-extended-chart"><figcaption><h2>${e(spec.title)}</h2><p>${e(spec.subtitle)}</p></figcaption><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 ${height}" role="img" aria-label="${e(spec.title)}" style="background:#fff;font-family:Arial,sans-serif;fill:#262626"><title>${e(spec.title)}</title><desc>${e(spec.note)} 전체 수치는 아래 표에서 확인할 수 있습니다.</desc><line x1="24" x2="24" y1="30" y2="${height-60}" stroke="#e0e0e0"/>${drawing}<text x="24" y="${height-15}" font-size="12">자료: DART 전자공시 · 리앤노트 정리 · LEE&amp;NOTE</text></svg><p>${e(spec.note)}</p><details><summary>전체 데이터와 DART 원문</summary><div class="rn-chart-table"><table><thead><tr><th>종목·구분</th><th>${timeline?'접수일':'수치'}</th><th>내용</th><th>원문</th></tr></thead><tbody>${spec.rows.map(r=>`<tr><th>${e(r.label)}</th><td>${timeline?e(r.date):format(r.value)+e(spec.unit)}</td><td>${e(r.detail)}</td><td>${(r.urls||[r.url]).map((url,i)=>`<a href="${e(url)}" target="_blank" rel="noopener noreferrer">DART ${i+1}</a>`).join(' · ')}</td></tr>`).join('')}</tbody></table></div></details></figure>`;
}
export function renderExtendedChart(spec){
  const html=renderExtendedSvg(spec);
  const max=Math.max(1,...spec.rows.map(r=>r.value||0));
  const mobile=`<ol class="rn-chart-mobile">${spec.rows.map(r=>`<li><div class="rn-chart-mobile-label"><strong>${e(r.label)}</strong><span>${spec.kind==='timeline'?e(r.date):format(r.value)+e(spec.unit)}</span></div>${spec.kind==='rank'?`<div class="rn-chart-mobile-track" aria-hidden="true"><i style="width:${r.value/max*100}%"></i></div>`:''}<p>${e(r.detail)}</p></li>`).join('')}</ol>`;
  return html.replace('</figcaption>','</figcaption>'+mobile);
}
export function buildExtendedCharts(dir){
  const file=path.join(dir,'data/disclosure_signals.json'),rows=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')).rows||[]:[];
  const counts={contracts:0,events:0,institutions:0};
  for(const page of articleCatalog(dir)){
    const {document}=parseHTML(fs.readFileSync(page.file,'utf8'));if(document.querySelector('.rn-extended-chart'))continue;
    const date=page.date.replaceAll('-','');
    const specs=page.group==='contracts'?[contractChart(rows,date)]:page.group==='major-events'?[eventTimeline(rows,date)]:institutionCharts(document);
    const valid=specs.filter(Boolean);if(!valid.length)continue;
    const container=document.createElement('div');container.innerHTML=valid.map(renderExtendedChart).join('');
    document.querySelector('.articleBody').prepend(...container.childNodes);fs.writeFileSync(page.file,document.toString());
    counts[page.group==='contracts'?'contracts':page.group==='major-events'?'events':'institutions']+=valid.length;
  }
  return counts;
}
