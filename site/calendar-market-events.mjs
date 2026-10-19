import { koreanTime } from './calendar-macro.mjs';

export const marketSources = {
  samsung: ['삼성전자 IR · 실적 발표', 'https://www.samsung.com/global/ir/'],
  hynix: ['SK하이닉스 · 실적 설명회 공시 (SEC)', 'https://www.sec.gov/Archives/edgar/data/2120882/000119312526420934/d413172d6k.htm'],
  microsoft: ['Microsoft IR · 실적 일정', 'https://www.microsoft.com/en-us/investor/default'],
  meta: ['Meta IR · 실적 일정', 'https://investor.atmeta.com/home/default.aspx'],
  tesla: ['Tesla IR · 3분기 실적 설명회 안내', 'https://ir.tesla.com/press-release/tesla-third-quarter-2026-production-deliveries-and-deployments'],
  amazon: ['Amazon · 3분기 실적 설명회 안내', 'https://press.aboutamazon.com/2026/10/amazon-com-to-webcast-third-quarter-2026-financial-results-conference-call'],
  customsMonth: ['관세청 · 9월 수출입 잠정치', 'https://www.customs.go.kr/kcs/na/ntt/selectNttInfo.do?bbsId=1362&mi=2891&nttSn=10178304&nttSnUrl=9714bd0f6916ae89827b90b1f37f4b19'],
  customsTen: ['관세청 · 10월 1~10일 수출입', 'https://www.customs.go.kr/kcs/na/ntt/selectNttInfo.do?bbsId=1362&mi=2891&nttSn=10179143&nttSnUrl=2fbd97b6ed3711c34f4810ce485a72ce'],
  customsRule: ['관세청 · 수출입 통계 공표 주기', 'https://www.customs.go.kr/kcs/na/ntt/selectNttInfo.do?bbsId=2280&mi=10600&nttSn=10141577&nttSnUrl=862449616390be79d16b6d008088964d'],
  nbs: ['중국 국가통계국 · 2026 발표 일정', 'https://www.stats.gov.cn/english/PressRelease/ReleaseCalendar/202512/t20251226_1962154.html'],
  cboe: ['Cboe · 2026 옵션 만기 달력', 'https://cdn.cboe.com/resources/options/Cboe2026OPTIONSCalendar.pdf'],
};

const earnings = [
  ['2026-10-29T10:00:00+09:00', '삼성전자 3분기 실적 컨퍼런스콜', 'KR', 'samsung', 'Asia/Seoul', '10:00 KST', '잠정실적과 구분되는 실적 설명회다. 사업부별 수익성과 메모리 사업 전망을 확인하는 일정이며, 특정 HBM 정보의 공개를 보장하지 않는다.'],
  ['2026-10-28T09:00:00+09:00', 'SK하이닉스 3분기 실적 컨퍼런스콜', 'KR', 'hynix', 'Asia/Seoul', '09:00 KST', '3분기 실적과 질의응답 예정. HBM·메모리 수익성과 투자계획을 확인할 수 있는 일정이며 실적 방향을 미리 단정하지 않는다.'],
  ['2026-10-21T13:30:00-07:00', '메타 3분기 실적 컨퍼런스콜', 'US', 'meta', 'America/Los_Angeles', '13:30 PDT', '미국 현지 10월 21일 설명회. 광고 매출과 AI 설비투자 계획은 국내 반도체·전력인프라 업종의 참고 지표다.'],
  ['2026-10-21T17:30:00-04:00', '테슬라 3분기 실적 설명회', 'US', 'tesla', 'America/New_York', '17:30 EDT', '실적 자료는 미국 현지 장 종료 후 공개 예정이며 표시 시각은 질의응답 웹캐스트 시작 시각이다. 자동차 수익성과 에너지 사업을 확인한다.'],
  ['2026-10-29T17:00:00-04:00', '아마존 3분기 실적 컨퍼런스콜', 'US', 'amazon', 'America/New_York', '17:00 EDT', '미국 현지 10월 29일 설명회. AWS 성장과 AI 설비투자 계획을 확인하는 일정이다.'],
].map(([instant,title,region,source,zone,localTime,description]) => ({
  ...koreanTime(instant), instant, localDate: instant.slice(0,10), localTime,
  title, region, source, zone, description, type: 'earnings', status: '공식 일정',
}));

const china = [
  ['2026-10-19', '중국 3분기 GDP · 9월 소매판매·산업생산'],
  ['2026-11-16', '중국 10월 소매판매·산업생산'],
  ['2026-12-15', '중국 11월 소매판매·산업생산'],
].map(([localDate,title]) => {
  const instant = `${localDate}T10:00:00+08:00`;
  return { ...koreanTime(instant), instant, localDate, localTime: '10:00 중국시간', title,
    region:'CN', source:'nbs', zone:'Asia/Shanghai', type:'growth', status:'공식 예정',
    description:'국가통계국 연간 발표 계획 기준으로 변경될 수 있다. 한국시간 오전 11시로 장중 발표에 해당한다. 중국 소비 및 생산 흐름을 확인하되 국내 화장품·화학·철강 등의 주가 방향을 단정하지 않는다.' };
});

const trade = [
  ['2026-10-01', '관세청 9월 수출입 잠정치', 'customsMonth', '공식 발표'],
  ['2026-10-12', '관세청 10월 1~10일 수출입', 'customsTen', '공식 발표'],
  ['2026-10-21', '관세청 10월 1~20일 수출입 (예정)', 'customsRule', '규칙 기준'],
].map(([date,title,source,status]) => ({date,title,source,status,type:'trade',region:'KR',zone:'Asia/Seoul',time:'시각 미확인',
  description: status === '규칙 기준'
    ? '관세청 공표 주기(11일·21일·익월 1일)에 따른 예상 날짜다. 개별 발표 공지로 확정한 날짜가 아니며 변경될 수 있다. 반도체 등 품목별 수출과 조업일수 차이를 함께 확인한다.'
    : '관세청 보도자료 등록일 기준이다. 월 전체와 1~10일·1~20일 잠정치는 집계 기간이 다르다. 전년 대비 증감률뿐 아니라 조업일수와 일평균 수출을 함께 확인한다.'}));

const expiries = ['2026-10-16','2026-11-20','2026-12-18'].map(date => ({
  date,title:'미국 표준 월물 옵션 만기',type:'expiry',region:'US',source:'cboe',status:'공식 일정',
  zone:'America/New_York',time:'미국 현지 날짜 · 상품별 시각 상이',
  description:'미국 개별주식·지수 옵션의 표준 월물 만기 일정. 주간·일일 만기는 제외한다. 상품에 따라 오전(AM)·오후(PM) 정산과 최종거래일이 다르므로 모든 옵션이 이날 장마감에 정산되는 것은 아니다. 다음 국내 거래일의 주가 방향을 예측하는 지표는 아니다.',
}));

export const marketEvents = [...earnings, ...china, ...trade, ...expiries, {
  date:'2026-10-28',title:'마이크로소프트 FY27 1분기 실적',region:'US',source:'microsoft',zone:'America/Los_Angeles',
  type:'earnings',status:'공식 일정',time:'미국 현지 날짜 · 시각 미확인',
  description:'기업 IR에 공표된 현지 날짜다. 시각을 확인하지 못해 한국시간 날짜로 변환하지 않았다. 회계연도 2027년 1분기는 달력 기준 2026년 3분기에 해당한다. 클라우드와 AI 투자계획을 확인한다.',
}].map(event => ({...event, checkedAt:'2026-10-19'}));
