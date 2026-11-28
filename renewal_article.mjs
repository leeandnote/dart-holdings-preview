import {parseHTML} from 'linkedom';

const clean = value => value.replace(/\s+/g,' ').trim();
const escape = value => value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categories = {'5percent':'5%보고','executives':'임원보고','contracts':'대형수주','major-events':'투자판단','issues':'공시 해설'};
const nodes = document => [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(script=>{
  try {const value=JSON.parse(script.textContent);return Array.isArray(value)?value:value['@graph']||[value];} catch {return [];}
});

export function measureArticle(document) {
  const article=document.querySelector('article');
  const body=article?.querySelector('.articleBody');
  if(!body) return null;
  const prose=body.cloneNode(true);
  prose.querySelectorAll('table,figure,script,style,nav,.rn-author,.rn-toc,.rn-compact-toc,.rn-references,.rn-article-cta').forEach(n=>n.remove());
  const bodyChars=clean(prose.textContent).length;
  const headings=[...body.querySelectorAll('h2')].filter(n=>!n.closest('nav'));
  const faq=[...body.querySelectorAll('.issueFaq h3,.issueFaq .rn-faq summary')];
  const sources=new Set([...body.querySelectorAll('a[href^="https://"]')].map(n=>n.getAttribute('href')));
  return {
    url:document.querySelector('link[rel="canonical"]')?.getAttribute('href')||'',
    bodyChars,h2Count:headings.length,questionHeadingRatio:headings.length?headings.filter(h=>/[?？]$/.test(h.textContent.trim())).length/headings.length:0,
    figures:body.querySelectorAll('figure').length+[...body.querySelectorAll('img,svg')].filter(n=>!n.closest('figure')).length,
    references:body.querySelectorAll('.rn-references li a[href^="https://"]').length,
    missingAlt:body.querySelectorAll('img:not([alt])').length,
    sourceLinks:sources.size,faqQuestions:faq.length,
    internalLinks:[...body.querySelectorAll('a[href]')].filter(a=>a.getAttribute('href').startsWith('/')).length,
    tables:[...body.querySelectorAll('table')].map(t=>t.querySelectorAll('tbody tr').length),
    gates:{stickyToc:headings.length>=4&&bodyChars>=3000,summary:bodyChars>=1500,faq:faq.length>=3,authorProfile:false},
  };
}

export function applyArticleDesign(document) {
  const article=document.querySelector('article');
  const body=article?.querySelector('.articleBody');
  if(!body)return null;
  // Editorial enrichment can reinsert the legacy contents into a styled article.
  if(article.getAttribute('data-rn-article')==='2'){
    if(article.querySelector('.rn-compact-toc,.rn-toc'))body.querySelectorAll('.guideContents').forEach(n=>n.remove());
    return null;
  }
  if(article.hasAttribute('data-rn-article')){
    article.querySelectorAll('.rn-author,.rn-breadcrumb,.rn-section-name,.rn-toc,.rn-mobile-toc,.rn-article-cta,.rn-editor-credit').forEach(n=>n.remove());
    document.querySelectorAll('.rn-scroll-cta').forEach(n=>n.remove());
    document.body.classList.remove('rn-has-toc');
  }
  const audit=measureArticle(document);
  article.setAttribute('data-rn-article','2');
  document.body.classList.add('rn-article');
  const url=audit.url, group=url.match(/\/blog\/([^/]+)\//)?.[1]||'issues';
  const daily=group!=='issues';
  const h1=article.querySelector('h1');
  if(daily&&h1)h1.textContent=h1.textContent.replace(/^\d{4}[.-]\d{2}[.-]\d{2}\s*[-–]?\s*/,'').replace(/\s*\|\s*(?:5%보고공시|임원.*|대형수주.*|투자판단.*)$/,'');
  article.querySelectorAll('.insightTabs').forEach(n=>n.remove());
  article.querySelectorAll('.articleBreadcrumb').forEach(n=>n.remove());
  const oldByline=article.querySelector('#editorial-byline');
  oldByline?.querySelectorAll('span').forEach(n=>{if(n.textContent.includes('이전 기록 미확인'))n.remove();});
  const titleArea=h1?.parentElement;
  if(titleArea) {
    const breadcrumb=document.createElement('nav');
    breadcrumb.className='rn-breadcrumb';breadcrumb.setAttribute('aria-label','이동 경로');
    breadcrumb.innerHTML=`<a href="/">홈</a><span>›</span><a href="/blog/">인사이트</a><span>›</span><a href="/blog/${escape(group)}/">${categories[group]||'공시 해설'}</a>`;
    const section=document.createElement('div');section.className='rn-section-name';section.textContent=article.hasAttribute('data-rn-institution')?'INVESTOR':daily?'DAILY NOTE':'INSIGHT';
    titleArea.prepend(breadcrumb);titleArea.prepend(section);
    const meta=document.createElement('div');meta.className='rn-author';
    const dates=nodes(document).find(n=>n['@type']==='Article');
    const basis=url.match(/\/(\d{4}-\d{2}-\d{2})(?:\/|$)/)?.[1];
    const published=dates?.datePublished,modified=dates?.dateModified;
    const dateText=[basis?`공시 기준 ${basis}`:'',published?`작성 ${String(published).slice(0,10)}`:'',modified&&published&&Date.parse(modified)>Date.parse(published)?`업데이트 ${String(modified).slice(0,10)}`:''].filter(Boolean).join(' · ');
    meta.innerHTML=`<img src="/assets/brand/leeandnote-avatar.png" width="56" height="56" alt="리앤노트 캐릭터"><div><strong>리앤노트 편집팀</strong><p>${escape(dateText)}${dateText?' · ':''}${Math.max(1,Math.ceil(audit.bodyChars/500))}분 읽기 · <a href="/editorial-policy">편집 기준</a></p></div>`;
    h1.after(meta);
    oldByline?.remove();
    titleArea.querySelectorAll('.postMeta,.postDate').forEach(n=>n.remove());
  }
  body.querySelectorAll('p').forEach(p=>{if(/^작성·편집:/.test(clean(p.textContent)))p.remove();});
  body.querySelectorAll('.guideContents').forEach(old=>{
    if(audit.gates.stickyToc){old.remove();return;}
    const details=document.createElement('details'),summary=document.createElement('summary');
    details.className='rn-compact-toc';summary.textContent='이 글에서 확인할 내용';details.append(summary);
    const list=old.querySelector('ol');if(list)details.append(list);old.replaceWith(details);
  });
  if(!audit.gates.summary)body.querySelectorAll('.summaryBox').forEach(n=>{
    const p=document.createElement('p');p.className='rn-intro';p.innerHTML=n.innerHTML;n.replaceWith(p);
  });
  if(audit.gates.stickyToc) {
    const toc=document.createElement('nav');toc.className='rn-toc';toc.setAttribute('aria-label','이 글의 목차');
    const title=document.createElement('strong');title.textContent='이 글에서';toc.append(title);
    body.querySelectorAll('h2').forEach((h,i)=>{
      if(!h.id)h.id=`rn-section-${i+1}`;
      const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;toc.append(a);
    });
    article.append(toc);document.body.classList.add('rn-has-toc');
    const compact=document.createElement('details');compact.className='rn-compact-toc rn-mobile-toc';
    compact.innerHTML='<summary>이 글의 목차</summary>'+[...toc.querySelectorAll('a')].map(a=>a.outerHTML).join('');
    body.prepend(compact);
  }
  // Convert only matching visible FAQ content. Schema remains byte-for-byte unchanged.
  const schema=nodes(document).find(n=>n['@type']==='FAQPage');
  const questions=[...body.querySelectorAll('.issueFaq h3')];
  const matches=audit.gates.faq&&schema?.mainEntity?.length===questions.length&&questions.every((h,i)=>clean(h.textContent)===clean(schema.mainEntity[i].name)&&clean(h.nextElementSibling?.textContent||'')===clean(schema.mainEntity[i].acceptedAnswer?.text||''));
  if(matches) questions.forEach(h=>{
    const answer=h.nextElementSibling,details=document.createElement('details'),summary=document.createElement('summary');
    summary.textContent=h.textContent;details.className='rn-faq';h.before(details);details.append(summary,answer);h.remove();
  });
  audit.faqSchemaMatched=Boolean(matches);
  body.querySelectorAll('table').forEach(table=>{
    const rows=[...table.querySelectorAll('tbody tr')];
    const headers=[...table.querySelectorAll('thead th')];
    if(rows.length===1&&!table.querySelector('[colspan],[rowspan]')) {
      const list=document.createElement('dl');list.className='rn-single-record';
      [...rows[0].children].forEach((cell,i)=>{
        const dt=document.createElement('dt'),dd=document.createElement('dd');
        dt.textContent=headers[i]?.textContent||'내용';dd.innerHTML=cell.innerHTML;list.append(dt,dd);
      });table.replaceWith(list);return;
    }
    if(!rows.length)return;
    if(!table.closest('.rn-table-scroll')) {
      const wrap=document.createElement('div');wrap.className='rn-table-scroll';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','공시 데이터 표');
      table.before(wrap);wrap.append(table);
    }
    // Preserve source links, spanning cells and identifier columns; collapse only identical plain text columns.
    if(rows.length>=2&&!table.querySelector('[colspan],[rowspan]')) {
      const constants=[];
      for(let i=headers.length-1;i>0;i--){
        const cells=rows.map(r=>r.children[i]);
        if(cells.some(c=>!c||c.querySelector('a,img,svg')))continue;
        const values=cells.map(c=>clean(c.textContent));
        if(values[0]&&values.every(v=>v===values[0])){constants.unshift(`${clean(headers[i].textContent)}: ${values[0]}`);cells.forEach(c=>c.remove());headers[i].remove();}
      }
      if(constants.length){const p=document.createElement('p');p.className='rn-table-context';p.textContent=constants.join(' · ');table.parentElement.before(p);}
    }
  });
  const cta=document.createElement('section');cta.className='rn-article-cta';cta.innerHTML='<h2>다음 공시도 놓치지 않도록</h2><p>리앤노트 텔레그램에서 실시간 공시를 확인하세요.</p><a href="https://t.me/leeandnote" target="_blank" rel="noopener noreferrer">텔레그램 알림 받기 →</a>';
  const editor=document.createElement('section');editor.className='rn-editor-credit';editor.innerHTML='<h2><a href="/editor/fox/">리앤노트 편집팀</a></h2><p>DART 원문과 공식 자료를 바탕으로 공시를 정리합니다.</p><a href="/editor/fox/">편집팀의 해설 전체 보기 →</a>';article.append(editor);
  article.append(cta);
  const floating=document.createElement('aside');floating.className='rn-scroll-cta';floating.hidden=true;
  floating.innerHTML='<span>새 공시를 텔레그램에서 확인하세요.</span><a href="https://t.me/leeandnote" target="_blank" rel="noopener noreferrer">알림 받기 →</a><button type="button" data-rn="dismiss-cta" aria-label="알림 안내 닫기"><img src="/assets/icons/x.svg" width="20" height="20" alt=""></button>';
  document.body.append(floating);
  return audit;
}

export function auditHtml(html){return measureArticle(parseHTML(html).document);}
