import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function indexNowPayload(key,urls){
  if(!/^[A-Za-z0-9-]{8,128}$/.test(key))throw new Error('Invalid IndexNow key');
  const urlList=[...new Set(urls.map(raw=>{
    const url=new URL(raw);
    if(url.origin!=='https://leeandnote.com'||url.hash)throw new Error('Unexpected IndexNow URL');
    return url.href;
  }))];
  if(urlList.length>10000)throw new Error('IndexNow batch exceeds 10000 URLs');
  return {host:'leeandnote.com',key,keyLocation:`https://leeandnote.com/${key}.txt`,urlList};
}
export async function notifyIndexNow(dist='public_dist',fetcher=fetch){
  const key=fs.readFileSync(path.join(dist,'indexnow-key.txt'),'utf8').trim();
  const manifest=JSON.parse(fs.readFileSync(path.join(dist,'data/search-changes.json'),'utf8'));
  const payload=indexNowPayload(key,manifest.urls);
  if(!payload.urlList.length){console.log('IndexNow: no changed URLs');return;}
  const liveKey=await fetcher(payload.keyLocation,{signal:AbortSignal.timeout(20000)});
  if(!liveKey.ok||(await liveKey.text()).trim()!==key)throw new Error('IndexNow key not deployed; no notification sent');
  let deployed=false;
  for(let attempt=0;attempt<6;attempt++){
    const live=await fetcher('https://leeandnote.com/data/search-changes.json',{signal:AbortSignal.timeout(20000),cache:'no-store'});
    if(live.ok&&(await live.json()).generatedAt===manifest.generatedAt){deployed=true;break;}
    if(attempt<5)await new Promise(resolve=>setTimeout(resolve,5000));
  }
  if(!deployed)throw new Error('Deployment mismatch; no notification sent');
  const response=await fetcher('https://api.indexnow.org/indexnow',{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
  if(![200,202].includes(response.status))throw new Error(`IndexNow notification failed: ${response.status}`);
  console.log(`IndexNow received ${payload.urlList.length} URLs (${response.status}); this is not indexing confirmation.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await notifyIndexNow();
