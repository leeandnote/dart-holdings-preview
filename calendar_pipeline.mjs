import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const categoryMap={'매크로':'macro','정치/지정학':'politics','주요실적':'earnings','산업/학회/정책':'industry'};
const hash=(value)=>createHash('sha256').update(value).digest('hex').slice(0,24);
const clean=(s)=>String(s||'').replace(/<[^>]*>/g,'').replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>');
const normalize=(s)=>String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function validateCandidate(event,article) {
  const body=article.text;
  if(!event || typeof event.title!=='string' || !event.title.trim() || event.title.length>160) return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(event.date)||!Number.isFinite(Date.parse(event.date))||new Date(event.date).toISOString().slice(0,10)!==event.date) return null;
  if(!Object.hasOwn(categoryMap,event.category)||!['high','medium','low'].includes(event.importance)) return null;
  if(!['scheduled','cancelled'].includes(event.status)||event.sourceUrl!==article.url||!/^https?:\/\//.test(article.url)) return null;
  if(!event.evidence || event.evidence.length>400 || !event.dateEvidence || !body.includes(event.evidence)||!event.evidence.includes(event.dateEvidence)) return null;
  if(/루머|미확정|검토 중|가능성|추측|rumou?r|unconfirmed|might|may be/i.test(event.evidence)) return null;
  const [year,month,day]=event.date.split('-').map(Number);
  const explicit=new RegExp(`${year}(?:년\\s*|[-./])0?${month}(?:월\\s*|[-./])0?${day}(?:일|\\b)`);
  // Conservative: converted cross-date/time events need review rather than guessing.
  if(!explicit.test(event.dateEvidence)) return null;
  if(event.time!==null && (!/^([01]\d|2[0-3]):[0-5]\d KST$/.test(event.time)||event.dateBasis!=='KST'||!event.evidence.includes(event.time)))return null;
  if(!['KST','America/New_York','Asia/Tokyo','Asia/Shanghai'].includes(event.dateBasis)) return null;
  if(!['KR','US','JP','CN','GLOBAL'].includes(event.region)) return null;
  const basisEvidence={KST:/한국시간|KST/, 'America/New_York':/미국 동부|EST|EDT|Eastern/, 'Asia/Tokyo':/일본시간|JST/, 'Asia/Shanghai':/중국시간|베이징시간/};
  if(!basisEvidence[event.dateBasis].test(event.evidence)) return null;
  if(!['entity','eventKind','period'].every(k=>typeof event[k]==='string'&&event[k].trim()&&body.includes(event[k])))return null;
  if(!Array.isArray(event.relatedSectors)||!event.relatedSectors.every(s=>typeof s==='string'&&s.length<40))return null;
  if(!Array.isArray(event.relatedStockCodes)||!event.relatedStockCodes.every(s=>/^\d{6}$/.test(s)&&body.includes(s)))return null;
  return {...event,id:hash([event.entity,event.eventKind,event.period].map(normalize).join('|')),category:categoryMap[event.category],type:categoryMap[event.category],zone:event.dateBasis==='KST'?'Asia/Seoul':event.dateBasis,scope:event.relatedStockCodes.length?'company':'market',provenance:'news',description:'뉴스 검색 결과에서 추출한 일정입니다. 원문과 공식 발표를 함께 확인하세요.',sourcePublishedAt:article.publishedAt};
}
export function upsertEvents(existing,incoming) {
  const rows=new Map(existing.map(e=>[e.id,e]));
  for(const event of incoming){
    const similar=[...rows.values()].find(row=>row.date===event.date&&normalize(row.entity)===normalize(event.entity)&&normalize(row.period)===normalize(event.period)&&normalize(row.eventKind)===normalize(event.eventKind)&&titleSimilarity(row.title,event.title)>=0.8);
    const key=similar?.id||event.id;
    const old=rows.get(key);
    if(old && Date.parse(old.sourcePublishedAt)>Date.parse(event.sourcePublishedAt))continue;
    rows.set(key,{...event,id:key,previousDate:old && old.date!==event.date?old.date:old?.previousDate,updatedAt:new Date().toISOString()});
  }
  return [...rows.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
export function titleSimilarity(a,b){
  const grams=value=>{const s=normalize(value);return new Set(Array.from({length:Math.max(0,s.length-1)},(_,i)=>s.slice(i,i+2)));};
  if(normalize(a)===normalize(b))return 1;
  const x=grams(a),y=grams(b);return x.size+y.size?2*[...x].filter(v=>y.has(v)).length/(x.size+y.size):0;
}
async function fetchArticles(env,request) {
  const articles=new Map();
  for(const keyword of ['실적발표 일정','학회 개최 일정','선거 일정','공시 주주총회 일정','규제 시행 일정']){
    const response=await request(`https://naverapihub.apigw.ntruss.com/search/v1/news?query=${encodeURIComponent(keyword)}&display=5&sort=date&format=json`,{headers:{'X-NCP-APIGW-API-KEY-ID':env.NAVER_CLIENT_ID,'X-NCP-APIGW-API-KEY':env.NAVER_CLIENT_SECRET},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error(`News fetch failed: HTTP ${response.status}`);
    for(const item of (await response.json()).items||[]){
      const url=item.originallink||item.link;
      if(!/^https?:\/\//.test(url||'')||!Number.isFinite(Date.parse(item.pubDate)))continue;
      articles.set(url,{url,text:clean(item.title)+'\n'+clean(item.description),publishedAt:new Date(item.pubDate).toISOString()});
    }
  }
  return [...articles.values()];
}
export async function extractArticle(article) {
  const body=article.text;
  if(/루머|미확정|가능성|추측|전망|검토|예상|연기|취소/.test(body))return [];
  const dates=[...body.matchAll(/(20\d{2})(?:년\s*|[-./])(\d{1,2})(?:월\s*|[-./])(\d{1,2})(?:일|\b)/g)];
  // Multiple dates or missing timezones need review, not heuristic date selection.
  if(dates.length!==1 || !/확정|개최한다|개최할|발표한다|발표할|시행한다/.test(body))return [];
  const match=dates[0];
  const zones=[['KST',/한국시간|KST/,'KR'],['America/New_York',/미국 동부|EST|EDT|Eastern/,'US'],['Asia/Tokyo',/일본시간|JST/,'JP'],['Asia/Shanghai',/중국시간|베이징시간/,'CN']].filter(([,pattern])=>pattern.test(body));
  if(zones.length!==1)return [];
  const kind=body.match(/실적\s*발표|주주총회|학회|선거|규제\s*시행|금리\s*결정/);
  if(!kind)return [];
  const date=`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
  const entity=body.match(/^[\p{L}\p{N}·&.-]+/u)?.[0];
  if(!entity)return [];
  const category=/실적|주주총회/.test(kind[0])?'주요실적':/선거/.test(kind[0])?'정치/지정학':/금리/.test(kind[0])?'매크로':'산업/학회/정책';
  const dateBasis=zones[0][0];
  const clock=body.match(/\b(?:[01]\d|2[0-3]):[0-5]\d KST\b/);
  const event={date,time:dateBasis==='KST'?(clock?.[0]||null):null,title:`${entity} ${kind[0]}`,category,importance:'medium',relatedSectors:[],relatedStockCodes:[],sourceUrl:article.url,entity,eventKind:kind[0],period:match[0],status:'scheduled',region:zones[0][2],dateBasis,evidence:body,dateEvidence:match[0]};
  // Generic news headlines cannot reliably identify the organizer: require review.
  event.requiresReview=true;
  return [event];
}
export async function run({env=process.env,request=fetch}={}) {
  for(const key of ['NAVER_CLIENT_ID','NAVER_CLIENT_SECRET'])if(!env[key])throw new Error(`Missing ${key}`);
  const file='site/data/calendar-auto.json';
  const stateFile='calendar-pipeline-state.json';
  const read=async(file,fallback)=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}};
  const prior=await read(file,{events:[]});
  const state=await read(stateFile,{processed:[]});
  const processed=new Set(state.processed);
  const approvals=await read('calendar-approved.json',{events:[]});
  const accepted=[];
  for(const item of approvals.events){
    const valid=validateCandidate(item.event,item.article);
    if(!valid || item.event.requiresReview!==false)throw new Error('Invalid reviewed calendar event');
    accepted.push(valid);
  }
  const review=await read('calendar-pipeline-review.json',[]);
  for(const article of await fetchArticles(env,request)){
    const fingerprint=hash(article.url+article.text);
    if(processed.has(fingerprint))continue;
    const candidates=await extractArticle(article);
    if(!candidates.length)review.push({sourceUrl:article.url,reason:'No unambiguous absolute event date, timezone and announcement found'});
    for(const candidate of candidates){
      const valid=validateCandidate(candidate,article);
      if(valid&&!candidate.requiresReview)accepted.push(valid);else review.push({sourceUrl:article.url,reason:'Rule-derived news candidate requires organizer/date verification',candidate:valid||undefined});
    }
    processed.add(fingerprint);
  }
  const events=upsertEvents(prior.events,accepted);
  // All external calls must succeed before replacing the public snapshot.
  await fs.mkdir('site/data',{recursive:true});
  await fs.writeFile(file+'.tmp',JSON.stringify({updatedAt:new Date().toISOString(),events},null,2));
  await fs.rename(file+'.tmp',file);
  await fs.writeFile(stateFile,JSON.stringify({processed:[...processed].slice(-5000)},null,2));
  await fs.writeFile('calendar-pipeline-review.json',JSON.stringify(review,null,2));
  console.log(JSON.stringify({mode:'rules-no-llm',accepted:accepted.length,review:review.length,total:events.length}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)run().catch(error=>{console.error(error.message);process.exitCode=1;});
