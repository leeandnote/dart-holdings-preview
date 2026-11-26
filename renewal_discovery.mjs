import fs from 'node:fs';
import path from 'node:path';
import {parseHTML} from 'linkedom';
import {articleCatalog} from './related_articles.mjs';
import {disclosureRecords,escapeHtml as e} from './renewal_search.mjs';
import {faqs} from './home_search.mjs';
import {signalRecords} from './renewal_data.mjs';

const groups=[['5percent','5% 지분보고'],['executives','임원·주요주주'],['contracts','수주·공급계약'],['major-events','투자판단']];
const link=p=>`<a href="${e(p.url)}">${e(p.title)}</a>`;
const dailyList=items=>`<ul class="rn-daily-list">${items.map(p=>`<li><time>${e(p.date)}</time><span>${link(p)}</span><small>${e(groups.find(([key])=>key===p.group)?.[1]||'공시')}</small></li>`).join('')}</ul>`;
const picks=items=>`<div class="rn-editor-grid">${items.map((p,i)=>`<article><div class="rn-editor-label"><span>INSIGHT</span><b>${String(i+1).padStart(2,'0')}</b></div><h3>${link(p)}</h3></article>`).join('')}</div>`;
const tabs=`<nav class="rn-category-tabs" aria-label="인사이트 분류"><a href="/blog/" aria-current="page">전체</a><a href="/blog/issues/">해설·이슈</a>${groups.map(([key,label])=>`<a href="/blog/${key}/">${label}</a>`).join('')}</nav>`;
const form=`<form class="rn-unified-form" action="/search/" role="search"><label for="home-query">종목 · 코드 · 보고자 · 공시 해설</label><div><input id="home-query" name="q" type="search" required maxlength="120" placeholder="궁금한 종목이나 기관을 검색하세요"><button aria-label="검색"><img src="/assets/icons/search.svg" alt="" width="24" height="24"></button></div></form>`;

