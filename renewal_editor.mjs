import fs from 'node:fs';
import path from 'node:path';
import {articleCatalog} from './related_articles.mjs';
import {escapeHtml as e} from './renewal_search.mjs';
export function buildEditorArchive(dir){
 const pages=articleCatalog(dir).filter(p=>p.group==='issues');
 const target=path.join(dir,'editor/fox');fs.mkdirSync(target,{recursive:true});
 fs.writeFileSync(path.join(target,'index.html'),`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>리앤노트 편집팀 | 공시 해설 아카이브</title><meta name="description" content="리앤노트 캐릭터와 편집팀을 소개하고 공식 자료 기반 공시 해설을 모았습니다."><link rel="canonical" href="https://leeandnote.com/editor/fox/"><link rel="stylesheet" href="/styles.css"></head><body><main class="rn-editor-archive"><img src="/assets/brand/leeandnote-full.png" width="160" height="220" alt="생각하는 리앤노트 캐릭터"><h1>리앤노트 편집팀</h1><p>리앤노트는 DART 원문과 공식 자료를 바탕으로 공시를 정리합니다. 여우 캐릭터의 이름은 리앤노트이며, 실제 인물이나 별도의 자격을 가진 검수자를 뜻하지 않습니다.</p><p><a href="/editorial-policy">편집·자동화 기준</a> · <a href="/contact">오류 제보</a></p><h2>공시 해설</h2><ul>${pages.map(p=>`<li><a href="${e(p.url)}">${e(p.title)}</a></li>`).join('')}</ul></main></body></html>`);
 return pages.length;
}
