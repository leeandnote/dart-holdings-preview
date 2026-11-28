import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Private, short-lived cache shared by subprocesses in one publishing workspace.
export async function cachedConvexQuery(endpoint,query,args={},options={}){
  const dir=options.dir||path.resolve('artifacts/convex-read-cache');
  const now=options.now??Date.now(),ttl=15*60*1000;
  const base=endpoint.replace(/\/$/,'');
  const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const file=path.join(dir,hash([base,query,args])+'.json'),breaker=path.join(dir,hash(base)+'.blocked.json');
  const read=file=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}};
  const blocked=read(breaker);
  if(blocked?.until>now)throw Error('Convex quota circuit open; collection blocked, no stale data substituted');
  const saved=read(file);
  if(saved&&now>=saved.at&&now-saved.at<ttl)return saved.value;
  const response=await (options.fetch||fetch)(base+'/api/query',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:query,args,format:'json'}),signal:AbortSignal.timeout(30000)});
  const payload=await response.json();
  if(!response.ok||payload.status!=='success'){
    if(/exceeded.*(?:free plan|usage|spending).*limits|deployments have been disabled/i.test(payload.errorMessage||'')){
      const date=new Date(now),reset=Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1);
      fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(breaker,JSON.stringify({until:Math.min(now+24*3600000,reset)}));
    }
    throw Error(payload.errorMessage||`Convex query failed: ${query}`);
  }
  fs.mkdirSync(dir,{recursive:true});
  const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify({at:now,value:payload.value}));fs.renameSync(tmp,file);
  return payload.value;
}
