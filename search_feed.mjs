import fs from 'node:fs';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { htmlFiles } from './search_graph.mjs';

const origin = 'https://leeandnote.com';
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));

export function collectFeedArticles(dist, now = new Date().toISOString()) {
  const historyPath = path.join(dist, 'data/blog-editorial.json');
  const history = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, 'utf8')).entries : {};
  const articles = new Map();
  for (const file of htmlFiles(path.join(dist, 'blog'))) {
    const { document } = parseHTML(fs.readFileSync(file, 'utf8'));
    if (!document.querySelector('article') || /noindex/i.test(document.querySelector('meta[name="robots"]')?.content || '')) continue;
    const raw = document.querySelector('link[rel="canonical"]')?.href;
    if (!raw) continue;
    const url = new URL(raw, origin);
    if (url.origin !== origin || !url.pathname.startsWith('/blog/') || url.search || url.hash) continue;
    const record = history?.[url.href] || history?.[decodeURI(url.href)];
    const published = validDate(record?.publishedAt) ? record.publishedAt : null;
    const reportDate = url.pathname.match(/\/(\d{4}-\d{2}-\d{2})\/$/)?.[1];
    if (published && Date.parse(published) > Date.parse(now)) continue;
    if (reportDate && reportDate > new Date(Date.parse(now) + 9 * 3600000).toISOString().slice(0, 10)) continue;
    const title = document.querySelector('h1')?.textContent.trim();
    if (!title) continue;
    const sources = [...new Set([...document.querySelectorAll('article a[href]')].map(a => new URL(a.getAttribute('href'), origin).href).filter(u => /^https:\/\/dart\.fss\.or\.kr\/dsaf001\/main\.do\?rcpNo=\d{14}$/.test(u)))];
    articles.set(url.href, { url: url.href, title, description: document.querySelector('meta[name="description"]')?.content || '', published, reportDate, sources,
      order: published || (reportDate ? reportDate + 'T00:00:00+09:00' : '') });
  }
  return [...articles.values()].sort((a, b) => b.order.localeCompare(a.order) || a.url.localeCompare(b.url));
}

export function buildSearchFeed(dist, options = {}) {
  const articles = collectFeedArticles(dist, options.now).slice(0, 50);
  const items = articles.map(a => `<item><title>${escape(a.title)}</title><link>${escape(a.url)}</link><guid isPermaLink="true">${escape(a.url)}</guid><description>${escape(a.description)}</description>${a.published ? `<pubDate>${new Date(a.published).toUTCString()}</pubDate>` : ''}</item>`).join('\n');
  fs.writeFileSync(path.join(dist, 'rss.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>리앤노트 공시 블로그</title><link>${origin}/blog/</link><description>DART 공시 데이터와 공시 읽는 법</description><language>ko-kr</language><atom:link href="${origin}/rss.xml" rel="self" type="application/rss+xml"/>${items}</channel></rss>`);
  for (const file of htmlFiles(dist)) {
    const html = fs.readFileSync(file, 'utf8');
    if (!html.includes('type="application/rss+xml"')) fs.writeFileSync(file, html.replace('</head>', '<link rel="alternate" type="application/rss+xml" title="리앤노트 공시 블로그" href="/rss.xml"></head>'));
  }
  return articles.length;
}
