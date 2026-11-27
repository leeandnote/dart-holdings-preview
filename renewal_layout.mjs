import fs from 'node:fs';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { applyArticleDesign, auditHtml } from './renewal_article.mjs';

const icon = name => `<img src="/assets/icons/${name}.svg" alt="" width="22" height="22">`;
const links = [['5%보고','/5percent'],['임원보고','/executives'],['대형수주','/contracts'],['투자판단','/major-events'],['주요 일정','/calendar'],['인사이트','/blog/']];
const socials = [['TG','텔레그램','https://t.me/leeandnote'],['IG','인스타그램','https://www.instagram.com/leeandnote/'],['@','스레드','https://www.threads.com/@leeandnote'],['YT','유튜브','https://www.youtube.com/@%EB%A6%AC%EC%95%A4%EB%85%B8%ED%8A%B8'],['N','블로그','https://blog.naver.com/leeandnote']];
const socialIcons = {TG:'send',IG:'instagram','@':'threads',YT:'youtube',N:'blog'};
const socialLinks = () => socials.map(([mark,name,url]) => `<a href="${url}" target="_blank" rel="noopener noreferrer" title="${name} (새 창)" aria-label="${name} (새 창)"${mark==='TG'?' class="rn-telegram"':''}><span>${icon(socialIcons[mark])}</span><small>${name}</small></a>`).join('');
const button = (action,name,image) => `<button type="button" data-rn="${action}" aria-label="${name}" title="${name}">${icon(image)}</button>`;

export function seoSnapshot(html) {
  const {document} = parseHTML(html);
  return [...document.querySelectorAll('title,meta,link[rel="canonical"],link[rel="alternate"],script[type="application/ld+json"]')].map(n=>n.outerHTML);
}

export function applyRenewalLayout(html) {
  const {document} = parseHTML(html);
  if (!document.body) return html;
  if (document.querySelector('#rn-header')) {
    applyArticleDesign(document);
    return document.toString();
  }
  // Only replace site chrome: article headers, source footers and structured data remain intact.
  document.querySelectorAll('header.topbar,#channel-menu,.channelMenu,footer.minimalFooter,footer.siteFooter').forEach(n=>n.remove());
  document.querySelectorAll('link[href="/channel-menu.css"],script[src="/channel-menu.js"]').forEach(n=>n.remove());
  document.body.classList.add('rn-site');
  applyArticleDesign(document);
  const top = document.createElement('div');
  top.innerHTML = `<aside class="rn-announcement" id="rn-announcement"><a href="https://t.me/leeandnote" target="_blank" rel="noopener noreferrer">요즘 공시가 궁금할 때, 리앤노트 텔레그램 알림 받기 →</a>${button('dismiss-banner','알림 배너 닫기','x')}</aside><header id="rn-header"><div class="rn-nav-inner"><a class="rn-logo" href="/" aria-label="리앤노트 홈"><img src="/assets/brand/wordmark-light.png" width="724" height="201" alt="LEE&NOTE"></a><nav id="rn-navigation" aria-label="주요 카테고리">${links.map(([name,url])=>`<a href="${url}">${name}</a>`).join('')}</nav><div class="rn-header-tools">${button('search','공시 검색','search')}<button type="button" data-rn="menu" aria-label="메뉴" aria-controls="rn-navigation" aria-expanded="false">${icon('menu')}</button></div></div></header>`;
  document.body.prepend(...top.childNodes);
  const bottom = document.createElement('div');
  bottom.innerHTML = `<footer class="rn-footer"><div><a class="rn-logo" href="/" aria-label="리앤노트 홈"><img src="/assets/brand/wordmark-light.png" width="724" height="201" alt="LEE&NOTE"></a><p>DART 원문을 바탕으로 공시를 읽고 정리합니다.</p><nav aria-label="사이트 정책"><a href="/about">소개</a><a href="/editorial-policy">편집 기준</a><a href="/contact">문의</a><a href="/privacy">개인정보처리방침</a></nav><nav class="rn-footer-social" aria-label="공식 채널">${socialLinks()}</nav><p class="rn-disclaimer">본 콘텐츠는 정보 제공 목적이며 투자 권유가 아닙니다. 투자 판단과 그 결과의 책임은 투자자 본인에게 있습니다.</p><small>© LEE&NOTE</small></div></footer><aside class="rn-quick" aria-label="바로가기"><nav>${socialLinks()}${button('search','공시 검색','search')}</nav>${button('top','맨 위로','arrow-up')}</aside><nav class="rn-mobile-bar" aria-label="모바일 바로가기"><a href="/blog/">${icon('book-open')}<small>인사이트</small></a><button type="button" data-rn="search">${icon('search')}<small>검색</small></button><a class="rn-telegram" href="https://t.me/leeandnote" target="_blank" rel="noopener noreferrer">${icon('send')}<small>텔레그램</small></a><button type="button" data-rn="social">${icon('share-2')}<small>SNS</small></button><button type="button" data-rn="top">${icon('arrow-up')}<small>TOP</small></button></nav><dialog id="rn-search" class="rn-dialog" aria-labelledby="rn-search-title"><div class="rn-dialog-head"><h2 id="rn-search-title">공시 검색</h2>${button('close','닫기','x')}</div><form action="/5percent" method="get"><label for="rn-query">종목명 · 제출인 · 보고 사유</label><div class="rn-search-field"><input id="rn-query" name="q" type="search" required maxlength="120" autocomplete="off"><button type="submit" aria-label="검색">${icon('search')}</button></div></form></dialog><dialog id="rn-social" class="rn-dialog" aria-labelledby="rn-social-title"><div class="rn-dialog-head"><h2 id="rn-social-title">리앤노트 공식 채널</h2>${button('close','닫기','x')}</div><nav class="rn-social-list">${socialLinks()}</nav></dialog>`;
  document.body.append(...bottom.childNodes);
  document.querySelector('#rn-search form').setAttribute('action','/search/');
  document.querySelector('#rn-search-title').textContent='통합검색';
  document.querySelector('label[for="rn-query"]').textContent='종목 · 코드 · 보고자 · 공시 해설';
  const css=document.createElement('link'); css.rel='stylesheet'; css.href='/renewal.css'; document.head.append(css);
  const js=document.createElement('script'); js.src='/renewal.js'; js.defer=true; document.body.append(js);
  return document.toString();
}

export function applyRenewalLayouts(dir) {
  let count=0;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()) count+=applyRenewalLayouts(file);
    else if(entry.name.endsWith('.html')) {
      const before=fs.readFileSync(file,'utf8'), after=applyRenewalLayout(before);
      const audit=auditHtml(before);if(audit)console.log('CONTENT_GATES='+JSON.stringify(audit));
      if(JSON.stringify(seoSnapshot(before))!==JSON.stringify(seoSnapshot(after))) throw new Error(`SEO changed: ${file}`);
      fs.writeFileSync(file,after); count++;
    }
  }
  return count;
}
