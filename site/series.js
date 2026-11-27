document.querySelectorAll('.rn-series-tabs').forEach(tabs=>{
  const buttons=[...tabs.querySelectorAll('[role="tab"]')];
  const select=button=>{for(const tab of buttons){const active=tab===button;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;document.getElementById(tab.getAttribute('aria-controls')).hidden=!active;}};
  for(const button of buttons){button.addEventListener('click',()=>select(button));button.addEventListener('keydown',event=>{let index=buttons.indexOf(button);if(event.key==='ArrowRight')index=(index+1)%buttons.length;else if(event.key==='ArrowLeft')index=(index-1+buttons.length)%buttons.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=buttons.length-1;else return;event.preventDefault();select(buttons[index]);buttons[index].focus();});}
});
document.querySelectorAll('[data-note-sort]').forEach(button=>button.addEventListener('click',()=>{
  const list=document.querySelector('[data-sortable-notes]');if(!list)return;
  const first=button.dataset.noteSort==='first';
  const nodes=[...list.children].sort((a,b)=>first?Number(a.dataset.seriesNo)-Number(b.dataset.seriesNo):(Date.parse(b.dataset.published)||0)-(Date.parse(a.dataset.published)||0)||Number(b.dataset.seriesNo)-Number(a.dataset.seriesNo));
  list.append(...nodes);document.querySelectorAll('[data-note-sort]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
}));
