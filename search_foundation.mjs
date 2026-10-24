import fs from 'node:fs';
import path from 'node:path';
const origin='https://leeandnote.com';
const cleanPages=['about','editorial-policy','contact','privacy','terms','disclaimer','stock-terms'];
export function normalizeLinks(html){
  for(const page of cleanPages){
    html=html.replaceAll(`${origin}/${page}.html`,`${origin}/${page}`).replaceAll(`href="/${page}.html"`,`href="/${page}"`);
  }
  return html;
}
export function applySearchFoundation(dist){
  const links='<nav class="searchReadingLinks" aria-label="공시 읽기와 기관 지분"><a href="/blog/issues/how-to-read-dart-disclosures/">주식 공시 보는 법</a><a href="/blog/issues/jpmorgan-five-percent-holdings/">JP모건 5% 지분</a><a href="/blog/issues/blackrock-shareholdings/">블랙록 지분 확인</a><a href="/disclosurepedia/">종목별 공시피디아</a><a href="/stock-terms">공시 용어 Q&amp;A</a></nav>';
  const styles='<style>.searchReadingLinks{display:flex;flex-wrap:wrap;gap:12px 20px;max-width:1180px;margin:24px auto;padding:20px 24px;border-top:1px solid #dfe5ec;line-height:1.7;font-size:14px;letter-spacing:0}.searchReadingLinks a{color:#344054;text-underline-offset:4px;overflow-wrap:anywhere}</style>';
  function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,item.name);
    if(item.isDirectory())walk(file);
    else if(item.name.endsWith('.html')&&item.name!=='404.html'){
      let html=normalizeLinks(fs.readFileSync(file,'utf8'));
      if(!html.includes('class="searchReadingLinks"'))html=html.replace('</head>',styles+'</head>').replace('</main>','</main>'+links);
      // A guide has no fictional disclosure table. Empty source results are explicit.
      if(['how-to-read-dart-disclosures','treasury-stock-buyback-disclosures'].some(slug=>file.includes(slug))) {
        html=html.replace(/<h2 class="issueTableTitle">[\s\S]*?<div class="issueColumn issueFaq">/,'<div class="issueColumn issueFaq">');
        html=html.replace('운영 DB 수집 시작 이후 공시를 누적해 최신순으로 제공한다.', '공시 확인 방법을 설명하는 안내 글이다.');
      }
      if(file.includes('blackrock-shareholdings'))html=html.replace('<tbody></tbody>','<tbody><tr><td colspan="4">현재 수집 범위에서 일치하는 공시가 없다. 미보유를 뜻하지 않는다.</td></tr></tbody>');
      fs.writeFileSync(file,html);
    }
  }}walk(dist);
  const sitemap=path.join(dist,'sitemap.xml');
  let xml=normalizeLinks(fs.readFileSync(sitemap,'utf8'));
  const seen=new Set();xml=xml.replace(/<url>[\s\S]*?<\/url>/g,block=>{
    const loc=block.match(/<loc>(.*?)<\/loc>/)?.[1];
    if(seen.has(loc))return '';seen.add(loc);
    if(loc===origin+'/stock-terms')block=block.replace(/<lastmod>[^<]*<\/lastmod>/,'<lastmod>2026-10-24</lastmod>');
    return block;
  });fs.writeFileSync(sitemap,xml);
}
