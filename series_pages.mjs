import fs from 'node:fs';
import path from 'node:path';
import {parseHTML} from 'linkedom';
import {articleCatalog} from './related_articles.mjs';
import {series,legacySeries,escape as e,pageHtml,writePage,origin,kstDate} from './note_series.mjs';
import {renderCover} from './series_covers.mjs';

const badge=n=>`${series[n.series].badge} no.${String(n.series_no).padStart(2,'0')}`;
const card=n=>`<article class="rn-note-card" data-series-no="${n.series_no}" data-published="${e(n.order||n.published||'')}"><a href="${n.url}" class="rn-note-cover" tabindex="-1" aria-hidden="true"><img src="${n.cover}" width="1200" height="630" alt="" loading="lazy"></a><div><p class="rn-note-badge">${e(badge(n))}</p><h3><a href="${n.url}">${e(n.title)}</a></h3><p class="rn-note-subtitle">${e(n.subtitle)}</p><small>${n.published?`${n.updated?'업데이트 ':''}<time datetime="${e(n.updated||n.published)}">${e(kstDate(n.updated||n.published))}</time> · `:''}${n.reading}분</small></div></article>`;
const tiles=(groups,covers)=>Object.entries(series).filter(([key])=>groups[key].length>=2).map(([key,cfg])=>`<a class="rn-series-tile" href="/series/${key}/"><img src="${covers[key]}" width="1200" height="630" alt="" loading="lazy"><div><span class="rn-note-badge">${e(cfg.badge)}</span><h3>${cfg.name}</h3><p>${cfg.description}</p><small>${groups[key].length}편</small></div></a>`).join('');
function decorate(document){
  if(!document.querySelector('link[href="/series.css"]'))document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="/series.css"><script src="/series.js" defer></script>');
}
export function buildSeries(dir,{published=[]}={}){
  const notes=[];
  for(const p of articleCatalog(dir).filter(p=>p.group==='issues')){
    const slug=p.url.split('/').filter(Boolean).at(-1),fresh=published.find(n=>n.slug===slug),old=legacySeries[slug];
    if(!fresh&&!old)continue;
    const {document}=parseHTML(fs.readFileSync(p.file,'utf8'));
    const prose=document.querySelector('.articleBody').cloneNode(true);prose.querySelectorAll('table,figure,.rn-references').forEach(n=>n.remove());
    const m=fresh?.meta||{series:old[0],series_no:old[1]};
    const receipts=new Set([...document.querySelectorAll('a[href]')].map(n=>n.getAttribute('href')).filter(u=>/^https:\/\/dart\.fss\.or\.kr\/dsaf001\/main\.do\?rcpNo=\d{14}$/.test(u)));
    if(m.series==='investor'&&receipts.size<10)continue;
    const n={...p,slug,series:m.series,series_no:m.series_no,title:p.title,subtitle:m.subtitle||p.description,reading:Math.max(1,Math.ceil(prose.textContent.replace(/\s/g,'').length/500)),published:fresh?.publishedAt||p.published,keyword:m.cover_keyword||p.title.split(/[?:：]/)[0],basis_date:m.basis_date,period:m.period_start?`${m.period_start} ~ ${m.period_end}`:'',receiptCount:receipts.size};
    n.updated=fresh&&Date.parse(fresh.modifiedAt)>Date.parse(fresh.publishedAt)?fresh.modifiedAt:null;
    n.order=n.updated||n.published;
    n.cover=renderCover(dir,n);notes.push(n);
    decorate(document);
    document.querySelectorAll('article .rn-note-badge,.rn-series-related').forEach(n=>n.remove());
    const header=document.querySelector('.titleArea')||document.querySelector('article');
    header.insertAdjacentHTML('afterbegin',`<p class="rn-note-badge"><a href="/series/${n.series}/">${e(badge(n))}</a></p>`);
    for(const [attr,key] of [['property','og:image'],['name','twitter:image']]){let meta=document.querySelector(`meta[${attr}="${key}"]`);if(!meta){meta=document.createElement('meta');meta.setAttribute(attr,key);document.head.append(meta);}meta.content=origin+n.cover;}
    for(const script of document.querySelectorAll('script[type="application/ld+json"]')){const j=JSON.parse(script.textContent);for(const node of j['@graph']||[j])if(node['@type']==='Article')node.image=origin+n.cover;script.textContent=JSON.stringify(j).replaceAll('<','\\u003c');}
    fs.writeFileSync(p.file,document.toString());
  }
  notes.sort((a,b)=>(Date.parse(b.order)||0)-(Date.parse(a.order)||0)||b.series_no-a.series_no);
  const groups=Object.fromEntries(Object.keys(series).map(key=>[key,notes.filter(n=>n.series===key)])),covers={};
  for(const [key,cfg] of Object.entries(series)){
    covers[key]=renderCover(dir,{slug:key,series:key,title:cfg.name});
    const list=groups[key],url=`/series/${key}/`;
    const schema={'@context':'https://schema.org','@type':'CollectionPage',name:cfg.name,url:origin+url,description:cfg.description,mainEntity:{'@type':'ItemList',itemListElement:list.map((n,i)=>({'@type':'ListItem',position:i+1,url:origin+n.url,name:n.title}))}};
    writePage(dir,url,pageHtml(cfg.name,url,`<header class="rn-series-heading"><p class="rn-note-badge">${e(cfg.badge)}</p><h1>${cfg.name}</h1><p>${cfg.description}</p><p>원문과 기준일을 확인하며 읽는 리앤노트의 ${cfg.name} 시리즈입니다.</p><small>${list.length}편</small></header>${list.length?`<div class="rn-series-sort" role="group" aria-label="글 정렬"><button type="button" data-note-sort="latest" aria-pressed="true">최신순</button><button type="button" data-note-sort="first" aria-pressed="false">1편부터</button></div><section class="rn-series-grid" data-sortable-notes>${list.map(card).join('')}</section>`:''}`,schema,cfg.description,list.length<2));
  }
  writePage(dir,'/series/',pageHtml('주제별 노트','/series/',`<header class="rn-series-heading"><p class="rn-note-badge">SERIES</p><h1>주제별로 읽는 공시와 주식</h1></header><section class="rn-series-tiles">${tiles(groups,covers)}</section>`,{'@context':'https://schema.org','@type':'CollectionPage',name:'주제별 노트',url:origin+'/series/',mainEntity:{'@type':'ItemList',itemListElement:Object.keys(series).filter(key=>groups[key].length>=2).map((key,i)=>({'@type':'ListItem',position:i+1,url:origin+`/series/${key}/`,name:series[key].name}))}},'공시 해부, 기관 지분 보고와 주식 기초를 주제별로 읽습니다.'));
  const active=Object.keys(series).filter(key=>groups[key].length>=2);
  const section=`<section class="rn-discovery-section rn-series-browser"><div class="rn-section-heading"><div><p class="rn-note-badge">SERIES</p><h2>주제별로 읽는 공시와 주식</h2></div></div><div class="rn-series-tabs" role="tablist" aria-label="시리즈">${active.map((key,i)=>`<button id="series-tab-${key}" type="button" role="tab" aria-controls="series-panel-${key}" aria-selected="${i===0}" tabindex="${i===0?0:-1}">${series[key].name}</button>`).join('')}</div>${active.map((key,i)=>`<div id="series-panel-${key}" role="tabpanel" aria-labelledby="series-tab-${key}"${i?' hidden':''}><div class="rn-series-strip">${groups[key].slice(0,3).map(card).join('')}<a class="rn-series-all" href="/series/${key}/"><strong>시리즈 전체 보기 →</strong><p>${series[key].description}</p><small>${groups[key].length}편</small></a></div></div>`).join('')}</section><section class="rn-discovery-section"><h2>시리즈 한눈에</h2><div class="rn-series-tiles">${tiles(groups,covers)}</div></section>`;
  const home=path.join(dir,'index.html'),{document}=parseHTML(fs.readFileSync(home,'utf8'));
  const old=document.querySelector('.rn-editor-grid')?.closest('section');
  const latest=notes.find(n=>n.published);
  if(old){old.insertAdjacentHTML('beforebegin',`${latest?`<section class="rn-discovery-section rn-latest-note"><h2>최신 글</h2>${card(latest)}</section>`:''}${section}`);old.remove();}
  decorate(document);fs.writeFileSync(home,document.toString());
  const blog=path.join(dir,'blog/index.html'),{document:listing}=parseHTML(fs.readFileSync(blog,'utf8'));
  const nav=listing.querySelector('.rn-category-tabs');
  if(nav)nav.innerHTML=`<a href="/blog/" aria-current="page">전체</a>${active.map(key=>`<a href="/series/${key}/">${series[key].name}</a>`).join('')}<a href="#daily-notes">데일리 노트</a>`;
  const grid=listing.querySelector('.rn-editor-grid');if(grid){grid.innerHTML=notes.map(card).join('');grid.classList.add('rn-series-grid');}
  listing.querySelector('.rn-daily-list')?.closest('section')?.setAttribute('id','daily-notes');
  decorate(listing);fs.writeFileSync(blog,listing.toString());
  for(const n of notes){const {document:article}=parseHTML(fs.readFileSync(n.file,'utf8'));const others=groups[n.series].filter(p=>p.url!==n.url).slice(0,3);if(others.length){const html=`<section class="rn-series-related"><h2>이 시리즈의 다른 노트</h2><ul>${others.map(p=>`<li><a href="${p.url}">${e(p.title)}</a></li>`).join('')}</ul></section>`;const related=article.querySelector('#rn-related');if(related)related.insertAdjacentHTML('beforebegin',html);else article.querySelector('article').insertAdjacentHTML('beforeend',html);}fs.writeFileSync(n.file,article.toString());}
  for(const key of ['',...Object.keys(series)]){const file=path.join(dir,'series',key,'index.html');const {document:d}=parseHTML(fs.readFileSync(file,'utf8'));decorate(d);fs.writeFileSync(file,d.toString());}
  return {notes:notes.length,series:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length]))};
}
