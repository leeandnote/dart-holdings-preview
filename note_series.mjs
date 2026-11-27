import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseDocument} from 'yaml';
import {marked} from 'marked';
import {parseHTML} from 'linkedom';
import {terms} from './term_pages.mjs';
const existingTerms=new Set(terms.map(t=>t.slug));

export const series = {
  disclosure:{name:'공시 해부',badge:'DISCLOSURE',description:'공시 한 종류를 처음부터 끝까지 읽습니다.',min:5000,figures:2,references:2,faq:5,color:'#171b20',ink:'#ffffff'},
  term:{name:'용어 한 입',badge:'TERM',description:'실제 공시 사례로 용어 하나를 이해합니다.',min:1800,max:2500,tables:1,faq:3,color:'#faf4e8',ink:'#171b20'},
  policy:{name:'제도 노트',badge:'POLICY & LAW',description:'현행 법령과 정책을 원문으로 확인합니다.',min:4000,references:1,color:'#df4100',ink:'#ffffff'},
  investor:{name:'큰손 노트',badge:'INVESTOR',description:'기관과 펀드의 공시상 지분 변화를 살펴봅니다.',min:3000,figures:2,color:'#edf0f2',ink:'#171b20'},
  weekly:{name:'이번 주 공시',badge:'WEEKLY EXHIBIT',description:'한 주의 공시를 데이터와 도표로 정리합니다.',min:3000,figures:5,color:'#171b20',ink:'#ffffff'},
  basics:{name:'기초 노트',badge:'BASICS',description:'투자자가 알아둘 주식과 제도의 기초입니다.',min:2500,max:3500,color:'#faf4e8',ink:'#171b20'},
  calendar:{name:'다음 주 캘린더',badge:'CALENDAR',description:'공식 출처로 확인한 다음 주 일정입니다.',min:1500,tables:1,color:'#ffffff',ink:'#171b20'},
};
export const legacySeries={
  'how-to-read-dart-disclosures':['disclosure',1],
  'ownership-rate-vs-share-count':['disclosure',2],
  'contract-value-vs-revenue':['disclosure',3],
  'biotech-clinical-trials':['disclosure',4],
  'convertible-bond-refixing-guide':['disclosure',5],
  'rights-offering-disclosure-guide':['disclosure',6],
  'treasury-stock-buyback-disclosures':['disclosure',7],
  'national-pension-stock-holdings':['investor',1],
  'jpmorgan-five-percent-holdings':['investor',2],
  'samsung-electronics-executive-shareholdings':['investor',3],
  'vip-asset-holdings':['investor',4],
};
export const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export const safeSlug=s=>typeof s==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
export const isoDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const timestamp=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s));
const json=data=>JSON.stringify(data).replaceAll('<','\\u003c');
export const origin='https://leeandnote.com';
export const kstDate=value=>new Date(Date.parse(value)+9*3600000).toISOString().slice(0,10);
export function readNote(file){
  const source=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');
  const match=source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if(!match)throw new Error(`Missing YAML frontmatter: ${file}`);
  const yaml=parseDocument(match[1],{uniqueKeys:true});
  if(yaml.errors.length)throw new Error(`Invalid YAML: ${file}`);
  const meta=yaml.toJS({maxAliasCount:0}),slug=path.basename(file,'.md');
  if(!safeSlug(slug)||!meta||Array.isArray(meta)||typeof meta!=='object')throw new Error(`Invalid note: ${file}`);
  return {slug,meta,body:match[2],file};
}
export function noteHash(note){
  const {review,...meta}=note.meta;
  const sort=value=>Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])])):value;
  return createHash('sha256').update(JSON.stringify({meta:sort(meta),body:note.body.replaceAll('\r\n','\n')})).digest('hex');
}
export function renderMarkdown(body){
  const {document}=parseHTML(`<html><body>${marked.parse(body)}</body></html>`);
  document.querySelectorAll('script,style,iframe,object,embed,form,input,button,link,meta').forEach(n=>n.remove());
  for(const n of document.querySelectorAll('*'))for(const a of [...n.attributes]){
    if(/^on/i.test(a.name)||['style','srcdoc'].includes(a.name))n.removeAttribute(a.name);
    if(['href','src','xlink:href'].includes(a.name)&&!(/^(https:\/\/|\/(?!\/)|#)/.test(a.value)))n.removeAttribute(a.name);
  }
  return document.body.innerHTML;
}
export function validateNote(note,now=new Date().toISOString()){
  const {meta:m}=note,cfg=series[m.series],errors=[];
  const html=renderMarkdown(note.body),{document}=parseHTML(`<html><body>${html}</body></html>`);
  const prose=document.body.cloneNode(true);prose.querySelectorAll('table,figure,nav,pre').forEach(n=>n.remove());
  const chars=prose.textContent.replace(/\s/g,'').length;
  const metrics={chars,figures:document.querySelectorAll('figure').length,tables:document.querySelectorAll('table').length,faq:document.querySelectorAll('[data-faq] h3,[data-faq] summary').length};
  const refs=Array.isArray(m.references)?m.references:[];
  if(!Array.isArray(m.references))errors.push('references must be an array');
  if(!cfg)errors.push('unknown series');
  if(!Number.isInteger(m.series_no)||m.series_no<1)errors.push('series_no must be positive');
  if(typeof m.title!=='string'||!m.title.trim()||typeof m.subtitle!=='string'||!m.subtitle.trim())errors.push('title and subtitle required');
  if(!timestamp(m.publish_at))errors.push('publish_at requires timezone');
  if(!Array.isArray(m.related_terms)||m.related_terms.some(t=>!safeSlug(t)))errors.push('related_terms must be slug array');
  if(cfg){
    if(chars<cfg.min||(cfg.max&&chars>cfg.max))errors.push(`prose length ${chars} outside ${cfg.min}..${cfg.max||'unlimited'}`);
    for(const key of ['figures','tables','faq'])if(metrics[key]<(cfg[key]||0))errors.push(`${key} requires ${cfg[key]}`);
    if(refs.length<(cfg.references||0))errors.push(`references requires ${cfg.references}`);
  }
  for(const r of refs)if(!r||typeof r.title!=='string'||!/^https:\/\//.test(r.url||'')||!isoDate(r.checked_at)||r.checked_at>kstDate(now))errors.push('reference needs HTTPS title and checked_at');
  if(m.series==='policy'){
    if(!isoDate(m.basis_date)||m.basis_date>m.publish_at?.slice(0,10))errors.push('policy basis_date required');
    const official=refs.filter(r=>{try{return /(^|\.)(law.go.kr|fsc.go.kr|fss.or.kr|krx.co.kr)$/.test(new URL(r.url).hostname)&&typeof r.quote==='string'&&r.quote.trim();}catch{return false;}});
    if(!official.length)errors.push('policy requires official original quotation');
  }
  const receipts=[...new Set([...document.querySelectorAll('a[href]')].map(n=>n.getAttribute('href')).filter(u=>/^https:\/\/dart\.fss\.or\.kr\/dsaf001\/main\.do\?rcpNo=\d{14}$/.test(u)))];
  if(m.series==='investor'&&receipts.length<10)errors.push('investor requires ten distinct DART receipts');
  if(m.series==='term'&&(!receipts.length||typeof m.definition!=='string'||!m.definition.trim()))errors.push('term requires definition and actual DART example');
  if(['weekly','calendar'].includes(m.series)&&(!isoDate(m.period_start)||!isoDate(m.period_end)||m.period_start>m.period_end))errors.push('period_start/end required');
  if(m.series==='weekly'&&m.period_end>=m.publish_at?.slice(0,10))errors.push('weekly cutoff must precede publication date');
  const r=m.review;
  if(r?.status!=='approved'||typeof r.reviewer!=='string'||!r.reviewer.trim()||!timestamp(r.reviewed_at)||Date.parse(r.reviewed_at)>Date.parse(now)||r.content_sha256!==noteHash(note))errors.push('human approval missing or content changed after review');
  const due=timestamp(m.publish_at)&&Date.parse(m.publish_at)<=Date.parse(now);
  return {html,metrics,errors,due,ready:errors.length===0,readingMinutes:Math.max(1,Math.ceil(chars/500))};
}
export function loadNotes(root='content/notes'){
  if(!fs.existsSync(root))return [];
  const notes=fs.readdirSync(root).filter(f=>f.endsWith('.md')).sort().map(f=>readNote(path.join(root,f)));
  const numbers=new Set();
  for(const n of notes){const key=`${n.meta.series}:${n.meta.series_no}`;if(numbers.has(key))throw new Error(`Duplicate series number ${key}`);numbers.add(key);
    const reserved=Object.entries(legacySeries).find(([slug,[s,no]])=>s===n.meta.series&&no===n.meta.series_no&&slug!==n.slug);if(reserved)throw new Error(`Reserved legacy number ${key}`);
  }
  return notes;
}
export function pageHtml(title,url,body,schema,description='',noindex=false){return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} | 리앤노트</title><meta name="description" content="${escape(description)}"><meta name="robots" content="${noindex?'noindex, follow':'index, follow'}"><link rel="canonical" href="${origin+url}"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${json(schema)}</script></head><body><main class="rn-discovery">${body}</main></body></html>`;}
export function writePage(dir,url,html){const file=path.join(dir,url,'index.html');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,html);return file;}
// Run after legacy editorial processing, before discovery/search/sitemaps. Drafts never enter dist.
export function publishNotes(dir,{notes=loadNotes(),now=new Date().toISOString()}={}){
  const historyFile=path.join(dir,'data/blog-editorial.json');
  const history=fs.existsSync(historyFile)?JSON.parse(fs.readFileSync(historyFile,'utf8')):{version:1,entries:{}};
  const published=[],held=[];
  for(const n of notes){
    const v=validateNote(n,now),url=`/blog/issues/${n.slug}/`,target=path.join(dir,url,'index.html');
    if(!v.ready||!v.due){
      if(history.entries[origin+url]?.noteHash)throw new Error(`Previously published note requires a reviewed due revision: ${n.slug}`);
      // A scheduled rewrite must not retract an already-published legacy article.
      if(!legacySeries[n.slug]){
        if(fs.existsSync(target))fs.rmSync(path.dirname(target),{recursive:true});
        const term=path.join(dir,'stock-terms',n.slug);if(!existingTerms.has(n.slug)&&fs.existsSync(term))fs.rmSync(term,{recursive:true});
        fs.rmSync(path.join(dir,'assets/series',n.slug+'.png'),{force:true});
        delete history.entries[origin+url];
      }
      held.push({slug:n.slug,publish_at:n.meta.publish_at,errors:v.errors,scheduled:!v.due});continue;
    }
    const m=n.meta,previous=history.entries[origin+url],hash=noteHash(n);
    for(const slug of m.related_terms)if(!fs.existsSync(path.join(dir,'stock-terms',slug,'index.html')))throw new Error(`Related term unavailable: ${slug}`);
    const publishedAt=previous?.publishedAt||now;
    const modifiedAt=previous?.noteHash===hash?previous.modifiedAt:now;
    const schema={'@context':'https://schema.org','@type':'Article',headline:m.title,description:m.subtitle,datePublished:publishedAt,dateModified:modifiedAt,inLanguage:'ko-KR',mainEntityOfPage:origin+url,author:{'@type':'Organization',name:'리앤노트',url:origin+'/about'},publisher:{'@type':'Organization',name:'리앤노트',url:origin+'/about'},citation:m.references?.map(r=>r.url)||[]};
    const references=(m.references||[]).map(r=>`<li><a href="${escape(r.url)}">${escape(r.title)}</a> · 확인 ${escape(r.checked_at)}${r.quote?`<blockquote>${escape(r.quote)}</blockquote>`:''}</li>`).join('');
    const body=`<article data-note-series="${m.series}" data-note-number="${m.series_no}"><header class="titleArea"><h1>${escape(m.title)}</h1><p>${escape(m.subtitle)}</p>${m.basis_date?`<p>기준일 <time>${escape(m.basis_date)}</time></p>`:''}${m.period_start?`<p>대상 기간 ${escape(m.period_start)} ~ ${escape(m.period_end)}</p>`:''}</header><div class="articleBody">${v.html}${references?`<section class="rn-references"><h2>참고문헌</h2><ol>${references}</ol></section>`:''}${m.related_terms.length?`<p>관련 용어: ${m.related_terms.map(t=>`<a href="/stock-terms/${t}/">${escape(t)}</a>`).join(' · ')}</p>`:''}<p class="rn-investment-notice">정보 제공을 위한 자료이며 종목 추천이나 매수 권유가 아닙니다. 투자 판단의 책임은 투자자 본인에게 있습니다.</p></div></article>`;
    writePage(dir,url,pageHtml(m.title,url,body,schema,m.subtitle));
    history.entries[origin+url]={...previous,publishedAt,modifiedAt,noteHash:hash};
    published.push({...n,validation:v,publishedAt,modifiedAt});
    if(m.series==='term'){
      const termUrl=`/stock-terms/${n.slug}/`;
      writePage(dir,termUrl,pageHtml(m.title,termUrl,`<h1>${escape(m.title)}</h1><p>${escape(m.definition)}</p><a href="${url}">자세히 읽기 →</a>`,{'@context':'https://schema.org','@type':'DefinedTerm',name:m.title,description:m.definition,url:origin+termUrl},m.definition));
      const {document}=parseHTML(fs.readFileSync(target,'utf8'));document.querySelector('.articleBody').insertAdjacentHTML('beforeend',`<p><a href="${termUrl}">용어 사전에서 보기</a></p>`);fs.writeFileSync(target,document.toString());
      for(const hub of ['stock-terms.html','stock-terms/index.html']){
        const hubFile=path.join(dir,hub);if(!fs.existsSync(hubFile))continue;
        const {document:hubDoc}=parseHTML(fs.readFileSync(hubFile,'utf8'));
        if(!hubDoc.querySelector(`a[href="${termUrl}"]`)){
          let list=hubDoc.querySelector('#individual-terms ul');
          if(!list){hubDoc.querySelector('main').insertAdjacentHTML('beforeend','<section id="individual-terms"><h2>용어별 상세 해설</h2><ul></ul></section>');list=hubDoc.querySelector('#individual-terms ul');}
          list.insertAdjacentHTML('beforeend',`<li><a href="${termUrl}">${escape(m.title)}</a></li>`);
          fs.writeFileSync(hubFile,hubDoc.toString());
        }
      }
    }
  }
  fs.mkdirSync(path.dirname(historyFile),{recursive:true});fs.writeFileSync(historyFile,JSON.stringify(history));
  fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/note-queue.json',JSON.stringify({checkedAt:now,published:published.map(n=>n.slug),held},null,2));
  return published;
}
export function assertPrivateNotes(dir,{notes=loadNotes(),now=new Date().toISOString()}={}){
  const blocked=notes.filter(n=>!legacySeries[n.slug]&&(!validateNote(n,now).ready||!validateNote(n,now).due));
  const walk=root=>fs.readdirSync(root,{withFileTypes:true}).flatMap(n=>n.isDirectory()?walk(path.join(root,n.name)):[path.join(root,n.name)]);
  for(const file of walk(dir)){
    if(!/\.(html|json|xml|js|md)$/i.test(file))continue;
    const content=fs.readFileSync(file,'utf8');
    for(const n of blocked)if(content.includes(`/blog/issues/${n.slug}/`)||(!existingTerms.has(n.slug)&&content.includes(`/stock-terms/${n.slug}/`))||content.includes(`/assets/series/${n.slug}.png`))throw new Error(`Unpublished note exposed in ${file}: ${n.slug}`);
  }
  return blocked.length;
}
