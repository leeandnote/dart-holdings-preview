import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const archive='content/notes.enc.json',keyFile='.private/notes-archive-key';
export function encryptNotes(files,key){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(files),'utf8'),cipher.final()]);
  return {version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
}
export function decryptNotes(encrypted,key){
  if(encrypted.version!==1)throw new Error('Unsupported private notes archive');
  const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(encrypted.iv,'base64'));decipher.setAuthTag(Buffer.from(encrypted.tag,'base64'));
  const files=JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext,'base64')),decipher.final()]).toString('utf8'));
  if(!files||Array.isArray(files)||typeof files!=='object'||Object.entries(files).some(([name,text])=>!(/^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(name))||typeof text!=='string'))throw new Error('Invalid manuscript archive paths');
  return files;
}
function archiveKey(create=false){
  let value=process.env.NOTES_ARCHIVE_KEY;
  if(!value&&fs.existsSync(keyFile))value=fs.readFileSync(keyFile,'utf8').trim();
  if(!value&&create){value=randomBytes(32).toString('base64');fs.mkdirSync('.private',{recursive:true});fs.writeFileSync(keyFile,value,{mode:0o600});}
  if(!value)throw new Error('NOTES_ARCHIVE_KEY is required; refusing to omit private manuscripts');
  const key=Buffer.from(value,'base64');if(key.length!==32)throw new Error('Invalid NOTES_ARCHIVE_KEY length');return key;
}
export function restorePrivateNotes(){
  if(!fs.existsSync(archive))return 0;
  // Local edits take precedence. CI always starts from an empty, gitignored notes folder.
  if(!process.env.CI&&fs.existsSync('content/notes')&&fs.readdirSync('content/notes').some(f=>f.endsWith('.md')))return 0;
  const files=decryptNotes(JSON.parse(fs.readFileSync(archive,'utf8')),archiveKey());
  fs.mkdirSync('content/notes',{recursive:true});
  for(const [name,text] of Object.entries(files))fs.writeFileSync(path.join('content/notes',name),text);
  return Object.keys(files).length;
}
export function packPrivateNotes(){
  const files=Object.fromEntries(fs.readdirSync('content/notes').filter(n=>n.endsWith('.md')).sort().map(n=>[n,fs.readFileSync(path.join('content/notes',n),'utf8')]));
  if(!Object.keys(files).length)throw new Error('Refusing empty manuscript archive');
  const encrypted=encryptNotes(files,archiveKey(true));fs.writeFileSync(archive,JSON.stringify(encrypted));return Object.keys(files).length;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log('PRIVATE_MANUSCRIPTS='+ (process.argv.includes('--pack')?packPrivateNotes():restorePrivateNotes()));
