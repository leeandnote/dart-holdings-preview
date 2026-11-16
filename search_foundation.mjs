import fs from 'node:fs';
import path from 'node:path';
import { questionNavigation } from './disclosure_questions.mjs';
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
      const relative=path.relative(dist,file).replaceAll('\\','/');
      const readingPage=relative==='index.html'||relative==='stock-terms.html'||relative.startsWith('stock-terms/')||relative.startsWith('blog/')||relative.startsWith('disclosurepedia/');
      if(readingPage&&!html.includes('class="questionReading"')) {
        const section=questionNavigation();
        html=html.replace('</head>','<style>.questionReading{max-width:1120px;margin:28px auto;padding:24px;border-block:1px solid #dfe5ec;letter-spacing:0}.questionReading h2{font-size:22px;line-height:1.4}.questionReading ul{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px 28px;list-style:none;padding:0}.questionReading li{min-width:0}.questionReading a{color:#174b8a;text-underline-offset:4px;overflow-wrap:anywhere}.questionReading p{font-size:14px;line-height:1.7;color:#667085}.issueColumn table{width:100%;border-collapse:collapse}.issueColumn th,.issueColumn td{padding:12px;border-bottom:1px solid #dfe5ec;text-align:left;overflow-wrap:anywhere}.guideContents{line-height:1.8}.guideContents a{color:#174b8a}@media(max-width:600px){.questionReading ul{grid-template-columns:1fr}.questionReading{padding:20px 16px}.issueColumn table{font-size:14px}}</style></head>');
        if(relative==='index.html'&&html.includes('<section class="homeQuality homeSearch"'))html=html.replace('<section class="homeQuality homeSearch"',section+'<section class="homeQuality homeSearch"');
        else if(html.includes('<section class="insightGrid"'))html=html.replace('<section class="insightGrid"',section+'<section class="insightGrid"');
        else html=html.replace('</main>',section+'</main>');
      }
      if(!html.includes('class="searchReadingLinks"'))html=html.replace('</head>',styles+'</head>').replace('</main>','</main>'+links);
      // A guide has no fictional disclosure table. Empty source results are explicit.
      if(['how-to-read-dart-disclosures','treasury-stock-buyback-disclosures','ownership-rate-vs-share-count','contract-value-vs-revenue'].some(slug=>file.includes(slug))) {
        html=html.replace(/<h2 class="issueTableTitle">[\s\S]*?<div class="issueColumn issueFaq">/,'<div class="issueColumn issueFaq">');
        html=html.replace('운영 DB 수집 시작 이후 공시를 누적해 최신순으로 제공한다.', '공시 확인 방법을 설명하는 안내 글이다.');
      }
      if(relative.startsWith('blog/issues/')&&relative!=='blog/issues/index.html'&&!html.includes('class="guideContents"')) {
        const headings=[];
        html=html.replace(/<h2>([^<]+)<\/h2>/g,(match,title)=>{const id=`reading-${headings.length+1}`;headings.push({id,title});return `<h2 id="${id}">${title}</h2>`;});
        const toc=`<nav class="guideContents" aria-label="본문 목차"><h2>이 글에서 확인할 내용</h2><ol>${headings.map(({id,title})=>`<li><a href="#${id}">${title}</a></li>`).join('')}</ol></nav><p>작성·편집: <a href="/about">리앤노트</a> · <a href="/editorial-policy">자료 수집·정정 기준</a></p>`;
        html=html.replace('<div class="issueColumn">',toc+'<div class="issueColumn">');
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
