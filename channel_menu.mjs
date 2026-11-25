import fs from 'node:fs';
import path from 'node:path';
import { parseHTML } from 'linkedom';

export const channels = [
  ['IG', '인스타그램', 'https://www.instagram.com/leeandnote/'],
  ['N', '블로그', 'https://blog.naver.com/leeandnote'],
  ['@', '스레드', 'https://www.threads.com/@leeandnote'],
  ['▶', '유튜브', 'https://www.youtube.com/@%EB%A6%AC%EC%95%A4%EB%85%B8%ED%8A%B8'],
  ['↗', '텔레그램', 'https://t.me/leeandnote'],
];

export function applyChannelMenu(html) {
  const { document } = parseHTML(html);
  if (!document.body) return html;
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (/^(?:https:\/\/leeandnote.com)?\/disclosurepedia\/?$/.test(href) &&
        (a.closest('nav') || a.classList.contains('radarRow'))) a.remove();
  }
  if (!document.querySelector('#channel-menu')) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<details id="channel-menu" class="channelMenu"><summary title="리앤노트 공식 채널"><span aria-hidden="true">↗</span><span>채널</span></summary><nav aria-label="리앤노트 공식 채널">${channels.map(([icon, name, href]) => `<a href="${href}" target="_blank" rel="noopener noreferrer" aria-label="${name}${name === '텔레그램' ? ' 실시간 공시' : ''} (새 창)"><span class="channelMark" aria-hidden="true">${icon}</span><span>${name}${name === '텔레그램' ? '<small>실시간 공시</small>' : ''}</span><span class="channelArrow" aria-hidden="true">↗</span></a>`).join('')}</nav></details>`;
    document.body.append(wrap.firstElementChild);
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = '/channel-menu.css';
    document.head.append(css);
    const js = document.createElement('script');
    js.src = '/channel-menu.js'; js.defer = true;
    document.body.append(js);
  }
  return document.toString();
}

export function applyChannelMenus(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) count += applyChannelMenus(file);
    else if (entry.name.endsWith('.html')) {
      fs.writeFileSync(file, applyChannelMenu(fs.readFileSync(file, 'utf8')));
      count++;
    }
  }
  return count;
}
