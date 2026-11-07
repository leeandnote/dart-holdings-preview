import { koreanTime } from './calendar-macro.mjs';

export const japanSources = {
  jpCpi: ['일본 총무성 통계국 · CPI 발표 일정', 'https://www.stat.go.jp/english/data/cpi/1582.htm'],
  jpGdp: ['일본 내각부 · GDP 발표 일정', 'https://www.esri.cao.go.jp/jp/sna/kouhyou/kouhyou_top.html'],
  jpBoj: ['일본은행 · 2026 금융정책결정회의 일정', 'https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref250731a.pdf'],
};

const dated = [
  ['2026-11-20','일본 전국 CPI (10월)','jpCpi'],
  ['2026-11-27','일본 도쿄 CPI 잠정치 (11월)','jpCpi'],
  ['2026-12-18','일본 전국 CPI (11월)','jpCpi'],
  ['2026-12-25','일본 도쿄 CPI 잠정치 (12월)','jpCpi'],
  ['2026-12-17','일본은행 금융정책결정회의 시작','jpBoj'],
  ['2026-12-18','일본은행 금융정책결정회의 종료','jpBoj'],
].map(([date,title,source]) => ({date,title,source,time:'한국·일본 날짜 · 시각 미확인',
  type:source==='jpBoj'?'policy':'macro', importance:'high',
  description:source==='jpBoj'
    ? '12월 17~18일 회의 일정이다. 정책 결과 공개 시각은 고정하지 않는다. 엔화와 일본 금리 변화는 국내 수출주 및 금융시장에 영향을 줄 수 있으나 주가 방향을 단정할 수 없다.'
    : '전국 CPI와 도쿄 지역 잠정 CPI는 대상 지역과 기준월이 다르다. 일본 물가와 통화정책 판단의 참고 지표다. 날짜는 공식 연간 발표표 기준이며 발표 시각은 확인 전까지 표시하지 않는다.'}));

const timed = [
  ['2026-11-10','일본은행 10월 회의 의견요약','jpBoj','policy'],
  ['2026-11-16','일본 3분기 GDP 1차 속보','jpGdp','growth'],
  ['2026-12-08','일본 3분기 GDP 2차 속보','jpGdp','growth'],
  ['2026-12-23','일본은행 10월 회의 의사록','jpBoj','policy'],
  ['2026-12-28','일본은행 12월 회의 의견요약','jpBoj','policy'],
].map(([date,title,source,type]) => {
  const instant = `${date}T08:50:00+09:00`;
  return {...koreanTime(instant),instant,title,source,type,localDate:date,localTime:'08:50 JST',importance:'medium',
    description:source==='jpGdp'
      ? '내각부의 분기 GDP 발표다. 1차 속보와 2차 속보는 같은 분기의 추정치를 갱신하므로 구분해서 확인한다. 일본 경기 및 내수 흐름을 살펴보는 자료다.'
      : '이미 개최된 금융정책결정회의의 논의 내용을 공개하는 일정이다. 이날 새로운 금리 결정회의가 열리는 것은 아니다. 의견요약과 의사록은 서로 다른 자료다.'};
});

export const japanEvents = [...dated,...timed].map(event => ({
  ...event,id:`jp-${event.date}-${event.title}`,region:'JP',zone:'Asia/Tokyo',category:'macro',
  scope:'market',status:'공식 예정',checkedAt:'2026-11-07',relatedSectors:['자동차','금융','수출주'],
}));
