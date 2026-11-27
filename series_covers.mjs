import fs from 'node:fs';
import path from 'node:path';
import {Resvg} from '@resvg/resvg-js';
import {series,escape as e,safeSlug} from './note_series.mjs';

export function renderCover(dir,note){
  const cfg=series[note.series];if(!cfg||!safeSlug(note.slug))throw new Error('Invalid cover metadata');
  const keyword=note.keyword||note.title||cfg.name;
  const lines=Array.from(keyword).reduce((a,c)=>{if(a.at(-1).length>=15)a.push('');a[a.length-1]+=c;return a;},['']).slice(0,3);
  const name=note.series==='basics'?'leeandnote-full.png':'leeandnote-avatar.png';
  let image=path.join(dir,'assets/brand',name);
  if(!fs.existsSync(image))image=path.join(dir,'assets/brand/leeandnote-full.png');
  const avatar=fs.existsSync(image)?`<image href="data:image/png;base64,${fs.readFileSync(image).toString('base64')}" x="930" y="285" width="180" height="260" preserveAspectRatio="xMidYMid meet"/>`:'';
  const grid=note.series==='calendar'?Array.from({length:7},(_,i)=>`<path d="M${80+i*110} 455v90 M80 ${455+i*15}h660" stroke="#ccd1d6"/>`).join(''):'';
  const bars=note.series==='weekly'?'<path d="M90 540v-70 M145 540v-110 M200 540v-50 M255 540v-140" stroke="#ff5500" stroke-width="28"/>':'';
  const sub=note.series==='policy'?note.basis_date?`기준일 ${note.basis_date}`:'':note.series==='investor'&&note.receiptCount?`공시 ${note.receiptCount}건`:note.series==='calendar'?note.period||'': '';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="${cfg.color}"/><text x="70" y="72" fill="${cfg.ink}" font-family="Alata" font-size="24">${e(cfg.badge)}${note.series_no?' no.'+String(note.series_no).padStart(2,'0'):''}</text><path d="M70 102h1060" stroke="${cfg.ink}" stroke-opacity=".3"/>${lines.map((line,i)=>`<text x="70" y="${210+i*78}" fill="${cfg.ink}" font-family="Noto Sans KR" font-weight="500" font-size="64">${e(line)}</text>`).join('')}${grid}${bars}${avatar}<text x="70" y="${note.series==='weekly'||note.series==='calendar'?420:490}" fill="${cfg.ink}" font-family="Noto Sans KR" font-size="26">${e(sub)}</text><text x="70" y="585" fill="${cfg.ink}" font-family="Alata" font-size="24">LEE&amp;NOTE.</text></svg>`;
  const target=path.join(dir,'assets/series');fs.mkdirSync(target,{recursive:true});
  const nameOut=`${note.slug}.png`;
  const fontFiles=['Alata-Regular.ttf','NotoSansKR-Medium.otf'].map(n=>path.join(dir,'assets/fonts',n));
  if(fontFiles.some(f=>!fs.existsSync(f)))throw new Error('Cover font missing');
  const png=new Resvg(svg.replaceAll('font-family="Noto Sans KR"','font-family="Noto Sans CJK KR"'),{font:{fontFiles,loadSystemFonts:false}}).render().asPng();
  fs.writeFileSync(path.join(target,nameOut),png);
  return `/assets/series/${nameOut}`;
}
