import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {loadNotes,validateNote,noteHash} from './note_series.mjs';
export function queueStatus(notes,now=new Date().toISOString()){
  const date=new Date(Date.parse(now)+9*3600000);date.setUTCDate(date.getUTCDate()+1);
  const tomorrow=date.toISOString().slice(0,10);
  const ready=notes.filter(n=>validateNote(n,now).ready&&new Date(Date.parse(n.meta.publish_at)+9*3600000).toISOString().slice(0,10)===tomorrow);
  const horizon=Date.parse(now)+7*86400000;
  const stocked=notes.filter(n=>validateNote(n,now).ready&&Date.parse(n.meta.publish_at)>Date.parse(now)&&Date.parse(n.meta.publish_at)<=horizon).length;
  return {tomorrow,ready:ready.length,sevenDayStock:stocked};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const notes=loadNotes();
  if(process.argv.includes('--hashes'))console.log(JSON.stringify(notes.map(n=>({slug:n.slug,content_sha256:noteHash(n)})),null,2));
  else {
    const status=queueStatus(notes);console.log('NOTE_QUEUE='+JSON.stringify(status));
    fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/note-queue-status.json',JSON.stringify(status));
    if(!status.ready){
      const message=`[리앤노트 운영] ${status.tomorrow} 07:00 예약 글이 없습니다. 검수·품질 기준을 통과한 다음 7일 원고: ${status.sevenDayStock}편. 공개 예고나 빈 글은 발행하지 않습니다.`;
      console.warn(message);
      const token=process.env.TELEGRAM_BOT_TOKEN,chat=process.env.TELEGRAM_OPERATOR_CHAT_ID;
      // Never fall back to the public disclosure channel.
      if(process.argv.includes('--notify')&&token&&/^\d+$/.test(chat||'')){
        const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chat,text:message}),signal:AbortSignal.timeout(15000)});
        const result=await response.json();if(!response.ok||!result.ok)throw new Error('Operator Telegram delivery failed');
        console.log('OPERATOR_ALERT_SENT');
      }else console.warn('OPERATOR_ALERT_NOT_SENT: private TELEGRAM_OPERATOR_CHAT_ID/token required; public channel is not used.');
    }
  }
}
