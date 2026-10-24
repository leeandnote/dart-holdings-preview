import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {glossaryDetails,addGlossaryTab} from './glossary_detail.mjs';

const origin='https://leeandnote.com';
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const json=s=>JSON.stringify(s).replaceAll('<','\\u003c');
export function inheritAdSense(html,template){
  const tags=[...template.matchAll(/<meta\b[^>]*name="google-adsense-account"[^>]*>|<script\b[^>]*src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js[^"<>]*"[^>]*>[\s\S]*?<\/script>/gi)].map(m=>m[0]);
  const missing=tags.filter(tag=>tag.startsWith('<meta')?!html.includes('name="google-adsense-account"'):!html.includes('/pagead/js/adsbygoogle.js'));
  return html.replace('</head>',missing.join('')+'</head>');
}
export const termGroups={
  ownership:[
    ['보유비율과 지분율 변동폭은 어떻게 다른가?','보유비율은 전체 기준 주식 수에서 보유분이 차지하는 비율이다. 5%에서 6%로 바뀌면 변동폭은 1%포인트이며, 증가율 1%와는 다르다.'],
    ['보유주식수가 늘면 반드시 장내매수인가?','그렇지 않다. 증여·상속, 신주 취득, 전환권 행사 등으로도 늘 수 있다. 원문의 변동 사유와 세부 거래 내역을 확인해야 한다.'],
    ['공시 접수일이 실제 거래일인가?','접수일은 보고서가 제출된 날짜다. 실제 거래일이나 보고의무 발생일과 다를 수 있으므로 공시 당일 매매로 단정하지 않는다.'],
  ],
  contracts:[
    ['계약금액이 곧바로 매출로 잡히나?','계약 체결과 매출 인식은 다르다. 실제 수행·납품과 회계상 인식 조건에 따라 매출 반영 시점이 달라질 수 있다.'],
    ['매출액 대비 계약 비중은 무엇인가?','공시된 계약금액을 공시에 기재된 최근 매출액과 비교한 비율이다. 이익률이나 올해 매출 증가율을 뜻하지 않는다. 연결·별도 기준과 적용 연도를 함께 확인한다.'],
    ['수주 정정 공시에서 무엇을 비교해야 하나?','원계약과 비교해 금액, 계약기간, 상대방과 해지 여부가 어떻게 달라졌는지 확인한다. 정정 공시를 별도의 신규 수주로 더하면 중복 집계될 수 있다.'],
  ],
  clinical:[
    ['IND 신청·승인은 의약품 판매 허가인가?','아니다. 임상시험계획 신청·승인과 의약품 품목허가는 구분된다. 임상시험을 진행하는 단계이며 안전성·유효성 입증이나 상업화 성공을 보장하지 않는다.'],
    ['기술수출 총액과 마일스톤 수령액은 같은가?','다르다. 총 계약규모에는 조건 충족에 따라 지급될 수 있는 금액이 포함될 수 있다. 선급금, 실제 수령액, 조건부 마일스톤과 로열티를 구분해야 한다.'],
    ['임상 단계만으로 성공 가능성을 판단할 수 있나?','단계만으로 판단하기 어렵다. 적응증, 시험 설계, 평가변수, 대상자 수, 결과와 규제기관 판단을 함께 살펴야 한다.'],
  ],
  events:[
    ['투자판단 관련 주요경영사항은 어떤 공시인가?','계약, 임상, 소송 등 투자자가 확인할 필요가 있는 다양한 사건이 포함될 수 있다. 제목만으로 호재·악재를 판단하지 말고 주요 내용과 조건을 확인한다.'],
    ['우선협상대상자·낙찰자 선정이 계약 체결과 같은가?','동일하지 않다. 선정 후 협상이나 계약 절차가 남아 있을 수 있다. 계약 체결 여부와 후속 공시를 따로 확인한다.'],
    ['정정 공시가 나오면 기존 공시는 무효인가?','모든 내용이 무효가 되는 것은 아니다. 정정 대상 항목과 사유를 확인하고, 최신 정정 내용과 원공시를 함께 읽어야 한다.'],
  ],
};
const groupFor=url=>url.includes('/contracts/')?'contracts':/clinical|bio|pipeline/.test(url)?'clinical':url.includes('/major-events/')?'events':'ownership';
export function enhanceArticle(html,url,previous,now,canDateNew=false){
  if(!/<article(?:\s|>)/i.test(html)||html.includes('id="editorial-byline"'))return {html,entry:previous};
  const basis=url.match(/\/(\d{4}-\d{2}-\d{2})\/?$/)?.[1];
  // Generator refresh labels are not evidence of an actual publication or modification date.
  const semantic=(html.match(/<article[\s\S]*?<\/article>/i)?.[0]||'').replace(/<span class="postDate">[\s\S]*?<\/span>/g,'');
  const hash=createHash('sha256').update('editorial-v1'+semantic).digest('hex');
  const entry={hash,firstRecordedAt:previous?.firstRecordedAt||now,modifiedAt:previous?.hash===hash?previous.modifiedAt:now};
  if(previous?.publishedAt)entry.publishedAt=previous.publishedAt;
  else if(canDateNew&&!previous)entry.publishedAt=now;
  const author={'@type':'Organization','@id':origin+'/about.html#organization',name:'리앤노트',url:origin+'/about.html'};
  html=html.replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,(tag,body)=>{
    const data=JSON.parse(body),nodes=data['@graph']||[data];
    for(const node of nodes){if(['Article','BlogPosting','NewsArticle'].includes(node['@type'])){
      delete node.datePublished; if(entry.publishedAt)node.datePublished=entry.publishedAt;
      node.dateModified=entry.modifiedAt;node.author=author;node.publisher=author;
      node.mainEntityOfPage={'@type':'WebPage','@id':url};
      node.citation=[...new Set([...html.matchAll(/https:\/\/dart\.fss\.or\.kr\/dsaf001\/main\.do\?rcpNo=\d{14}/g)].map(m=>m[0]))].slice(0,20);
    }}
    return `<script type="application/ld+json">${json(data)}</script>`;
  });
  html=html.replace(/<meta\b[^>]*(?:name="author"|property="article:(?:published|modified)_time")[^>]*>/g,'');
  const breadcrumb={'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'홈',item:origin+'/'},{'@type':'ListItem',position:2,name:'공시 블로그',item:origin+'/blog/'},{'@type':'ListItem',position:3,name:(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]||'공시 분석').replace(/<[^>]*>/g,''),item:url}]};
  html=html.replace('</head>',`<link rel="stylesheet" href="/blog-editorial.css"><meta name="author" content="리앤노트"><meta property="article:modified_time" content="${entry.modifiedAt}">${entry.publishedAt?`<meta property="article:published_time" content="${entry.publishedAt}">`:''}<script type="application/ld+json">${json(breadcrumb)}</script></head>`);
  const time=value=>`<time datetime="${value}">${new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST</time>`;
  const byline=`<div id="editorial-byline" class="editorialByline"><span>작성·운영 <a rel="author" href="/about.html">리앤노트</a></span><span>${entry.publishedAt?'작성 '+time(entry.publishedAt):'최초 게시일: 이전 기록 미확인'}</span><span>수정 ${time(entry.modifiedAt)}</span>${basis?`<span>공시 기준일 <time datetime="${basis}">${basis}</time></span>`:''}<a href="/editorial-policy.html">편집·자동화 기준</a></div>`;
  html=html.replace(/(<h1[^>]*>[\s\S]*?<\/h1>)/,`$1${byline}`);
  html=html.replace(/<span class="postDate">· 최근 업데이트 [^<]*<\/span>/g,'');
  const group=groupFor(url);
  const qa=`<section id="term-qa" class="editorialTerms" aria-labelledby="term-qa-title"><h2 id="term-qa-title">이 글의 주식·공시 용어 Q&amp;A</h2>${termGroups[group].map(([q,a])=>`<section><h3>${esc(q)}</h3><p>${esc(a)}</p></section>`).join('')}<p class="editorialSources">용어 설명: 리앤노트 · 사실관계 확인: 본문에 연결된 DART 공시 원문<br><a href="/stock-terms.html#${group}">관련 용어 모아보기</a> · <a href="/contact.html">내용 오류 제보</a></p></section>`;
  html=html.replace('</article>',qa+'</article>');
  return {html,entry};
}

export async function applyBlogEditorial(dist,{remote=true,now=new Date().toISOString()}={}){
  let previous={},trusted=false;
  if(remote){
    const response=await fetch(origin+'/data/blog-editorial.json',{signal:AbortSignal.timeout(15000)});
    if(response.ok){
      const body=await response.json();
      if(body.version!==1||!body.entries||typeof body.entries!=='object')throw new Error('Invalid editorial history; refusing to overwrite publication records.');
      previous=body.entries;trusted=true;
    }else if(response.status!==404){throw new Error(`Editorial history unavailable (${response.status}); publication records must be preserved.`);}
  }
  const entries={...previous};let count=0;
  function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else if(item.name==='index.html'){
    const relative=path.relative(dist,file).replaceAll('\\','/'),url=origin+'/'+relative.replace(/index\.html$/,'');
    let html=fs.readFileSync(file,'utf8');
    if(!/<article(?:\s|>)/i.test(html)){
      html=html.replace(/(<meta property="og:type" content=")article("\s*\/?>)/g,'$1website$2');
      html=html.replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,(tag,body)=>{const d=JSON.parse(body);if(d['@type']==='Article'){d['@type']='CollectionPage';delete d.dateModified;delete d.author;}return `<script type="application/ld+json">${json(d)}</script>`;});
    }else{const result=enhanceArticle(html,url,previous[url],now,trusted);html=result.html;if(result.entry)entries[url]=result.entry;count++;}
    fs.writeFileSync(file,addGlossaryTab(html));
  }}}
  walk(path.join(dist,'blog'));
  const template=fs.readFileSync(path.join(dist,'blog/index.html'),'utf8');
  const topbar=template.match(/<header class="topbar">[\s\S]*?<\/header>/)?.[0]||'<a href="/blog/">공시 블로그</a>';
  const labels={ownership:'지분·임원보고',contracts:'수주·계약',clinical:'임상·기술수출',events:'투자판단·정정'};
  fs.writeFileSync(path.join(dist,'stock-terms.html'),`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>주식·공시 용어 Q&amp;A | 리앤노트</title><meta name="description" content="보유비율과 %포인트, 수주 계약금액, IND와 마일스톤, 정정 공시의 의미를 질문과 답변으로 정리한다."><link rel="canonical" href="${origin}/stock-terms.html"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/blog-editorial.css"></head><body>${topbar}<main class="termsPage"><h1>주식·공시 용어 Q&amp;A</h1><p>작성·운영 <a href="/about.html">리앤노트</a> · 설명 기준일 <time datetime="2026-10-22">2026-10-22</time></p><nav aria-label="용어 주제">${Object.entries(labels).map(([key,label])=>`<a href="#${key}">${label}</a>`).join('')}</nav>${Object.entries(termGroups).map(([key,qa])=>`<section class="editorialTerms" id="${key}"><h2>${labels[key]}</h2>${qa.map(([q,a])=>`<section><h3>${esc(q)}</h3><p>${esc(a)}</p></section>`).join('')}</section>`).join('')}<footer class="editorialTerms"><p>일반적인 개념 설명이며 개별 공시의 법적·회계적 판단을 대신하지 않는다. 실제 조건은 <a href="https://dart.fss.or.kr/">DART 공시 원문</a>과 정정 내역에서 확인한다.</p><p><a href="/editorial-policy.html">편집·자동화 기준</a> · <a href="/contact.html">내용 오류 제보</a> · <a href="/blog/">공시 블로그</a></p></footer></main></body></html>`);
  const glossaryPath=path.join(dist,'stock-terms.html');
  fs.writeFileSync(glossaryPath,inheritAdSense(glossaryDetails(fs.readFileSync(glossaryPath,'utf8'),termGroups),template));
  fs.writeFileSync(path.join(dist,'data/blog-editorial.json'),JSON.stringify({version:1,entries}));
  // Do not stamp every historical article with the date of the most recent data batch.
  const sitemap=path.join(dist,'sitemap.xml');
  if(fs.existsSync(sitemap))fs.writeFileSync(sitemap,fs.readFileSync(sitemap,'utf8').replace(/<url>[\s\S]*?<\/url>/g,block=>{const url=block.match(/<loc>([^<]+)<\/loc>/)?.[1];const entry=entries[url]||entries[url+'/'];return entry?block.replace(/<lastmod>[^<]*<\/lastmod>/,`<lastmod>${entry.modifiedAt}</lastmod>`):block;}));
  if(fs.existsSync(sitemap)){const text=fs.readFileSync(sitemap,'utf8');if(!text.includes('/stock-terms.html</loc>'))fs.writeFileSync(sitemap,text.replace('</urlset>',`<url><loc>${origin}/stock-terms.html</loc><lastmod>2026-10-22</lastmod></url></urlset>`));}
  return count;
}
