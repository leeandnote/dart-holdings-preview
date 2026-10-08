import fs from 'node:fs';
import path from 'node:path';

const origin = 'https://leeandnote.com';
const pages = {
  '/': ['주식 공시 검색 · 지분변동·수주·투자판단 | 리앤노트', 'DART 전자공시를 5% 지분보고, 임원·주요주주, 단일판매·공급계약과 투자판단 주요경영사항으로 나누어 확인한다. 종목별 공시와 요약 분석을 연결한다.'],
  '/5percent': ['5% 지분보고 공시 · 대량보유·지분변동 검색 | 리앤노트', '주식 대량보유상황보고에서 신규 5% 보유와 지분 증가·감소를 확인한다. 종목명, 보고자, 보유비율 변동과 DART 원문을 비교한다.'],
  '/executives': ['임원·주요주주 주식 보유변동 공시 | 리앤노트', '임원·주요주주의 보유주식수와 지분율 변동 공시를 확인한다. 종목과 보고자별 변동 내역을 비교하고 DART 원문으로 연결한다.'],
  '/contracts': ['대형수주 공시 · 단일판매·공급계약 검색 | 리앤노트', '기업의 단일판매·공급계약 공시를 계약금액, 매출액 대비 비중, 계약상대방과 계약기간으로 비교한다. 대형수주 내역과 DART 원문을 확인한다.'],
  '/major-events': ['투자판단 공시 · 임상·기술수출·주요경영사항 | 리앤노트', '투자판단 관련 주요경영사항에서 임상시험·IND, 기술수출, 수주와 소송 등 주요 사건을 확인한다. 핵심 내용·수치와 공시 원문을 함께 제공한다.'],
  '/calendar': ['증시 일정 달력 · 금리·CPI·PCE·선물옵션 만기 | 리앤노트', '한국은행·일본은행·FOMC, 미국 CPI·PCE·고용·GDP, 지수 정기변경과 선물옵션 만기 일정을 확인한다. 공식 출처·확인일과 한국시간을 구분해 제공한다.'],
  '/blog/': ['주식 공시 분석 블로그 · 지분변동·수주·임상 | 리앤노트', '5%보고, 임원·주요주주, 대형수주와 투자판단 공시의 일별 요약과 이슈 분석을 읽는다. 주요 수치와 DART 원문을 바탕으로 공시 내용을 정리한다.'],
  '/disclosurepedia/': ['공시피디아 · 종목별 주식 공시 모아보기 | 리앤노트', '종목별 지분변동, 임원·주요주주, 수주와 투자판단 공시를 모아 확인한다. 관련 공시 원문과 분석 글을 연결하는 주식 공시 자료실이다.'],
};
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const decode = value => value.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>');

export function metadata(html, relative) {
  if (!/<head\b/i.test(html)) return html;
  // Restrict edits to generator-owned head tags; never rewrite article markup or JSON-LD.
  return html.replace(/(<head\b[^>]*>)([\s\S]*?)(<\/head>)/i, (_, start, head, end) => {
    const meta = (key) => {
      const tag = [...head.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]).find(tag=>new RegExp(`(?:name|property)=["']${key}["']`,'i').test(tag));
      return tag?.match(/content=["']([^"']*)["']/i)?.[1] || '';
    };
    let url = head.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1];
    let route = '/' + relative.replaceAll('\\','/').replace(/index\.html$/, '');
    if (route === '/blog.html') route = '/blog/';
    if (pages[route.replace(/\.html$/, '')]) route = route.replace(/\.html$/, '');
    url = url || origin + route;
    const pathname = new URL(decode(url), origin).pathname;
    const config = pages[pathname] || pages[pathname.replace(/\/$/, '')];
    const title = config?.[0] || decode(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '리앤노트');
    const description = config?.[1] || decode(meta('description'));
    const image = decode(meta('og:image') || meta('twitter:image')) || origin + '/assets/leeandnote-mark.png';
    const type = decode(meta('og:type')) || (/"@type"\s*:\s*"Article"/.test(head) ? 'article' : 'website');
    const card = meta('twitter:card') || 'summary';
    const names = new Set(['description','og:title','og:description','og:url','og:image','og:type','og:site_name','og:locale','twitter:title','twitter:description','twitter:image','twitter:card']);
    head = head.replace(/<title[^>]*>[\s\S]*?<\/title>/gi,'').replace(/<meta\b[^>]*>/gi, tag => {
      const name = tag.match(/(?:name|property)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
      return names.has(name) ? '' : tag;
    }).replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi,'');
    const tags = [`<title>${escape(title)}</title>`, `<link rel="canonical" href="${escape(decode(url))}">`];
    const values = {'description':description,'og:title':title,'og:description':description,'og:url':decode(url),'og:image':new URL(image,origin).href,'og:type':type,'og:site_name':'리앤노트','og:locale':'ko_KR','twitter:title':title,'twitter:description':description,'twitter:image':new URL(image,origin).href,'twitter:card':card};
    for (const [key,value] of Object.entries(values)) if(value) tags.push(`<meta ${key.startsWith('og:')?'property':'name'}="${key}" content="${escape(value)}">`);
    return start + head + '\n' + tags.join('\n') + '\n' + end;
  });
}

export function applySiteMetadata(directory) {
  let count = 0;
  function visit(dir) {
    for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
      const file = path.join(dir,entry.name);
      if(entry.isDirectory()) visit(file);
      else if(entry.name.endsWith('.html') && entry.name !== '404.html') {
        const html = fs.readFileSync(file,'utf8');
        fs.writeFileSync(file,metadata(html,path.relative(directory,file)),'utf8');
        count++;
      }
    }
  }
  visit(directory);
  console.log(`SEO_METADATA_PAGES=${count}`);
}
