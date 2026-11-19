export function disclosureKey(row) {
  return [row.receiptNo || row.url, row.code, row.reporter].join('|');
}

// Each disclosure belongs to one body section, even when several filters match.
export function exclusiveThemes(themes, items) {
  const seen = new Set();
  const result = themes.map(theme => ({...theme, rows: theme.rows.filter(row => {
    const key = disclosureKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })})).filter(theme => theme.rows.length);
  const remaining = items.filter(row => {
    const key = disclosureKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (remaining.length) result.push({slug:'other',tag:'기타보고',badge:'기타 보고',heading:'비율 유지·수치 확인 대상',intro:'보유비율이 유지됐거나 직전·이번 수치 비교가 필요한 보고입니다.',rows:remaining,mode:'other'});
  return result;
}

export function ownershipHeadline(items, newEntries) {
  const sorted = newEntries.length ? newEntries : [...items].sort((a,b)=>Math.abs(b.delta || 0)-Math.abs(a.delta || 0));
  const names = [...new Set(sorted.map(row=>row.name).filter(Boolean))].slice(0,2);
  return names.length ? `${names.join('·')} ${newEntries.length ? '5% 신규 보고' : '지분 변동'}` : '5%보고 집계';
}

export function reportCounts(rows) {
  return { reports: new Set(rows.map(disclosureKey)).size, companies: new Set(rows.map(row => row.code || row.name)).size };
}

export function factualReview(rows) {
  return rows.slice(0,2).map(row => `${row.name}: ${row.reporter} 제출 보고에서 보유비율 ${row.rateText}, 변동폭 ${row.deltaText}로 확인됩니다. 공시에 기재된 보고사유는 ${row.reason || '원문 확인 필요'}입니다.`);
}
