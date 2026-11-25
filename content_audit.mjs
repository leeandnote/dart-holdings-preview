import fs from 'node:fs';
import path from 'node:path';
import {auditHtml} from './renewal_article.mjs';
const root=process.argv[2]||'site';
const reports=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
 const file=path.join(dir,e.name);
 if(e.isDirectory())walk(file);
 else if(e.name.endsWith('.html')){const report=auditHtml(fs.readFileSync(file,'utf8'));if(report){reports.push({file,...report});console.log(JSON.stringify({file,...report}));}}
}}
walk(root);
fs.mkdirSync('artifacts',{recursive:true});
fs.writeFileSync('artifacts/content-audit.json',JSON.stringify(reports,null,2));
console.log(`Audited ${reports.length} articles. Report: artifacts/content-audit.json`);
