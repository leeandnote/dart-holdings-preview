export function completedCloseCutoff(now=new Date()) {
  const kst=new Date(now.getTime()+9*3600000);
  // Allow time for the provider to finalize the regular-session daily candle.
  if(kst.getUTCHours()<16)kst.setUTCDate(kst.getUTCDate()-1);
  while([0,6].includes(kst.getUTCDay()))kst.setUTCDate(kst.getUTCDate()-1);
  return kst.toISOString().slice(0,10);
}
export function allPriceTargets(rows) {
  const map=new Map();
  for(const row of rows){
    const code=String(row['종목코드']||row.stockCode||row.code||'').trim();
    const market=String(row['시장']||row.market||'').toUpperCase();
    if(!/^\d{6}$/.test(code)||!['KOSPI','KOSDAQ'].includes(market))continue;
    map.set(code,{code,market,name:row['종목명']||row.corpName||row.name||'',symbol:`${code}.${market==='KOSDAQ'?'KQ':'KS'}`});
  }
  return [...map.values()].sort((a,b)=>a.code.localeCompare(b.code));
}
