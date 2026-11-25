import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {applyRenewalLayout,seoSnapshot} from './renewal_layout.mjs';

for(const file of ['site/index.html','site/5percent.html','site/calendar.html','site/blog/index.html','site/blog/issues/rights-offering-disclosure-guide/index.html']) {
  test(`preserve SEO and content, replace chrome once: ${file}`,()=>{
    const input=fs.readFileSync(file,'utf8'), output=applyRenewalLayout(input);
    assert.deepEqual(seoSnapshot(output),seoSnapshot(input));
    assert.equal(applyRenewalLayout(output),output);
    const before=parseHTML(input).document, after=parseHTML(output).document;
    assert.deepEqual([...after.querySelectorAll('main h1,article h1')].map(n=>n.textContent),[...before.querySelectorAll('main h1,article h1')].map(n=>n.textContent));
    assert.equal(after.querySelectorAll('#rn-header').length,1);
    assert.equal(after.querySelectorAll('.rn-mobile-bar > *').length,5);
    assert.equal(after.querySelector('.rn-mobile-bar > :nth-child(3)').getAttribute('href'),'https://t.me/leeandnote');
    assert.equal(after.querySelectorAll('#rn-navigation a').length,6);
    assert.equal(after.querySelectorAll('header.topbar').length,0);
  });
}
