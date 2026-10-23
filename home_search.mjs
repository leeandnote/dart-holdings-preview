const origin = 'https://leeandnote.com';
export const services = [
  ['5% 지분보고', '/5percent', '기관·주요주주의 대량보유 변동', '제출인, 보유 목적, 직전·이번 보유비율'],
  ['임원·주요주주 보고', '/executives', '임원 등의 보유 증권 변동', '보고자, 증권 종류, 주식수와 변동 사유'],
  ['대형수주 보고', '/contracts', '단일판매·공급계약 비교', '계약금액, 매출 대비 비중, 상대방과 기간'],
  ['투자판단 공시', '/major-events', '임상·기술수출·주요경영사항', '사건명, 진행 단계, 금액과 조건'],
];
export const faqs = [
  ['리앤노트는 어떤 정보를 제공하나요?', '리앤노트는 DART 공시를 지분보고, 임원·주요주주 보고, 수주와 투자판단 공시로 나누어 비교하는 정보 서비스입니다. 종목별 공시와 해설에서 원문으로 연결합니다.'],
  ['공시 접수일은 실제 거래일인가요?', '아닙니다. 접수일과 보고의무 발생일, 실제 거래일은 다를 수 있습니다. 원문의 기준일과 세부 변동 사유를 확인해야 합니다.'],
  ['표의 수치는 실시간 보유 현황인가요?', '아닙니다. 각 공시의 보고 시점과 데이터 수집 범위에 따른 기록입니다. 가격은 표시된 기준일을 확인하고, 최신 정정 공시와 원문을 우선해야 합니다.'],
  ['요약이 원문과 다르면 어떻게 하나요?', '최신 정정을 포함한 DART 원문을 우선합니다. 리앤노트 문의 페이지로 해당 페이지와 공시 접수번호를 알려주시면 오류 확인에 도움이 됩니다.'],
];
const esc = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
export function homeGraph() {
  return {'@context':'https://schema.org','@graph':[
    {'@type':'Organization','@id':origin+'/#organization',name:'리앤노트',alternateName:'LEE&NOTE',url:origin+'/',logo:origin+'/assets/leeandnote-logo.png',sameAs:['https://t.me/leeandnote'],contactPoint:{'@type':'ContactPoint',url:origin+'/contact',contactType:'문의 및 데이터 오류 제보',availableLanguage:'ko'}},
    {'@type':'WebSite','@id':origin+'/#website',url:origin+'/',name:'리앤노트',inLanguage:'ko-KR',publisher:{'@id':origin+'/#organization'}},
    {'@type':['WebPage','FAQPage'],'@id':origin+'/#webpage',url:origin+'/',name:'리앤노트 | 한국 주식 공시 검색과 비교',isPartOf:{'@id':origin+'/#website'},about:{'@id':origin+'/#organization'},inLanguage:'ko-KR',mainEntity:faqs.map(([name,text])=>({'@type':'Question',name,acceptedAnswer:{'@type':'Answer',text}}))},
    ...services.map(([name,url,serviceType,description])=>({'@type':'Service','@id':origin+url+'#service',name,url:origin+url,serviceType,description,provider:{'@id':origin+'/#organization'},areaServed:{'@type':'Country',name:'대한민국'}}))
  ]};
}
export function enhanceHome(html) {
  if (html.includes('id="home-search-structure"')) return html;
  const section = `<section class="homeQuality homeSearch" aria-labelledby="qualityTitle"><div class="homeQualityInner">
    <h2 id="qualityTitle">어떤 공시를 비교할 수 있나요?</h2>
    <p>리앤노트는 한국 주식 공시의 지분·수주·주요 사건을 비교하고 DART 원문으로 연결합니다. 요약은 원문을 대체하지 않으며 투자 추천이 아닙니다.</p>
    <ul><li>누가 보유 지분을 바꿨는지 확인합니다.</li><li>계약금액과 매출액 대비 비중을 비교합니다.</li><li>임상 신청·승인 등 진행 단계를 구분합니다.</li><li>정정 여부와 기준일을 원문에서 확인합니다.</li></ul>
    <div class="homeFacts" aria-label="제공 범위와 확인 기준"><div><strong>4개</strong><span>핵심 공시 분류</span></div><div><strong>DART</strong><span>공시 원문 출처</span></div><div><strong>기준일 확인</strong><span>접수일·거래일·가격 기준 구분</span></div></div>
    <div class="homeQualityGrid">${services.map(([name,url,description],i)=>`<article class="homeQualityCard"><span aria-hidden="true">0${i+1}</span><h3><a href="${url}">${name}</a></h3><p>${description}</p></article>`).join('')}</div>
    <h2>공시 유형별로 무엇을 확인해야 하나요?</h2><p>보고서마다 비교할 숫자가 다릅니다. 같은 회사의 공시라도 기준일과 보고 범위를 먼저 맞춰 읽습니다.</p>
    <div class="homeCompare" role="region" aria-label="공시 유형 비교표" tabindex="0"><table><caption>공시 유형별 핵심 확인 항목</caption><thead><tr><th scope="col">유형</th><th scope="col">확인 항목</th></tr></thead><tbody>${services.map(([name,,,description])=>`<tr><th scope="row">${name}</th><td>${description}</td></tr>`).join('')}</tbody></table></div>
    <h2>처음 공시를 읽는다면 어디서 시작하나요?</h2><p>회사와 보고서를 찾고, 핵심 수치를 비교한 뒤 최신 정정을 포함한 원문을 확인합니다.</p><ol><li><a href="/disclosurepedia/">종목별 공시피디아</a>에서 회사와 종목코드를 확인합니다.</li><li><a href="/blog/issues/how-to-read-dart-disclosures/">공시 읽는 법</a>으로 기준일과 수치의 의미를 구분합니다.</li><li>DART 원문의 조건과 정정 내역을 확인합니다.</li></ol>
    <h2>공시 데이터에 대해 자주 묻는 질문</h2>${faqs.map(([q,a])=>`<div class="homeFaq"><h3>${esc(q)}</h3><p>${esc(a)}</p></div>`).join('')}
    <h2>출처와 오류는 어디서 확인하나요?</h2><p>공시 원문은 금융감독원 DART에서 확인할 수 있습니다. 리앤노트는 금융감독원이 운영하는 사이트가 아닙니다.</p><nav class="homeQualityLinks" aria-label="출처와 문의"><a href="https://dart.fss.or.kr/">DART 원문 검색</a><a href="/editorial-policy">데이터·편집 기준</a><a href="/contact">문의·오류 제보</a></nav>
    </div></section>`;
  const css = `<style id="home-search-structure">.homeSearch{grid-column:1/-1;max-width:none;margin:12px 0 0;padding:0;min-width:0}.homeSearch p,.homeSearch li{line-height:1.8;color:#475467}.homeSearch h2{font-size:24px;margin:32px 0 12px}.homeSearch h3{font-size:17px}.homeSearch a{color:#174b8a;text-underline-offset:3px}.homeSearch .homeQualityCard{border-radius:8px;box-shadow:none;background:#fff}.homeSearch .homeQualityCard>span{font-size:13px;color:#667085}.homeFacts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-block:1px solid #dce3ea;margin:24px 0}.homeFacts>div{padding:18px 12px}.homeFacts strong,.homeFacts span{display:block}.homeFacts strong{font-size:20px}.homeFacts span{font-size:13px;color:#667085;margin-top:6px}.homeCompare{overflow-x:auto}.homeCompare table{width:100%;border-collapse:collapse;text-align:left}.homeCompare caption{text-align:left;padding:12px 0;color:#667085}.homeCompare th,.homeCompare td{padding:14px;border-bottom:1px solid #dce3ea;overflow-wrap:anywhere}.homeCompare thead{background:#1e2530;color:white}.homeCompare tbody th{width:30%}.homeFaq{border-bottom:1px solid #dce3ea;padding:8px 0}.homeSearch *{letter-spacing:0}.radarHero h1,.radarPanelHead h2{font-size:28px}.radarHero h1{overflow-wrap:anywhere}@media(max-width:560px){.homeSearch h2{font-size:21px}.homeFacts{grid-template-columns:1fr}.homeFacts>div+div{border-top:1px solid #dce3ea}.homeCompare th,.homeCompare td{padding:10px;font-size:14px}.radarHero h1,.radarPanelHead h2{font-size:24px}}</style>`;
  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify(homeGraph()).replaceAll('<','\\u003c')}</script>`);
  html = html.replace('</head>', css+'</head>');
  html = html.replace('복잡한 DART 공시<br>쉽고 빠르게 확인하세요','리앤노트<br>한국 주식 공시 검색과 비교');
  html = html.replace('LIVE NOW','공시 유형별 바로가기').replace('텔레그램 실시간 알림 받기','텔레그램 공시 알림 받기');
  html = html.replace('</main>', '').replace(/<section class="homeQuality"[\s\S]*?<\/section>/,section+'</main>');
  return html;
}
