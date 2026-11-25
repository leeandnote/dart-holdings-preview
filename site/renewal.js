(() => {
  const banner = document.querySelector('#rn-announcement');
  try { if (Number(localStorage.getItem('rn.banner.until')) > Date.now()) banner.hidden = true; } catch {}
  const header = document.querySelector('#rn-header');
  document.querySelectorAll('#rn-navigation a').forEach(a => {
    const route = a.getAttribute('href').replace(/\/$/, '');
    if (location.pathname.replace(/\/$/, '') === route || (route === '/blog' && location.pathname.startsWith('/blog/'))) a.setAttribute('aria-current', 'page');
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-rn]');
    if (!button) return;
    switch (button.dataset.rn) {
      case 'dismiss-banner':
        banner.hidden = true;
        try { localStorage.setItem('rn.banner.until', Date.now() + 7 * 86400000); } catch {}
        break;
      case 'top': window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}); break;
      case 'menu': {
        const open = header.classList.toggle('rn-menu-open');
        button.setAttribute('aria-expanded', String(open)); break;
      }
      case 'search': document.querySelector('#rn-search').showModal(); break;
      case 'social': document.querySelector('#rn-social').showModal(); break;
      case 'close': button.closest('dialog').close(); break;
      case 'dismiss-cta': button.closest('.rn-scroll-cta').remove(); break;
    }
  });
  document.querySelectorAll('.rn-dialog').forEach(dialog => dialog.addEventListener('click', e => {
    if(e.target !== dialog) return;
    const r=dialog.getBoundingClientRect();
    if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) dialog.close();
  }));
  let last=scrollY;
  addEventListener('scroll',()=>{
    const cta=document.querySelector('.rn-scroll-cta'),body=document.querySelector('[data-rn-article] .articleBody');
    if(cta&&body){const r=body.getBoundingClientRect();cta.hidden=(innerHeight-r.top)/r.height<0.7;}
    const bar=document.querySelector('.rn-mobile-bar');
    if(Math.abs(scrollY-last)<12) return;
    bar.classList.toggle('rn-bar-hidden',scrollY>last && scrollY>180 && !bar.contains(document.activeElement));
    last=scrollY;
  },{passive:true});
})();
