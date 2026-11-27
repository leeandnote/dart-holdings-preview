import fs from 'node:fs';
import path from 'node:path';
import {articleCatalog} from './related_articles.mjs';
import {parseHTML} from 'linkedom';
export const insightVisuals={
 'rights-offering-disclosure-guide':['RIGHTS','OFFERING','유상증자 · 배정과 권리락','#fff2e1'],
 'convertible-bond-refixing-guide':['CB · BW','REFIXING','전환사채 · 잠재 주식수','#eaf1f6'],
 'national-pension-stock-holdings':['NPS','HOLDINGS','국민연금 · 보유 공시','#eef3ed'],
 'jpmorgan-five-percent-holdings':['J.P. MORGAN','DISCLOSURES','기관 · 지분 보고','#eaf1f6'],
 'blackrock-shareholdings':['BLACKROCK','HOLDINGS','외국계 기관 · 공시','#f0edef'],
 'ownership-rate-vs-share-count':['SHARES','vs. RATIO','보유 주식수 · 지분율','#eef3ed'],
 'contract-value-vs-revenue':['CONTRACT','vs. REVENUE','수주 규모 · 매출액','#eaf1f6'],
 'how-to-read-dart-disclosures':['DART','READING GUIDE','공시 읽기의 시작','#fff2e1'],
 'biotech-clinical-trials':['BIOTECH','CLINICAL TRIALS','바이오 · 임상 단계','#eef3ed'],
 'treasury-stock-buyback-disclosures':['TREASURY','SHARES','자사주 · 취득과 소각','#f0edef'],
 'samsung-electronics-executive-shareholdings':['SAMSUNG','INSIDER REPORTS','삼성전자 · 임원 보고','#eaf1f6'],
 'vip-asset-holdings':['VIP ASSET','HOLDINGS','기관 · 지분 보고','#fff2e1'],
 'truston-asset-holdings':['TRUSTON','HOLDINGS','기관 · 지분 보고','#eef3ed'],
 'align-partners-holdings':['ALIGN','HOLDINGS','기관 · 지분 보고','#f0edef'],
 'norges-bank-holdings':['NORGES BANK','HOLDINGS','기관 · 지분 보고','#eaf1f6'],
};
export function applyInsightThumbnails(dir){
 let count=0;
 for(const p of articleCatalog(dir).filter(p=>p.group==='issues')){
  const slug=p.url.split('/').filter(Boolean).at(-1),asset=`/assets/insights/${slug}.png`;
  if(!fs.existsSync(path.join(dir,asset)))continue;
  const {document:d}=parseHTML(fs.readFileSync(p.file,'utf8')),url='https://leeandnote.com'+asset;
  for(const [attr,key] of [['property','og:image'],['name','twitter:image']]){
   let meta=d.querySelector(`meta[${attr}="${key}"]`);if(!meta){meta=d.createElement('meta');meta.setAttribute(attr,key);d.head.append(meta);}meta.setAttribute('content',url);
  }
  for(const script of d.querySelectorAll('script[type="application/ld+json"]')){
   const data=JSON.parse(script.textContent);const nodes=Array.isArray(data)?data:data['@graph']||[data];
   for(const n of nodes)if(n['@type']==='Article')n.image=url;script.textContent=JSON.stringify(data);
  }
  fs.writeFileSync(p.file,d.toString());count++;
 }
 return count;
}
