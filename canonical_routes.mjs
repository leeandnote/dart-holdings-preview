import fs from 'node:fs';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { htmlFiles } from './search_graph.mjs';

const origin = 'https://leeandnote.com';
const clean = new Set(['about','editorial-policy','contact','privacy','terms','disclaimer','stock-terms']);

export function normalizeRoute(value, base = origin + '/') {
  if (!value || /^(#|mailto:|tel:|javascript:)/i.test(value)) return value;
  let url;
  try { url = new URL(value, clean.has(value.split(/[?#]/)[0].replace(/\.html$/, '')) ? origin + '/' : base); } catch { return value; }
  if (![origin, 'https://www.leeandnote.com'].includes(url.origin)) return value;
  const page = url.pathname.replace(/^\//, '').replace(/\/$/, '').replace(/\.html$/, '');
  if (clean.has(page)) url.pathname = '/' + page;
  else if (/^\/(blog|disclosurepedia|stock-terms)(\/|$)/.test(url.pathname) && !/\.[^/]+$/.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/$/, '') + '/';
  } else return value;
  return /^https?:\/\//i.test(value) ? origin + url.pathname + url.search + url.hash : url.pathname + url.search + url.hash;
}

export function normalizeSearchRoutes(dist) {
  const redirects = new Map();
  const redirectFile = path.join(dist, '_redirects');
  const existing = fs.existsSync(redirectFile) ? fs.readFileSync(redirectFile, 'utf8') : '';
  const sources = new Set(existing.split(/\r?\n/).map(line => line.trim().split(/\s+/)[0]));
  const add = (from, to) => { if (from !== to && !sources.has(from)) redirects.set(from, to); };
  for (const page of clean) {
    add('/' + page + '.html', '/' + page);
    add('/' + page + '/', '/' + page);
  }
  for (const file of htmlFiles(dist)) {
    const { document } = parseHTML(fs.readFileSync(file, 'utf8'));
    const canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) continue;
    const base = normalizeRoute(canonical.href);
    for (const node of document.querySelectorAll('a[href],link[rel="canonical"]')) {
      node.setAttribute('href', normalizeRoute(node.getAttribute('href'), base));
    }
    for (const node of document.querySelectorAll('meta[property="og:url"]')) node.setAttribute('content', normalizeRoute(node.getAttribute('content'), base));
    const walk = value => typeof value === 'string' ? normalizeRoute(value, base) : Array.isArray(value) ? value.map(walk) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(item)])) : value;
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      // Only absolute URL values are rewritten; schema prose stays untouched.
      const urlsOnly = value => typeof value === 'string' ? (/^https?:\/\//.test(value) ? walk(value) : value) : Array.isArray(value) ? value.map(urlsOnly) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, urlsOnly(item)])) : value;
      script.textContent = JSON.stringify(urlsOnly(JSON.parse(script.textContent)));
    }
    const pathname = new URL(base).pathname;
    if (pathname !== '/' && pathname.endsWith('/')) add(pathname.slice(0, -1), pathname);
    fs.writeFileSync(file, document.toString());
  }
  fs.writeFileSync(redirectFile, existing.trimEnd() + '\n' + [...redirects].map(([from,to]) => `${from} ${to} 301`).join('\n') + '\n');
}
