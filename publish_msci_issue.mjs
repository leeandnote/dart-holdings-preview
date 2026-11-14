import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadTelegramConfig,threadsFetch,waitForThreadsContainer,publishThreadsContainer,instagramFetch,waitForInstagramContainer} from './send_daily_social_cards.mjs';

const caption=`MSCI 26년 11월 정기변경 - 주요 편입·편출 종목

이번 정기변경으로 MSCI ACWI에 13종목이 편입되고 100종목이 제외됩니다. 주요 종목을 이미지에 정리했습니다.

▣ 주요 편입
• 미국: 모더나
• 캐나다: 아리치아
• 중국: 중지 이노라이트 H
• 인도: LIC
• 대만: 난야 PCB

▣ 주요 편출
• 스트래티지(MSTR)
• 아이렌(IREN)
• AST 스페이스모바일(ASTS)

▣  변경 적용
2026년 11월 30일 장 마감 기준.

위 명단은 글로벌 스탠더드 지수 변경 중 일부를 발췌한 것입니다.

#리앤노트 #MSCI #MSCI편출 #MSCI편입 #지수리밸런싱 #글로벌증시`;
if([...caption].length>500)throw Error('Threads caption exceeds limit');
const hash=b=>createHash('sha256').update(b).digest('hex');
const files={original:'site/assets/weekly/msci-2026-11.png',instagram:'site/assets/weekly/msci-2026-11-instagram.jpg'};
if(process.argv.includes('--dry-run')){console.log(JSON.stringify({caption,characters:[...caption].length,channels:['telegram','threads','instagram'],files}));process.exit(0);}
if(process.env.GITHUB_REPOSITORY!=='leeandnote/dart-holdings-preview'||!process.env.GITHUB_TOKEN)throw Error('Dedicated workflow required');
const headers={Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json'};
const api='https://api.github.com/repos/leeandnote/dart-holdings-preview/contents/publishing-records/issues/msci-2026-11.json';
let state={issue:'msci-2026-11',caption,channels:{}},sha;
const existing=await fetch(api,{headers});
if(existing.ok){const data=await existing.json();sha=data.sha;state=JSON.parse(Buffer.from(data.content,'base64'));if(state.caption!==caption)throw Error('Ledger caption mismatch');}
else if(existing.status!==404)throw Error('Cannot inspect ledger');
async function save(){
  const r=await fetch(api,{method:'PUT',headers,body:JSON.stringify({message:'Record approved MSCI issue publishing',content:Buffer.from(JSON.stringify(state,null,2)).toString('base64'),...(sha?{sha}:{})})});
  if(!r.ok)throw Error('Ledger write failed; do not blindly retry');sha=(await r.json()).content.sha;
}
const urls={};
for(const [key,file] of Object.entries(files)){
  urls[key]=`https://leeandnote.com/${file.slice(5)}`;
  const r=await fetch(urls[key]);
  if(!r.ok||hash(Buffer.from(await r.arrayBuffer()))!==hash(await readFile(file)))throw Error(`Public asset not ready: ${key}`);
}
for(const channel of ['telegram','threads','instagram']){
  if(state.channels[channel]){console.log(`${channel}: existing ${state.channels[channel].status}; skipped`);continue;}
  let account;
  if(channel!=='telegram'){
    const base=channel==='threads'?'https://graph.threads.net/v1.0':'https://graph.instagram.com/v24.0';
    const token=process.env[channel==='threads'?'THREADS_ACCESS_TOKEN':'INSTAGRAM_ACCESS_TOKEN'];
    const fields=channel==='threads'?'id,username':'id,user_id,username';
    const r=await fetch(`${base}/me?fields=${fields}`,{headers:{Authorization:`Bearer ${token}`}});
    account=await r.json();
    if(!r.ok||account.username!=='leeandnote'||(channel==='instagram'&&!account.user_id))throw Error(`${channel} identity check failed`);
  }
  state.channels[channel]={status:'attempting',at:new Date().toISOString()};await save();
  try{
    let id;
    if(channel==='telegram'){
      const {token,chatId}=await loadTelegramConfig();
      const form=new FormData();form.set('chat_id',chatId);form.set('caption',caption);form.set('photo',new Blob([await readFile(files.original)],{type:'image/png'}),'msci-2026-11.png');
      const r=await fetch(`https://api.telegram.org/bot${token}/sendPhoto`,{method:'POST',body:form});const result=await r.json();
      if(!r.ok||!result.ok)throw Error(`Telegram rejected (${r.status})`);
      id=String(result.result.message_id);
      if(result.result.chat.username)state.channels[channel].url=`https://t.me/${result.result.chat.username}/${id}`;
    }else if(channel==='threads'){
      const container=await threadsFetch('/me/threads',{media_type:'IMAGE',image_url:urls.original,text:caption});
      state.channels[channel].container=container;await save();await waitForThreadsContainer(container);id=await publishThreadsContainer(container);
    }else{
      const container=await instagramFetch(`/${account.user_id}/media`,{image_url:urls.instagram,caption});
      state.channels[channel].container=container;await save();await waitForInstagramContainer(container);id=await instagramFetch(`/${account.user_id}/media_publish`,{creation_id:container});
    }
    Object.assign(state.channels[channel],{status:'published',id:String(id),completedAt:new Date().toISOString()});await save();console.log(`${channel}: published ${id}`);
  }catch(e){state.channels[channel].status='needs_review';state.channels[channel].error=String(e.message).replace(/https?:\/\/\S+/g,'[url]');await save();console.log(`${channel}: needs_review`);}
}
if(Object.values(state.channels).some(c=>c.status!=='published'))process.exitCode=1;
