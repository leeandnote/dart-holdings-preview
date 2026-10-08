export const macroSources = {
  bok: ['한국은행 · 2026 통화정책방향 결정회의', 'https://www.bok.or.kr/portal/singl/crncyPolicyDrcMtg/listYear.do?menuNo=200755&mtgSe=A&pYear=2026'],
  boj: ['일본은행 · 2026 금융정책결정회의 일정', 'https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref250731a.pdf'],
  bea: ['BEA · 경제지표 발표 일정', 'https://www.bea.gov/news/schedule/'],
  bls: ['BLS · 2026 경제지표 발표 일정', 'https://www.bls.gov/schedule/2026/home.htm'],
  census: ['미국 Census Bureau · 소매판매 발표 일정', 'https://www.census.gov/retail/release_schedule.html'],
};

// Explicit instants retain the official Eastern offset; Intl renders Korean dates/times.
export function koreanTime(instant) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute} KST` };
}

const meetings = [
  ['2026-10-22', '한국은행 기준금리 결정회의', 'KR', 'bok', 'Asia/Seoul', '통화정책방향 결정회의. 기준금리 결정문과 총재 기자간담회는 별도 공지로 확인한다.'],
  ['2026-11-26', '한국은행 기준금리 결정회의', 'KR', 'bok', 'Asia/Seoul', '통화정책방향 결정회의. 금리 인상·동결·인하 결과는 사전에 확정하지 않는다.'],
  ['2026-10-29', '일본은행 금융정책회의 시작', 'JP', 'boj', 'Asia/Tokyo', '10월 29~30일 회의. 시작일은 정책결정 발표일이 아니다.'],
  ['2026-10-30', '일본은행 정책결정 · 전망보고서', 'JP', 'boj', 'Asia/Tokyo', '금융정책회의 종료일. 전망보고서의 기본 견해는 회의 종료 직후 공개 예정이다. 정확한 발표 시각은 미정이다.'],
  ['2026-12-17', '일본은행 금융정책회의 시작', 'JP', 'boj', 'Asia/Tokyo', '12월 17~18일 회의. 시작일은 정책결정 발표일이 아니다.'],
  ['2026-12-18', '일본은행 정책결정', 'JP', 'boj', 'Asia/Tokyo', '금융정책회의 종료일. 정책결정 발표 시각은 미정이며 임의의 시각을 지정하지 않는다.'],
].map(([date, title, region, source, zone, description]) => ({
  date, title, region, source, zone, description, type: 'policy', status: '공식 일정', time: '시각 미정',
}));

const releases = [
  ['2026-10-02', '고용보고서 · 비농업고용·실업률', '9월', 'bls'],
  ['2026-10-14', 'CPI · 근원 CPI', '9월', 'bls'],
  ['2026-10-15', 'PPI 생산자물가', '9월', 'bls'],
  ['2026-10-29', 'PCE · 근원 PCE', '9월', 'bea'],
  ['2026-11-06', '고용보고서 · 비농업고용·실업률', '10월', 'bls'],
  ['2026-11-10', 'CPI · 근원 CPI', '10월', 'bls'],
  ['2026-11-13', 'PPI 생산자물가', '10월', 'bls'],
  ['2026-11-25', 'PCE · 근원 PCE', '10월', 'bea'],
  ['2026-12-04', '고용보고서 · 비농업고용·실업률', '11월', 'bls'],
  ['2026-12-10', 'CPI · 근원 CPI', '11월', 'bls'],
  ['2026-12-15', 'PPI 생산자물가', '11월', 'bls'],
  ['2026-12-23', 'PCE · 근원 PCE', '11월', 'bea'],
].map(([localDate, name, period, source]) => {
  const offset = localDate < '2026-11-01' ? '-04:00' : '-05:00';
  const instant = `${localDate}T08:30:00${offset}`;
  return {
    ...koreanTime(instant), instant, localDate, localTime: '08:30 미국 동부시간',
    title: `미국 ${name} (${period})`, type: 'macro', region: 'US', source,
    status: '공식 일정', zone: 'America/New_York',
    description: `2026년 ${period} 통계의 발표 일정이다. ${source === 'bea' ? '개인소득·지출 보고서에 PCE와 식품·에너지를 제외한 근원 PCE 물가지수가 포함된다.' : '발표 대상월과 실제 발표일은 다르다.'} 발표값·시장 예상치는 수록하지 않으며 일정 변경은 공식 출처에서 확인한다.`,
  };
});

const additional = [
  ['2026-10-29', '08:30', 'GDP 3분기 속보치', 'bea', 'growth', '경제성장률의 첫 추정치다. 이후 잠정·확정 추정치에서 수정될 수 있다.'],
  ['2026-11-25', '08:30', 'GDP 3분기 2차 추정치', 'bea', 'growth', '3분기 성장률을 추가 자료로 수정한 추정치다. 새로운 분기의 성장률 발표와 구분한다.'],
  ['2026-12-23', '08:30', 'GDP 3분기 3차 추정치', 'bea', 'growth', '3분기 성장률의 3차 추정치다. 이후 정기 개편에서도 수정될 수 있다.'],
  ['2026-10-15', '08:30', '소매판매 속보 (9월)', 'census', 'growth', '상품 소비 흐름을 확인하는 소매·음식서비스 매출 속보 통계다. 전체 소비나 실질 소비 증가율과 같지 않다.'],
  ['2026-11-17', '08:30', '소매판매 속보 (10월)', 'census', 'growth', '10월 소매·음식서비스 매출 속보다. 물가 영향을 받는 명목 매출이며 이후 수정될 수 있다.'],
  ['2026-12-16', '08:30', '소매판매 속보 (11월)', 'census', 'growth', '11월 소매·음식서비스 매출 속보로 연말 소비 흐름을 살펴볼 수 있다.'],
  ['2026-11-03', '10:00', 'JOLTS 구인·이직 (9월)', 'bls', 'macro', '구인·채용·이직 등 노동수요를 확인한다. 비농업고용 증가분과 다른 통계이며 발표 대상월의 시차에 유의한다.'],
  ['2026-12-01', '10:00', 'JOLTS 구인·이직 (10월)', 'bls', 'macro', '10월 노동수요 통계다. 미국 현지 발표일보다 한국 달력 날짜가 하루 늦다.'],
  ['2026-10-30', '08:30', '고용비용지수 ECI (3분기)', 'bls', 'macro', '임금과 복리후생을 포함한 고용비용 흐름을 확인하는 분기 통계다. 월별 평균시간당임금과 구분한다.'],
].map(([localDate, clock, name, source, type, description]) => {
  const instant = `${localDate}T${clock}:00${localDate < '2026-11-01' ? '-04:00' : '-05:00'}`;
  return { ...koreanTime(instant), instant, localDate, localTime: `${clock} 미국 동부시간`,
    title: `미국 ${name}`, type, region: 'US', source, status: '공식 일정',
    zone: 'America/New_York', description };
});

export const macroEvents = [...meetings, ...releases, ...additional];
