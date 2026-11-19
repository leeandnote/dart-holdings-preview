import fs from 'node:fs';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { detailGroups } from './glossary_detail.mjs';

export const terms = [
  {slug:'holding-ratio',name:'보유비율',group:'ownership',summary:'보유비율은 보고 대상 보유주식등의 수량을 해당 보고서의 기준 주식수와 비교한 비율입니다. 비율의 하락만으로 실제 주식 매도를 확정할 수 없습니다.',example:'가상 예시: 1,000만 주 중 60만 주를 보유하면 6%입니다. 보유량이 그대로여도 기준 주식수가 1,200만 주로 늘면 5%가 됩니다. 이 경우 보유비율은 줄었지만 보유수량은 줄지 않았습니다.',checks:['직전·이번 보고서의 보유주식등 수량과 비율을 나란히 비교합니다.','발행주식수 변동, 전환·신주 발행 여부와 보고서의 분모 정의를 확인합니다.','본인 단독인지 특별관계자를 합친 수치인지 확인합니다.','실제 거래 여부는 변동 사유·거래일·세부 거래 내역에서 확인합니다.'],guide:'/blog/issues/ownership-rate-vs-share-count/'},
  {slug:'percentage-point',name:'%포인트',group:'ownership',summary:'%포인트는 두 비율을 뺀 차이입니다. 보유비율이 5%에서 6%로 오르면 1%포인트 상승이며, 기존 비율 대비 증가율 20%와 구분해야 합니다.',example:'가상 예시: 5% → 6%의 변동폭은 6−5=1%포인트입니다. 기존 비율 대비 증가율은 (6−5)÷5×100=20%입니다. 어느 숫자도 해당 종목의 주가 수익률을 뜻하지 않습니다. 직전 비율이 0이면 같은 방식의 증가율 계산은 할 수 없습니다.',checks:['비교하는 두 값이 모두 비율인지 확인합니다.','이번 비율에서 직전 비율을 빼고 단위를 %포인트로 표시합니다.','주식수 증감과 비율 차이를 분리해서 읽습니다.','반올림된 비율만으로 정확한 매매수량을 역산하지 않습니다.'],guide:'/blog/issues/ownership-rate-vs-share-count/'},
  {slug:'contract-sales-ratio',name:'매출액 대비 계약 비율',group:'contracts',summary:'매출액 대비 계약 비율은 공시된 계약금액을 공시에 명시한 최근 매출액으로 나눈 값입니다. 매출 성장률이나 영업이익률이 아닙니다.',example:'가상 예시: 계약금액 150억원, 비교 매출액 100억원이면 비율은 150%입니다. 계약기간이 3년이어도 매년 50억원씩 매출이 발생한다고 단정할 수 없습니다. 실제 이행과 회계상 매출 인식 조건을 별도로 확인해야 합니다.',checks:['계약금액의 통화, 부가세 포함 여부와 환산 기준을 확인합니다.','비교 매출액의 회계연도와 연결·별도 기준을 확인합니다.','계약 시작·종료일, 조건부 금액과 해지 조건을 확인합니다.','정정 계약을 원계약과 더해 신규 수주로 중복 집계하지 않습니다.'],guide:'/blog/issues/contract-value-vs-revenue/'},
  {slug:'corrected-disclosure',name:'정정공시',group:'events',summary:'정정공시는 이전 보고서의 특정 내용을 수정하거나 보완하는 공시입니다. 원문 전체가 무효가 되거나 새로운 사건이 추가됐다는 뜻은 아닙니다.',example:'가상 예시: 기존 공급계약 150억원이 정정공시에서 120억원으로 바뀌었다면 같은 계약을 270억원 수주로 합산하면 안 됩니다. 어떤 항목이 언제, 왜 바뀌었는지 정정 전·후 표와 원계약을 연결해 확인합니다.',checks:['정정 대상 공시의 최초 제출일과 접수번호를 확인합니다.','정정 사유와 정정 전·후 항목을 비교합니다.','금액뿐 아니라 계약기간·상대방·효력 조건의 변경을 확인합니다.','추가 정정 또는 해지 공시가 있는지 최신 원문을 다시 확인합니다.'],guide:'/blog/issues/how-to-read-dart-disclosures/'}
];
export const termUrl = term => `/stock-terms/${term.slug}/`;
const esc = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
export function createTermPages(dist) {
  const hubPath=path.join(dist,'stock-terms.html');
  const template=fs.readFileSync(hubPath,'utf8');
  for(const term of terms){
    const {document}=parseHTML(template);
    const url='https://leeandnote.com'+termUrl(term),detail=detailGroups[term.group];
    document.title=`${term.name} 뜻과 계산·확인 방법 | 리앤노트`;
    document.querySelector('link[rel="canonical"]').setAttribute('href',url);
    document.querySelector('meta[name="description"]').setAttribute('content',term.summary);
    document.querySelectorAll('script[type="application/ld+json"]').forEach(node=>node.remove());
    const style=document.createElement('style');style.textContent='.termsPage article h2{margin:28px 0 12px}.termsPage article h3{margin:18px 0 10px}.termsPage article p{margin:0 0 16px}.termsPage article li{margin-bottom:8px}';document.head.append(style);
    document.querySelector('main').innerHTML=`<nav aria-label="현재 위치"><a href="/">홈</a> › <a href="/stock-terms">공시 용어</a> › <span aria-current="page">${esc(term.name)}</span></nav><article><h1>${esc(term.name)} 뜻과 확인 방법</h1><p>${esc(term.summary)}</p><p>작성·운영 <a href="/about">리앤노트</a> · <a href="/editorial-policy">편집·자동화 기준</a></p><h2>숫자로 이해하기</h2><p>${esc(term.example)}</p><h2>공시 원문에서 확인할 항목</h2><ol>${term.checks.map(text=>`<li>${esc(text)}</li>`).join('')}</ol><h2>자주 혼동하는 내용</h2><h3>${esc(detail.question)}</h3><p>${esc(detail.answer)}</p><h2>원문과 관련 해설</h2><p><a href="${detail.source}">${detail.sourceLabel}</a> · <a href="${term.guide}">공시 사례·읽는 순서</a></p><p>일반적인 개념 설명이며 개별 공시의 법적·회계적 판단을 대신하지 않습니다. 본문의 숫자는 설명용 가상 사례이며 투자 추천이 아닙니다.</p><nav aria-label="관련 용어">${terms.filter(t=>t.slug!==term.slug).map(t=>`<a href="${termUrl(t)}">${esc(t.name)}</a>`).join(' · ')}</nav></article>`;
    const schema=document.createElement('script');schema.type='application/ld+json';
    schema.textContent=JSON.stringify({'@context':'https://schema.org','@graph':[{'@type':'DefinedTerm','@id':url+'#term',url,name:term.name,description:term.summary,inDefinedTermSet:'https://leeandnote.com/stock-terms'},{'@type':'BreadcrumbList',itemListElement:[['홈','/'],['공시 용어','/stock-terms'],[term.name,termUrl(term)]].map(([name,p],i)=>({'@type':'ListItem',position:i+1,name,item:'https://leeandnote.com'+p}))}]}).replaceAll('<','\\u003c');
    document.head.append(schema);
    const out=path.join(dist,termUrl(term));fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'index.html'),document.toString());
  }
  const {document}=parseHTML(template);
  if(!document.querySelector('#individual-terms'))document.querySelector('main h1').insertAdjacentHTML('afterend',`<section id="individual-terms"><h2>용어별 상세 해설</h2><ul>${terms.map(t=>`<li><a href="${termUrl(t)}">${esc(t.name)} 뜻과 확인 방법</a></li>`).join('')}</ul></section>`);
  fs.writeFileSync(hubPath,document.toString());
}
