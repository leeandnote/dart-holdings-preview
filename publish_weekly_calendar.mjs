import {readFile,mkdir,writeFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import {loadTelegramConfig,uploadXImage,createXPost,threadsFetch,waitForThreadsContainer,publishThreadsContainer,loadInstagramConfig,instagramFetch,waitForInstagramContainer} from './send_daily_social_cards.mjs';

const week=process.argv[2];
if(week!=='2026-11-09') throw Error('Only the reviewed 2026-11-09 issue is approved by this publisher.');
const file=`site/assets/weekly/${week}.png`;
const image=await readFile(file);
if(image.subarray(1,4).toString()!=='PNG')throw Error('Invalid PNG');
const caption='[리앤노트] 다음 주 증시 일정 | 11/9~11/15\n\n11/10 미국 CPI·근원 CPI\n11/12 KOSPI 200 옵션 만기\n11/13 미국 PPI\n\n비만학회와 SC26 등 업종별 행사도 함께 정리했습니다.\n\n상세 일정·공식 출처\nhttps://leeandnote.com/calendar\n\n시간은 KST, 해외 행사는 현지 날짜 기준입니다. 일정은 변경될 수 있습니다.\n\n#리앤노트 #주간증시일정 #증시캘린더';
const shortCaption='[리앤노트] 다음 주 증시 일정 | 11/9~11/15\n11/10 미국 CPI · 11/12 옵션 만기 · 11/13 미국 PPI\n비만학회·SC26도 함께 확인하세요.\n시간 KST / 해외 행사 현지 날짜 / 일정 변경 가능\n#리앤노트 #주간증시일정';
if(process.argv.includes('--dry-run')){
  console.log(JSON.stringify({week,width:image.readUInt32BE(16),height:image.readUInt32BE(20),caption,shortCaption}));
  process.exit(0);
}
const repo=process.env.GITHUB_REPOSITORY;
if(repo!=='leeandnote/dart-holdings-preview'||!process.env.GITHUB_TOKEN)throw Error('Use the dedicated GitHub workflow.');
const statePath=`publishing-records/weekly/${week}.json`;
const api=`https://api.github.com/repos/${repo}/contents/${statePath}`;
const headers={Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json'};
let sha;
let state={week,channels:{}};
const existing=await fetch(api,{headers});
if(existing.ok){const data=await existing.json();sha=data.sha;state=JSON.parse(Buffer.from(data.content,'base64').toString());}
else if(existing.status!==404)throw Error('Cannot read publishing ledger');
async function save(){
  const result=await fetch(api,{method:'PUT',headers,body:JSON.stringify({message:`Record weekly calendar publishing ${week}`,content:Buffer.from(JSON.stringify(state,null,2)).toString('base64'),...(sha?{sha}:{})})});
  if(!result.ok)throw Error('Cannot persist publishing ledger; do not retry publishing blindly');
  sha=(await result.json()).content.sha;
}
const url=`https://leeandnote.com/assets/weekly/${week}.png`;
const remote=await fetch(url);
if(!remote.ok||crypto.createHash('sha256').update(Buffer.from(await remote.arrayBuffer())).digest('hex')!==crypto.createHash('sha256').update(image).digest('hex'))throw Error('Public image not deployed or differs from approved image');
const igUrl=`https://leeandnote.com/assets/weekly/${week}-instagram.jpg`;
const igLocal=await readFile(`site/assets/weekly/${week}-instagram.jpg`);
const igRemote=await fetch(igUrl);
if(!igRemote.ok||crypto.createHash('sha256').update(Buffer.from(await igRemote.arrayBuffer())).digest('hex')!==crypto.createHash('sha256').update(igLocal).digest('hex'))throw Error('Instagram image not deployed');
for(const channel of ['telegram','x','threads','instagram']){
  if(state.channels[channel]){console.log(`${channel}: existing state ${state.channels[channel].status}; no duplicate sent`);continue;}
  state.channels[channel]={status:'attempting',at:new Date().toISOString()};await save();
  try{
    let id;
    if(channel==='telegram'){
      const {token,chatId}=await loadTelegramConfig();
      const form=new FormData();form.set('chat_id',chatId);form.set('caption',caption);form.set('photo',new Blob([image],{type:'image/png'}),`${week}.png`);
      const response=await fetch(`https://api.telegram.org/bot${token}/sendPhoto`,{method:'POST',body:form});
      const result=await response.json();
      if(!response.ok||!result.ok)throw Error(`Telegram rejected request (${response.status})`);
      id=String(result.result.message_id);
      state.channels[channel].chatId=String(result.result.chat.id);
      if(result.result.chat.username)state.channels[channel].url=`https://t.me/${result.result.chat.username}/${id}`;
    }else if(channel==='x'){
      const mediaId=await uploadXImage(file);id=await createXPost({text:shortCaption,mediaId});
      state.channels[channel].url=`https://x.com/i/status/${id}`;
    }else if(channel==='threads'){
      const container=await threadsFetch('/me/threads',{media_type:'IMAGE',image_url:url,text:caption});
      state.channels[channel].container=container;await save();
      await waitForThreadsContainer(container);id=await publishThreadsContainer(container);
    }else{
      const {userId}=await loadInstagramConfig();
      const container=await instagramFetch(`/${userId}/media`,{image_url:igUrl,caption});
      state.channels[channel].container=container;await save();
      await waitForInstagramContainer(container);
      id=await instagramFetch(`/${userId}/media_publish`,{creation_id:container});
    }
    state.channels[channel]={...state.channels[channel],status:'published',id:String(id),completedAt:new Date().toISOString()};
    await save();console.log(`${channel}: published ${id}`);
  }catch(error){
    // An interrupted response can mean the post exists. Never auto-resend an uncertain attempt.
    state.channels[channel]={...state.channels[channel],status:'needs_review',error:String(error.message).replace(/https?:\/\/\S+/g,'[url]')};
    await save();console.log(`${channel}: needs_review`);
  }
}
await mkdir('weekly-result',{recursive:true});await writeFile('weekly-result/result.json',JSON.stringify(state,null,2));
if(Object.values(state.channels).some(c=>c.status!=='published'))process.exitCode=1;
