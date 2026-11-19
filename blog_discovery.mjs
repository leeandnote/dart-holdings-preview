import fs from 'node:fs';
import path from 'node:path';
import {parseHTML} from 'linkedom';
import {htmlFiles} from './search_graph.mjs';
import {receiptDate} from './daily_content.mjs';

export function blogDisclosureRows(site) {
  const dir=path.join(site,'data','blog-disclosures');
  if (!fs.existsSync(dir)) return [];
  const seen=new Set(), rows=[];
  for (const name of fs.readdirSync(dir).filter(n=>/^\d{8}\.json$/.test(n))) {
    for (const row of JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'))) {
      if (!/^[0-9A-Z]{6}$/.test(row.code) || !row.name || receiptDate(row)!==name.slice(0,8) || !/^https:\/\/dart\.fss\.or\.kr\/dsaf001\/main\.do\?rcpNo=\d{14}$/.test(row.url)) continue;
      const key=[row.receiptNo,row.code,row.reporter].join('|');
      if(seen.has(key))continue;
      seen.add(key);
      rows.push({...row,reportName:row.category==='임원·주요주주'?'임원ㆍ주요주주특정증권등소유상황보고서':'주식등의대량보유상황보고서',summary:[row.reporter,'보유비율 '+row.rateText,'수량 '+row.shareDeltaText,row.reason].join(' · ')});
    }
  }
  return rows;
}

export function createMonthlyArchives(dist) {
  const blog=path.join(dist,'blog'), template=path.join(blog,'index.html');
  if(!fs.existsSync(template)) return {months:0,articles:0};
  const posts=[];
  for(const file of htmlFiles(blog)) {
    const relative=path.relative(blog,file).replaceAll('\\','/');
    const match=relative.match(/^(5percent|executives|contracts|major-events)\/(\d{4}-\d{2}-\d{2})\/index\.html$/);
    if(!match)continue;
    const {document}=parseHTML(fs.readFileSync(file,'utf8'));
    const title=document.querySelector('article h1')?.textContent;
    if(title && !/noindex/.test(document.querySelector('meta[name="robots"]')?.content||''))posts.push({title,kind:match[1],date:match[2],url:'/blog/'+match[1]+'/'+match[2]+'/'});
  }
  posts.sort((a,b)=>b.date.localeCompare(a.date)||a.kind.localeCompare(b.kind));
  const months=[...new Set(posts.map(p=>p.date.slice(0,7)))];
  const source=fs.readFileSync(template,'utf8');
  for(const month of months) {
    const {document}=parseHTML(source);
    const title=month.replace('-','년 ')+'월 공시 아카이브';
    const url='https://leeandnote.com/blog/archive/'+month+'/';
    document.title=title+' | 리앤노트';
    document.querySelector('link[rel="canonical"]').href=url;
    for(const [selector,value] of [['meta[name="description"]',title],['meta[property="og:title"]',title],['meta[property="og:url"]',url],['meta[property="og:description"]',title]])document.querySelector(selector)?.setAttribute('content',value);
    document.querySelectorAll('script[type="application/ld+json"]').forEach(s=>s.remove());
    const schema=document.createElement('script');schema.type='application/ld+json';schema.textContent=JSON.stringify({'@context':'https://schema.org','@type':'CollectionPage',name:title,url});document.head.append(schema);
    const main=document.querySelector('main');main.replaceChildren();
    const crumb=document.createElement('a');crumb.href='/blog/';crumb.textContent='공시 블로그';main.append(crumb);
    const h1=document.createElement('h1');h1.textContent=title;main.append(h1);
    const nav=document.createElement('nav');nav.className='categoryBar';nav.setAttribute('aria-label','월별 공시 아카이브');
    for(const m of months){const a=document.createElement('a');a.href='/blog/archive/'+m+'/';a.textContent=m;if(m===month)a.setAttribute('aria-current','page');nav.append(a);}main.append(nav);
    const list=document.createElement('ul');list.className='monthlyPostList';
    for(const post of posts.filter(p=>p.date.startsWith(month))){const li=document.createElement('li'),a=document.createElement('a');a.href=post.url;a.textContent=post.title;li.append(a);list.append(li);}main.append(list);
    const style=document.createElement('style');style.textContent='.monthlyPostList{list-style:none;padding:0;margin:24px 0}.monthlyPostList li{padding:16px 0;border-bottom:1px solid #dfe5ec}.monthlyPostList a{color:#182234;line-height:1.6;overflow-wrap:anywhere}.blogShell>h1{font-size:28px;margin:24px 0;letter-spacing:0}';document.head.append(style);
    const target=path.join(blog,'archive',month);fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,'index.html'),document.toString());
  }
  for(const kind of ['', '5percent','executives','contracts','major-events']) {
    const file=path.join(blog,kind,'index.html');if(!fs.existsSync(file))continue;
    const {document}=parseHTML(fs.readFileSync(file,'utf8'));
    document.querySelector('#monthly-archives')?.remove();
    const nav=document.createElement('nav');nav.id='monthly-archives';nav.className='categoryBar';nav.setAttribute('aria-label','월별 공시 아카이브');
    for(const month of months){const a=document.createElement('a');a.href='/blog/archive/'+month+'/';a.textContent=month+' 전체 글';nav.append(a);}
    const grid=document.querySelector('.insightGrid');if(grid)grid.before(nav);else document.querySelector('main').append(nav);
    fs.writeFileSync(file,document.toString());
  }
  return {months:months.length,articles:posts.length};
}
