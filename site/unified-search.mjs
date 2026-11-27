export function matchRecords(records,query,kind='all'){
  const terms=query.normalize('NFKC').toLocaleLowerCase('ko').trim().split(/\s+/).filter(Boolean);
  if(!terms.length)return [];
  return records.filter(r=>(kind==='all'||r.kind===kind)&&terms.every(t=>`${r.title} ${r.description} ${r.keywords}`.normalize('NFKC').toLocaleLowerCase('ko').includes(t))).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
}
if(typeof document!=='undefined'){
  const form=document.querySelector('.rn-unified-form'),input=document.querySelector('#search-query'),status=document.querySelector('#search-status'),list=document.querySelector('#search-results'),more=document.querySelector('#search-more');
  let records=[],kind='all',limit=30,loaded=false;
  input.value=new URLSearchParams(location.search).get('q')?.slice(0,120)||'';
  function render(){
    list.replaceChildren();more.hidden=true;
    if(!loaded)return;
    const results=matchRecords(records,input.value,kind);
    document.querySelector('#search-empty-character')?.remove();
    if(input.value.trim()&&!results.length){const img=document.createElement('img');img.id='search-empty-character';img.src='/assets/brand/leeandnote-full.png';img.alt='생각하는 리앤노트';img.width=120;img.height=160;status.after(img);}
    status.textContent=input.value.trim()?`${results.length.toLocaleString('ko')}건 · 수집된 공개 공시와 인사이트 기준`:'검색어를 입력해 주세요.';
    for(const r of results.slice(0,limit)){
      const li=document.createElement('li'),a=document.createElement('a'),meta=document.createElement('small'),p=document.createElement('p');
      a.href=r.url;a.textContent=r.title;
      if(r.kind==='disclosure'){a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label',`${r.title} DART 원문 (새 창)`);}
      meta.textContent=`${r.kind==='article'?'인사이트':'DART 공시'} · ${r.date||'날짜 미표기'}`;p.textContent=r.description;li.append(meta,a,p);list.append(li);
    }
    more.hidden=results.length<=limit;
  }
  form.addEventListener('submit',e=>{e.preventDefault();limit=30;const url=new URL(location.href);url.searchParams.set('q',input.value);history.pushState(null,'',url);render();});
  addEventListener('popstate',()=>{input.value=new URLSearchParams(location.search).get('q')||'';limit=30;render();});
  document.querySelectorAll('[data-kind]').forEach(button=>button.addEventListener('click',()=>{kind=button.dataset.kind;limit=30;document.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();}));
  more.addEventListener('click',()=>{limit+=30;render();});
  status.textContent='검색 자료를 불러오는 중입니다.';
  fetch('/data/search-index.json').then(r=>{if(!r.ok)throw Error('load');return r.json();}).then(data=>{records=data;loaded=true;render();}).catch(()=>{status.textContent='검색 자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';});
}
