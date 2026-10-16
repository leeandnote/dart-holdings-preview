export const chartGroups = {
  global: [
    {name:'S&P 500', symbol:'FOREXCOM:SPXUSD', type:'지수 CFD', source:'FOREX.com'},
    {name:'나스닥 100', symbol:'FOREXCOM:NSXUSD', type:'지수 CFD', source:'FOREX.com'},
  ],
  rates: [
    {name:'달러 / 원', symbol:'FX_IDC:USDKRW', type:'환율 · KRW/USD', source:'ICE Data Services'},
    {name:'달러 / 엔', symbol:'FX:USDJPY', type:'환율 · JPY/USD', source:'FXCM'},
    {name:'미국 국채 10년 금리', symbol:'TVC:US10Y', type:'수익률 · % · 외부 위젯 미지원', external:true},
    {name:'미국 국채 2년 금리', symbol:'TVC:US02Y', type:'수익률 · % · 외부 위젯 미지원', external:true},
  ],
  commodities: [
    {name:'금', symbol:'OANDA:XAUUSD', type:'금 / 달러 · USD/트로이온스', source:'OANDA'},
    {name:'WTI 원유', symbol:'OANDA:WTICOUSD', type:'원유 CFD · USD/배럴', source:'OANDA'},
  ],
  domestic: [
    {name:'코스피', symbol:'KRX:KOSPI', type:'KRX 현물 지수'},
    {name:'코스닥', symbol:'KRX:KOSDAQ', type:'KRX 현물 지수'},
    {name:'코스피 200 선물', symbol:'KRX:K2I1!', type:'연속선물 · 야간 세션 포함 여부 미확인'},
    {name:'코스닥 150 선물', symbol:'KRX:KQI1!', type:'연속선물 · 야간 세션 포함 여부 미확인'},
  ],
};
export const chartUrl = symbol => `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`;
export function widgetOptions(symbol) {
  return {symbol, autosize:true, interval:'D', timezone:'Asia/Seoul', theme:'light', style:'1', locale:'kr', allow_symbol_change:false, hide_side_toolbar:true, hide_top_toolbar:false, hide_legend:false, hide_volume:true, save_image:false, calendar:false, withdateranges:true, support_host:'https://www.tradingview.com'};
}
