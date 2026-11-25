const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const pct = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '%' : '미확인';
export const institutionDefinitions = [
  ['vip-asset-holdings', 'VIP자산운용', /브이아이피자산운용|VIP\s*(?:자산운용|ASSET\s*MANAGEMENT)/i, '영문 VIP와 한글 브이아이피 표기를 함께 확인합니다.'],
  ['shinyoung-asset-holdings', '신영자산운용', /신영자산운용|SHINYOUNG\s*ASSET/i, '신영증권과 신영자산운용은 이름만으로 합산하지 않습니다.'],
  ['truston-asset-holdings', '트러스톤자산운용', /트러스톤자산운용|TRUSTON\s*ASSET/i, '제출 법인과 보고 목적을 각각 확인하며, 운용사 이름만으로 경영참가 목적이라 단정하지 않습니다.'],
  ['align-partners-holdings', '얼라인파트너스', /얼라인파트너스|ALIGN\s*PARTNERS/i, '주주제안 등 활동과 공시의 보유 목적은 구분해서 확인합니다.'],
  ['kcgi-holdings', 'KCGI', /케이씨지아이|\bKCGI\b/i, 'KCGI 표기가 없는 투자목적회사는 자동으로 같은 주체에 편입하지 않습니다.'],
  ['norges-bank-holdings', '노르웨이 중앙은행', /노르웨이\s*중앙은행|NORGES\s*BANK/i, '노르웨이 국부펀드 관련 검색을 위한 공시 모음이며 Norges Bank 제출 명의가 확인된 보고만 포함합니다.'],
  ['vanguard-holdings', '뱅가드', /뱅가드|뱅가아드|VANGUARD/i, '제출 법인의 보유 보고와 개별 ETF의 전체 편입 내역은 다릅니다.'],
];

export function institutionTopics(holdings) {
  return institutionDefinitions.flatMap(([slug, name, pattern, distinction]) => {
    const seen = new Set();
    const rows = holdings.filter(r => {
      if (!pattern.test(r.reporter || '') || !r.corpName || !/^\d{8}$/.test(r.reportDate || '') || !/^https:\/\/dart\.fss\.or\.kr\/dsaf001\/main\.do\?rcpNo=\d{14}$/.test(r.url || '')) return false;
      const key = [r.url, r.stockCode, r.reporter].join('|');
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).sort((a, b) => b.reportDate.localeCompare(a.reportDate));
    if (!rows.length) return [];
    const names = [...new Set(rows.map(r => r.corpName))];
    const date = d => d.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
    const faq = [
      ['이 표가 현재 전체 보유종목인가요?', '아닙니다. 수집 범위 내 5% 지분보고 이력이며 5% 미만 보유나 미수집 공시가 빠질 수 있습니다. 전체 포트폴리오나 현재 잔고가 아닙니다.'],
      ['지분이 증가하면 장내매수인가요?', '지분율만으로는 확인할 수 없습니다. 주식수, 증권 종류, 보고 사유와 세부 변동 내역을 함께 읽어야 합니다.'],
      ['같은 종목의 보고를 더해도 되나요?', '아닙니다. 시점이 다른 잔고를 더하면 중복 계산됩니다. 동일 제출인과 공동보유 범위를 맞춰 최신 정정을 포함한 원문을 확인하세요.'],
    ];
    return [{slug, score: 72, title: `${name} 보유종목 확인: 국내 주식 5% 지분 공시`,
      description: `${name} 관련 제출인의 ${names.slice(0, 3).join('·')} 등 국내 주식 지분보고를 확인합니다. 전체 보유목록이 아닌 수집 공시 이력입니다.`,
      answer: `${esc(name)} 관련 제출인의 수집 공시는 ${rows.length}건, ${names.length}개 회사입니다. ${date(rows.at(-1).reportDate)}~${date(rows[0].reportDate)} 접수 자료이며 최근 확인 종목은 ${esc(names.slice(0, 3).join('·'))}입니다.`,
      column: `<h2>${esc(name)} 공시를 찾는 기준</h2><p>${esc(distinction)} 아래 표는 제출인 이름을 기준으로 선별하며, 보고서에 없는 계열관계나 외국인 전체 수급을 추정하지 않습니다.</p><h2>보유종목 검색 후 무엇을 확인하나요?</h2><ol><li>회사명과 종목코드, 제출 법인이 같은지 확인합니다.</li><li>직전·이번 보유비율과 보고 사유를 원문에서 대조합니다.</li><li>접수일 대신 실제 거래일과 보고의무 발생일을 별도로 확인합니다.</li><li>최신 정정과 공동보유 내역을 확인합니다.</li></ol><p>국내 주식 일부 공시만으로 기관의 전체 투자 전략이나 외국인의 당일 순매수를 알 수 없습니다. 숫자가 미확인인 경우 0으로 대체하지 않습니다.</p><p>관련 자료: <a href="/5percent">5% 공시 검색</a> · <a href="/stock-terms/holding-ratio/">보유비율 뜻</a> · <a href="https://dart.fss.or.kr/">DART 원문 검색</a></p>`,
      faq: '<h2>자주 묻는 질문</h2>' + faq.map(([q, a]) => `<h3>${q}</h3><p>${a}</p>`).join(''),
      rows, headers: ['종목', '제출인', '직전 → 이번 보유비율', '접수일'],
      row: r => `<tr><td>${esc(r.corpName)}<small>${esc(r.stockCode)}</small></td><td>${esc(r.reporter)}</td><td>${pct(r.previousRate)} → ${pct(r.currentRate)}</td><td>${date(r.reportDate)}<small><a href="${esc(r.url)}">DART 원문</a></small></td></tr>`}];
  });
}
