import fs from 'node:fs';
import path from 'node:path';
import {parseHTML} from 'linkedom';
import {disclosureRecords,escapeHtml as e} from './renewal_search.mjs';

export async function refreshMajorSnapshot(dir){
  const file=path.join(dir,'data/disclosure_signals.json');if(!fs.existsSync(file))return 0;
  const end=new Date(Date.now()+9*60*60*1000),start=new Date(end);start.setUTCDate(start.getUTCDate()-120);
  const format=d=>d.toISOString().slice(0,10).replaceAll('-','');
  const response=await fetch('https://quiet-cardinal-118.convex.cloud/api/query',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(30000),body:JSON.stringify({path:'dart:listMajorEventDailyReportItemsRange',args:{bgnDe:format(start),endDe:format(end),limit:1000},format:'json'})});
  if(!response.ok)throw Error(`Major-event snapshot HTTP ${response.status}`);
  const result=await response.json();if(result.status!=='success'||!Array.isArray(result.value))throw Error('Invalid major-event snapshot');
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  const rows=result.value.map(r=>({'접수일':r.receiptDate||r.reportDate,'시장':r.market,'종목명':r.corpName,'종목코드':r.stockCode,'보고서명':r.eventTitle||r.reportName,'주요내용':[r.eventTitle,r.detail,r.metric].filter(Boolean).join(' · '),'접수번호':r.receiptNo,DART_URL:r.url,'공시유형':'투자판단관련주요경영사항'}));
  const merged=new Map((data.rows||[]).map(r=>[r['접수번호'],r]));for(const r of rows)merged.set(r['접수번호'],r);
  data.rows=[...merged.values()];
  fs.writeFileSync(file,JSON.stringify(data));
  fs.writeFileSync(path.join(dir,'data/disclosure_signals.js'),`window.__DISCLOSURE_SIGNALS__ = ${JSON.stringify(data).replaceAll('<','\\u003c')};`);
  return rows.length;
}

export function signalRecords(dir){
  const file=path.join(dir,'data/disclosure_signals.json');if(!fs.existsSync(file))return [];
  const data=JSON.parse(fs.readFileSync(file,'utf8')),unique=new Map();
  for(const r of data.rows||[]){
    if(!/^\d{14}$/.test(r['접수번호'])||r['접수번호'].slice(0,8)!==r['접수일'])continue;
    let url;try{url=new URL(r.DART_URL);}catch{continue;}
    if(url.protocol!=='https:'||url.hostname!=='dart.fss.or.kr')continue;
    const category=/단일판매|공급계약/.test(r['공시유형'])?'contracts':/투자판단/.test(r['공시유형'])?'major-events':null;
    if(!category)continue;
    unique.set(r['접수번호'],{name:r['종목명'],date:r['접수일'],code:r['종목코드'],receiptNo:r['접수번호'],category,reason:r['보고서명'],url:url.href});
  }
  return [...unique.values()].sort((a,b)=>b.receiptNo.localeCompare(a.receiptNo));
}
export function prerenderDataPages(dir){
  const rows=disclosureRecords(dir),signals=signalRecords(dir);let count=0;
  for(const [route,id,category] of [['5percent','list','5%보고'],['executives','list','임원·주요주주'],['contracts','contractList','contracts'],['major-events','majorEventList','major-events']]){
    const data=(route==='contracts'||route==='major-events'?signals:rows).filter(r=>r.category===category).slice(0,50);
    for(const file of [path.join(dir,`${route}.html`),path.join(dir,route,'index.html')]){
      if(!fs.existsSync(file)||!data.length)continue;
      const {document}=parseHTML(fs.readFileSync(file,'utf8')),list=document.getElementById(id);if(!list)continue;
      list.classList.add('rn-ssr-list');
      list.innerHTML=`<div class="rn-ssr-table"><table><caption>최근 수집 공시 ${data.length}건 · 접수일 기준</caption><thead><tr><th>접수일</th><th>종목</th><th>보고자 · 공시</th><th>확인 내용</th><th>원문</th></tr></thead><tbody>${data.map(r=>`<tr><td>${e(r.date)}</td><th>${e(r.name)}<small>${e(r.code)}</small></th><td>${e(r.reporter||r.reason)}</td><td>${e(r.rateText||r.reason||'원문 확인')}</td><td><a href="${e(r.url)}" target="_blank" rel="noopener noreferrer">DART 원문</a></td></tr>`).join('')}</tbody></table></div>`;
      fs.writeFileSync(file,document.toString());count++;
    }
  }
  return count;
}
