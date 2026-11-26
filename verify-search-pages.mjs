import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]||'public_dist');
const slugs=['ownership-rate-vs-share-count','contract-value-vs-revenue'];
for(const slug of slugs){
  const html=fs.readFileSync(path.join(root,'blog/issues',slug,'index.html'),'utf8');
  assert.equal((html.match(/<h1\b/g)||[]).length,1);
  assert.match(html,new RegExp(`rel="canonical" href="https://leeandnote.com/blog/issues/${slug}/"`));
  assert.doesNotMatch(html,/<meta[^>]*name="robots"[^>]*noindex/i);
  assert.match(html,/class="guideContents"/);
  assert.doesNotMatch(html,/class="issueTableTitle"/);
  for(const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g))JSON.parse(match[1]);
  for(const [,link] of html.matchAll(/href="(\/blog\/issues\/[^"#]+)"/g)){
    assert.ok(fs.existsSync(path.join(root,link,'index.html')),`Missing internal target ${link}`);
  }
  assert.ok(fs.readFileSync(path.join(root,'sitemap-blog.xml'),'utf8').includes(`https://leeandnote.com/blog/issues/${slug}/`));
}
for(const file of ['index.html','blog/index.html']){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  assert.match(html,/class="rn-editor-grid"/);
  assert.match(html,/href="\/blog\/issues\/[^"#]+"/);
}
assert.ok(!fs.existsSync(path.join(root,'disclosurepedia')),'Retired category must not be deployed');
assert.doesNotMatch(fs.readFileSync(path.join(root,'sitemap.xml'),'utf8'),/disclosurepedia/);
console.log('Search pages: canonical, H1, indexability, JSON-LD, links, sitemap and discovery paths passed.');
