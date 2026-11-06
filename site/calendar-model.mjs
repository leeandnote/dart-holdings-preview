// @ts-check
/** @typedef {'macro'|'politics'|'earnings'|'industry'|'expiry'|'index'|'holiday'} Category */
/** @typedef {{date:string,title:string,type:string,zone:string,category?:Category,importance?:'high'|'medium'|'low',relatedSectors?:string[],instant?:string,time?:string,relatedSources?:string[]}} CalendarEvent */
/** @type {Record<Category,string>} */
export const categories = {macro:'매크로/경제지표',politics:'정치/지정학',earnings:'주요 실적',industry:'산업/학회/정책',expiry:'선물·옵션 만기',index:'ETF·지수 정기변경',holiday:'휴장·단축거래'};
/** @param {CalendarEvent} event */
export function normalizeEvent(event) {
  /** @type {Record<string,Category>} */
  const legacy = {policy:'macro',macro:'macro',growth:'macro',trade:'macro',earnings:'earnings',expiry:'expiry',index:'index',holiday:'holiday',politics:'politics',industry:'industry'};
  return {...event,category:event.category || legacy[event.type] || 'industry',importance:event.importance || (event.relatedSources ? 'high' : 'medium'),relatedSectors:event.relatedSectors || []};
}
/** @param {CalendarEvent} event @param {string} category */
export function matchesCategory(event, category) { return category === 'all' || normalizeEvent(event).category === category; }
/** @param {CalendarEvent} event */
export function zoneBadge(event) {
  if (event.instant || /KST/.test(event.time || '') || event.zone === 'Asia/Seoul') return 'KST';
  if (event.zone === 'America/New_York') {
    // Noon is only used to determine the date's daylight-saving label, not an event time.
    return new Intl.DateTimeFormat('en-US',{timeZone:event.zone,timeZoneName:'short'}).formatToParts(new Date(event.date+'T12:00:00Z')).find(p=>p.type==='timeZoneName')?.value || 'ET';
  }
  return event.zone === 'Asia/Tokyo' ? 'JST' : event.zone === 'Asia/Shanghai' ? 'CST (중국)' : '현지 날짜';
}
/** @template T @param {T[]} events @param {number} limit */
export function splitDay(events, limit = 3) { return {visible:events.slice(0,limit),hidden:Math.max(0,events.length-limit)}; }