function setMain(file,html){
  const {document}=parseHTML(fs.readFileSync(file,'utf8'));
  const main=document.querySelector('main');if(!main)return;
  main.className='rn-discovery';main.innerHTML=html;
  document.body.classList.add('rn-discovery-page');
  document.querySelectorAll('body>.homeQuality').forEach(n=>n.remove());
  if(!document.querySelector('link[href="/renewal-discovery.css"]')){const css=document.createElement('link');css.rel='stylesheet';css.href='/renewal-discovery.css';document.head.append(css);}
  fs.writeFileSync(file,document.toString());
}
export function buildDiscovery(dir){
  const catalog=articleCatalog(dir), guides=catalog.filter(p=>p.group==='issues'), daily=catalog.filter(p=>p.date).sort((a,b)=>b.date.localeCompare(a.date)||a.url.localeCompare(b.url));
  const rows=disclosureRecords(dir),latest=rows[0]?.date, latestRows=rows.filter(r=>r.date===latest);
  const date=latest?`${latest.slice(0,4)}.${latest.slice(4,6)}.${latest.slice(6)}`:'확인된 자료 없음';
  const home=path.join(dir,'index.html');
  if(fs.existsSync(home))setMain(home,`<header class="rn-discovery-heading"><p>LEE&NOTE</p><h1>공시 속 지분 변동과<br>기업의 다음 움직임</h1>${form}<p class="rn-data-basis">최근 수집 접수일 ${date} · 지분·임원보고 ${latestRows.length.toLocaleString('ko')}건</p></header><section class="rn-discovery-section"><h2>공시 데이터</h2><div class="rn-category-grid">${groups.map(([key,label],i)=>{const data=latestRows.filter(r=>r.category===(i===0?'5%보고':i===1?'임원·주요주주':''));return `<article><h3><a href="/${key}">${label} →</a></h3><strong>${i<2?data.length.toLocaleString('ko'):'목록 보기'}</strong><p>${i<2?e([...new Set(data.map(r=>r.name))].slice(0,3).join(' · ')||'해당 접수일 수집 내역 없음'):'계약 조건과 진행 단계를 원문에서 확인하세요.'}</p></article>`;}).join('')}</div></section><section class="rn-discovery-section"><div class="rn-section-heading"><h2>공시를 읽는 시선</h2><a href="/blog/">인사이트 전체 →</a></div>${picks(guides.slice(0,4))}</section><section class="rn-discovery-section"><div class="rn-section-heading"><h2>최근 데일리 노트</h2><a href="/blog/">전체 보기 →</a></div>${dailyList(daily.slice(0,8))}</section><section class="rn-subscription"><h2>새로운 공시, 놓치지 않도록</h2><a href="https://t.me/leeandnote" target="_blank" rel="noopener noreferrer">텔레그램에서 받아보기 →</a></section><section class="rn-discovery-section rn-home-faq"><h2>공시 데이터에 대해 자주 묻는 질문</h2>${faqs.map(([q,a])=>`<details><summary>${e(q)}</summary><p>${e(a)}</p></details>`).join('')}<p><a href="/editorial-policy">데이터·편집 기준</a> · <a href="/contact">문의·오류 제보</a></p></section>`);
  if(fs.existsSync(home)){
    const {document}=parseHTML(fs.readFileSync(home,'utf8')),signals=signalRecords(dir);
    const latestSignal=signals[0]?.date;
    const cards=document.querySelectorAll('.rn-category-grid article');
    for(const [i,category] of [[2,'contracts'],[3,'major-events']]){
      const data=signals.filter(r=>r.category===category&&r.date===latestSignal);
      if(latestSignal){cards[i].querySelector('strong').textContent=String(data.length);cards[i].querySelector('p').textContent=`${latestSignal.slice(0,4)}.${latestSignal.slice(4,6)}.${latestSignal.slice(6)} 접수 · ${[...new Set(data.map(r=>r.name))].slice(0,3).join(' · ')||'수집 내역 없음'}`;}
    }
    fs.writeFileSync(home,document.toString());
  }
  const blog=path.join(dir,'blog/index.html');
  if(fs.existsSync(blog)){
    const pageSize=24, pages=Math.max(1,Math.ceil(daily.length/pageSize));
    const pagination=current=>`<nav class="rn-pagination" aria-label="데일리 노트 페이지">${Array.from({length:pages},(_,i)=>`<a href="${i===0?'/blog/':`/blog/page/${i+1}/`}"${current===i+1?' aria-current="page"':''}>${i+1}</a>`).join('')}</nav>`;
    setMain(blog,`<header class="rn-discovery-heading"><p>INSIGHT</p><h1>공시로 읽는 시장 이야기</h1></header>${tabs}<section class="rn-discovery-section"><h2>해설·이슈</h2>${picks(guides)}</section><section class="rn-discovery-section"><h2>데일리 노트</h2>${dailyList(daily.slice(0,pageSize))}${pagination(1)}</section>`);
    for(let page=2;page<=pages;page++){
      const target=path.join(dir,`blog/page/${page}`);fs.mkdirSync(target,{recursive:true});
      const file=path.join(target,'index.html');
      fs.writeFileSync(file,`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>데일리 공시 노트 ${page}페이지 | 리앤노트</title><meta name="description" content="접수일별 지분, 임원, 수주 공시 노트 목록"><link rel="canonical" href="https://leeandnote.com/blog/page/${page}/"></head><body><main></main></body></html>`);
      setMain(file,`<header class="rn-discovery-heading"><p>DAILY NOTE</p><h1>데일리 공시 노트</h1><a href="/blog/">인사이트 홈 →</a></header>${dailyList(daily.slice((page-1)*pageSize,page*pageSize))}${pagination(page)}`);
    }
  }
  return {guides:guides.length,daily:daily.length,latestDate:latest||null};
}
