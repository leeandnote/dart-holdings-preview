const origin='https://leeandnote.com';
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
export const detailGroups={
 ownership:{label:'지분·임원보고',example:'가상 예시: 보유비율이 5%에서 6%가 되면 1%포인트 상승이다. 직전 비율 대비 증가율은 20%지만, 주가 수익률과는 관계없다. 보유 주식수와 전체 기준 주식수가 어떻게 바뀌었는지도 함께 확인한다.',check:'제출인과 특별관계자 범위 → 보고 기준일 → 직전·이번 수량 및 비율 → 변동 사유 → 정정 여부',question:'5% 신규 보고는 처음 주식을 샀다는 뜻인가?',answer:'아니다. 처음 투자한 시점과 보고 기준에 도달한 시점은 다를 수 있다. 신규라는 분류만으로 공시 당일 처음 매수했다고 해석하지 않는다.',source:'https://dart.fss.or.kr/info/main.do?menu=310',sourceLabel:'DART 대량보유 보고 안내',links:[['/5percent','5%보고 비교'],['/executives','임원보고 비교'],['/blog/issues/national-pension-stock-holdings/','국민연금 지분 읽기']]},
 contracts:{label:'수주·계약',example:'가상 예시: 계약금액 300억원, 공시의 비교 매출액 1,000억원이면 매출액 대비 비중은 30%다. 올해 매출이 30% 증가하거나 이익이 300억원 발생한다는 뜻은 아니다. 계약기간이 여러 해인지와 조건부 금액 여부를 확인한다.',check:'계약 상대방 → 금액·통화 → 비교 매출액의 연도와 연결·별도 기준 → 수행 기간 → 정정·해지',question:'계약금액이 바뀐 정정 공시는 어떻게 합산하나?',answer:'같은 계약의 기존 금액과 정정 금액을 신규 수주처럼 더하지 않는다. 원계약과 정정 대상 항목을 연결하고, 집계 기준일에 유효한 금액을 사용한다.',source:'https://dart.fss.or.kr/dsab007/detailSearchMain.do',sourceLabel:'DART 원계약·정정 보고서 검색',links:[['/contracts','수주 공시 비교'],['/blog/contracts/','수주 공시 요약']]},
 clinical:{label:'임상·기술수출',example:'가상 예시: 총 계약규모 1억 달러 중 선급금 500만 달러, 조건부 금액 9,500만 달러라면 총액 모두를 이미 받은 현금으로 볼 수 없다. 지급 조건·반환 조건·수령 시점을 원문에서 확인한다. 원화 환산값은 적용 환율과 기준일도 구분한다.',check:'신청·진행 가능·결과 발표 구분 → 국가와 규제기관 → 적응증·시험 단계 → 평가변수 → 실제 수령액과 조건부 금액',question:'미국 IND와 국내 임상시험 승인은 같은 절차인가?',answer:'국가와 규제기관의 절차가 다르므로 같은 표현으로 단정하면 안 된다. 미국 IND는 임상시험을 위한 제도이며 판매허가와 구분된다. 해당 공시의 국가, 통지 내용과 시험 개시 조건을 확인한다.',source:'https://www.fda.gov/drugs/types-applications/investigational-new-drug-application-ind',sourceLabel:'미국 FDA IND 안내',links:[['/major-events','투자판단 공시'],['/blog/issues/biotech-clinical-trials/','IND 신청·승인 해설']]},
 events:{label:'투자판단·정정',example:'가상 예시: 낙찰자 선정 이후 계약 체결 공시가 나왔다면 서로 다른 두 건의 확정 수주로 바로 합산하지 않는다. 사업명·상대방·금액·관련 공시를 대조해 같은 사건인지 확인한다. 소송도 제기·판결·확정 단계를 구분한다.',check:'사건 발생일과 접수일 → 현재 진행 상태 → 금액의 의미 → 조건과 불확실성 → 관련 공시·정정 항목',question:'공시에서 숫자를 찾지 못하면 0으로 보면 되나?',answer:'아니다. 미공개·해당 없음·수집 실패와 실제 0은 다르다. 빈칸만으로 금액이나 보유량이 없다고 단정하지 말고 원문과 후속 보고를 확인한다.',source:'https://dart.fss.or.kr/dsab007/detailSearchMain.do',sourceLabel:'DART 사건·정정 공시 검색',links:[['/major-events','주요경영사항 비교'],['/blog/issues/how-to-read-dart-disclosures/','공시 읽는 순서']]}
};
export function glossaryDetails(html,groups){
 if(html.includes('id="glossary-detail-style"'))return html;
 html=html.replace('<h1>','<nav aria-label="현재 위치"><a href="/">홈</a> › <a href="/blog/">공시 블로그</a> › <span aria-current="page">공시 용어 Q&amp;A</span></nav><h1>');
 html=html.replace('</h1>','</h1><p>공시 숫자의 의미를 이해하고 원문에서 확인할 항목을 찾는 용어 안내입니다. 아래 예시는 모두 설명을 위한 가상 사례이며 투자 추천이 아닙니다.</p>');
 html=html.replaceAll('2026-10-22','2026-10-24');
 const questions=[];
 for(const [key,d] of Object.entries(detailGroups)){
   const qa=groups[key];
   const entries=[...qa,[d.question,d.answer]];
   questions.push(...entries.map(([name,text])=>({'@type':'Question',name,acceptedAnswer:{'@type':'Answer',text}})));
   const body=`<section class="editorialTerms" id="${key}"><h2>${d.label}</h2>${entries.map(([q,a],i)=>`<section id="${key}-${i+1}"><h3>${esc(q)}</h3><p>${esc(a)}</p></section>`).join('')}<h3>숫자와 사건으로 이해하기</h3><p>${d.example}</p><h3>원문 확인 순서</h3><ol>${d.check.split(' → ').map(x=>`<li>${x}</li>`).join('')}</ol><p class="editorialSources">공식 확인 경로: <a href="${d.source}">${d.sourceLabel}</a>. 개별 계약·마일스톤 조건은 해당 회사 공시 원문을 기준으로 확인합니다.</p><nav aria-label="${d.label} 관련 자료">${d.links.map(([url,label])=>`<a href="${url}">${label}</a>`).join(' · ')}</nav><p><a href="#terms-top">용어 목차로 돌아가기</a></p></section>`;
   const start=html.indexOf(`<section class="editorialTerms" id="${key}">`);
   if(start<0)throw new Error('Missing glossary section '+key);
   const next=html.indexOf('<section class="editorialTerms" id="',start+1);
   const end=next<0?html.indexOf('<footer class="editorialTerms">',start):next;
   if(end<0)throw new Error('Missing glossary boundary');
   html=html.slice(0,start)+body+html.slice(end);
 }
 const schema={'@context':'https://schema.org','@graph':[
  {'@type':['WebPage','FAQPage'],'@id':origin+'/stock-terms#page',url:origin+'/stock-terms',name:'주식·공시 용어 Q&A',inLanguage:'ko-KR',dateModified:'2026-10-24',author:{'@type':'Organization',name:'리앤노트',url:origin+'/about'},mainEntity:questions},
  {'@type':'BreadcrumbList',itemListElement:[['홈','/'],['공시 블로그','/blog/'],['공시 용어 Q&A','/stock-terms']].map(([name,url],i)=>({'@type':'ListItem',position:i+1,name,item:origin+url}))}
 ]};
 html=html.replace('<main class="termsPage">','<main class="termsPage" id="terms-top">');
 return html.replace('</head>',`<script type="application/ld+json">${JSON.stringify(schema).replaceAll('<','\\u003c')}</script><style id="glossary-detail-style">.termsPage{max-width:1040px}.termsPage nav{display:flex;flex-wrap:wrap;gap:8px 14px;line-height:1.8}.termsPage p,.termsPage li{line-height:1.85;overflow-wrap:anywhere}.termsPage h2{font-size:24px}.termsPage h3{font-size:18px}.termsPage section[id]{scroll-margin-top:90px}.termsPage a:focus-visible{outline:2px solid #2563eb;outline-offset:4px}.termsPage .editorialTerms{border-radius:8px}@media(max-width:600px){.termsPage{padding-inline:18px}.termsPage h1{font-size:26px}.termsPage h2{font-size:22px}}</style></head>`);
}
export function addGlossaryTab(html){
 html=html.replace(/<div class="categoryBar"([^>]*)>([\s\S]*?)<\/div>/g,'<nav class="categoryBar"$1>$2</nav>');
 html=html.replace(/<nav\b[^>]*class="(?:insightTabs|categoryBar)"[^>]*>[\s\S]*?<\/nav>/g,nav=>nav.includes('href="/stock-terms"')?nav:nav.replace('</nav>','<a href="/stock-terms">공시 용어 Q&amp;A</a></nav>'));
 if(!html.includes('id="glossary-nav-style"'))html=html.replace('</head>','<style id="glossary-nav-style">@media(max-width:760px){.categoryBar,.insightTabs{flex-wrap:wrap!important;overflow:visible!important;margin-inline:0!important;padding-inline:0!important}.categoryBar a,.insightTabs a{white-space:normal}}</style></head>');
 return html;
}
