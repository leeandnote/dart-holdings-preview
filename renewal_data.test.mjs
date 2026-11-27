import test from 'node:test';import assert from 'node:assert/strict';import {publishedMajorRows} from './renewal_data.mjs';
test('published fallback rejects stale, empty or mismatched receipts',()=>{
 const row={'공시유형':'투자판단관련주요경영사항','접수일':'20261126','접수번호':'20261126000001',DART_URL:'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261126000001'};
 assert.equal(publishedMajorRows({rows:[row]},'20261127').length,1);
 assert.throws(()=>publishedMajorRows({rows:[]},'20261127'));
 assert.throws(()=>publishedMajorRows({rows:[row]},'20261210'));
 assert.throws(()=>publishedMajorRows({rows:[row]},'20261125'));
 assert.throws(()=>publishedMajorRows({rows:[{...row,'접수번호':'20261126000002'}]},'20261127'));
});
