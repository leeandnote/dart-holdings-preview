import fs from 'node:fs';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { terms, termUrl } from './term_pages.mjs';

export function htmlFiles(root) {
  if(!fs.existsSync(root))return [];
  return fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?htmlFiles(path.join(root,e.name)):e.name.endsWith('.html')?[path.join(root,e.name)]:[]);
}
export function connectSearchPages(dist,{companiesEnabled=true}={}) {
  const companies=new Map(),backlinks=new Map();
  for(const file of companiesEnabled?htmlFiles(path.join(dist,'disclosurepedia')):[]){
    const code=path.basename(path.dirname(file)).match(/^([0-9A-Z]{6})-/)?.[1];
    if(!code)continue;
    const {document}=parseHTML(fs.readFileSync(file,'utf8'));
    companies.set(code,{file,url:new URL(document.querySelector('link[rel="canonical"]').href).pathname});
  }
  for(const file of htmlFiles(path.join(dist,'blog'))){
    const {document}=parseHTML(fs.readFileSync(file,'utf8'));
    const article=document.querySelector('article'),canonical=document.querySelector('link[rel="canonical"]')?.href;
    if(!article||!canonical)continue;
    if(!article.querySelector('.articleBreadcrumb'))article.insertAdjacentHTML('afterbegin','<nav class="articleBreadcrumb" aria-label="현재 위치"><a href="/">홈</a> › <a href="/blog/">공시 블로그</a> › <span aria-current="page">공시 해설</span></nav>');
    const linked=new Set();
    for(const cell of article.querySelectorAll('td.stock')){
      const code=cell.querySelector('small')?.textContent.trim().match(/^([0-9A-Z]{6})(?:\s|·|$)/)?.[1];
      const company=companies.get(code),name=cell.querySelector('strong');
      if(!name)continue;
      if(!companiesEnabled){
        const group=canonical.match(/\/blog\/(5percent|executives|contracts|major-events)\//)?.[1]||'5percent';
        const a=document.createElement('a');a.href=`/${group}?q=${encodeURIComponent(name.textContent.trim())}`;a.textContent=name.textContent;
        name.replaceChildren(a);continue;
      }
      if(!company){
        const original=cell.closest('tr')?.querySelector('a.subLink')?.getAttribute('href');
        if(original && /^https:\/\/dart\.fss\.or\.kr\/dsaf001\/main\.do\?rcpNo=\d+$/.test(original) && !name.querySelector('a')){
          const a=document.createElement('a');a.href=original;a.textContent=name.textContent;
          a.setAttribute('aria-label',`${name.textContent} DART 공시 원문`);name.replaceChildren(a);
        }
        continue;
      }
      if(!name.querySelector('a')){
        const a=document.createElement('a');a.href=company.url;a.textContent=name.textContent;name.replaceChildren(a);
      }
      linked.add(code);
    }
    for(const code of linked){
      const list=backlinks.get(code)||[];
      list.push({url:new URL(canonical).pathname,title:article.querySelector('h1').textContent,date:canonical.match(/\d{4}-\d{2}-\d{2}/)?.[0]||''});
      backlinks.set(code,list);
    }
    // Link text nodes only, never attributes or existing anchors.
    for(const term of terms){
      let found=false;
      const visit=node=>{
        if(found||['A','SCRIPT','STYLE','NAV','H1','H2','H3'].includes(node.nodeName))return;
        if(node.nodeType===3){
          const i=node.textContent.indexOf(term.name);if(i<0)return;
          const text=node.textContent,a=document.createElement('a');a.href=termUrl(term);a.textContent=term.name;
          node.replaceWith(document.createTextNode(text.slice(0,i)),a,document.createTextNode(text.slice(i+term.name.length)));found=true;
        }else for(const child of [...node.childNodes])visit(child);
      };
      visit(article);
    }
    fs.writeFileSync(file,document.toString());
  }
  for(const [code,company] of companies){
    const list=backlinks.get(code);if(!list?.length)continue;
    const {document}=parseHTML(fs.readFileSync(company.file,'utf8'));
    document.querySelector('#related-daily-posts')?.remove();
    const section=document.createElement('section');section.id='related-daily-posts';section.className='pediaPanel';
    section.innerHTML='<h2>이 종목이 나온 일일 공시 해설</h2><ul class="companyNews"></ul>';
    for(const item of list.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,30)){
      const li=document.createElement('li'),a=document.createElement('a');a.href=item.url;a.textContent=item.title;li.append(a);section.querySelector('ul').append(li);
    }
    document.querySelector('main').append(section);fs.writeFileSync(company.file,document.toString());
  }
  return {companies:companies.size,linkedCompanies:backlinks.size};
}
