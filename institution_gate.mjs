import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {institutionDefinitions} from './institution_topics.mjs';
import {htmlFiles} from './search_graph.mjs';
const slugs=new Set([...institutionDefinitions.map(d=>d[0]),'jpmorgan-five-percent-holdings','blackrock-shareholdings','national-pension-stock-holdings']);
export function applyInstitutionGate(document){
 const slug=document.querySelector('link[rel="canonical"]')?.getAttribute('href')?.split('/').filter(Boolean).at(-1);
 if(!slugs.has(slug))return null;
 const article=document.querySelector('article');if(!article)return null;
 article.setAttribute('data-rn-institution','');
 const reports=new Set([...article.querySelectorAll('table a[href]')].map(a=>a.getAttribute('href')).filter(h=>/^https:\/\/dart\.fss\.or\.kr\/dsaf001\/main\.do\?rcpNo=\d{14}$/.test(h)));
 if(reports.size<10){
  let meta=document.querySelector('meta[name="robots"]');if(!meta){meta=document.createElement('meta');meta.setAttribute('name','robots');document.head.append(meta);}
  meta.setAttribute('content','noindex, follow');
 }
 return {slug,reports:reports.size,indexable:reports.size>=10};
}
export function applyInstitutionGates(dir){const results=[];for(const file of htmlFiles(dir)){const {document}=parseHTML(fs.readFileSync(file,'utf8'));const result=applyInstitutionGate(document);if(result){fs.writeFileSync(file,document.toString());results.push(result);}}return results;}
