export function toCalendarEvents(snapshot) {
  return (snapshot.events||[]).filter(e=>e.status==='scheduled'&&/^https?:\/\//.test(e.sourceUrl||'')&&/^\d{4}-\d{2}-\d{2}$/.test(e.date)).map(e=>({...e,source:'news-'+e.id,status:'뉴스 기반 · 공식 재확인 필요',checkedAt:snapshot.updatedAt?.slice(0,10),time:e.time||undefined}));
}
