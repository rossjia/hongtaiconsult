'use strict';
// Sole online data boundary. Only authenticated ciphertext is persisted.
window.createMerckResources = function(base,meta,key,announce){
 const metrics={download:0,decrypt:0,decompress:0,cacheHits:0,downloadedBytes:0},pending=new Map(),urls=new Map();let catalog=null,active=true;
 const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 const hex=b=>[...new Uint8Array(b)].map(v=>v.toString(16).padStart(2,'0')).join('');
 function check(id,d){if(!active)throw Error('access-ended');if(!d||!/^vault-[a-f0-9]{64}\.bin$/.test(d.file)||!Number.isSafeInteger(d.bytes)||d.bytes<16||d.bytes>24000000||bytes(d.iv).length!==12||atob(d.aad)!==`MERCK_EVIDENCE_V2:${meta.version}:${id}`||!['gzip','none'].includes(d.compression))throw Error('resource-version');}
 async function encrypted(id,d,progress){
  check(id,d);const url=new URL(d.file,base).href;let cache;try{cache=await caches.open('merck-cipher-v2-'+meta.version)}catch{}
  let raw;try{const stored=await cache?.match(url);if(stored)raw=await stored.arrayBuffer()}catch{}
  const valid=async raw=>raw.byteLength===d.bytes&&hex(await crypto.subtle.digest('SHA-256',raw))===d.sha256;
  if(raw&&!await valid(raw)){await cache?.delete(url);raw=null;}
  if(!raw){const start=performance.now();const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error('resource-http-'+response.status);const reader=response.body.getReader(),chunks=[];let received=0;while(true){const {value,done}=await reader.read();if(done)break;received+=value.length;if(received>d.bytes){await reader.cancel();throw Error('resource-size')}chunks.push(value);progress?.(received,d.bytes);}const joined=new Uint8Array(received);let offset=0;for(const b of chunks){joined.set(b,offset);offset+=b.length}raw=joined.buffer;metrics.download+=performance.now()-start;metrics.downloadedBytes+=received;if(!await valid(raw))throw Error('resource-integrity');try{await cache?.put(url,new Response(raw))}catch{}}
  else metrics.cacheHits++;
  return raw;
 }
 async function read(id,d,progress){const raw=await encrypted(id,d,progress);if(!active)throw Error('access-ended');announce?.('正在验证访问权限…');const readyKey=await key;announce?.('解密并验证内容…');let t=performance.now();const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(d.iv),additionalData:bytes(d.aad),tagLength:128},readyKey,raw);metrics.decrypt+=performance.now()-t;announce?.('解压启动内容…');t=performance.now();const out=d.compression==='gzip'?await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():plain;metrics.decompress+=performance.now()-t;return out;}
 const api={metrics,version:meta.version,boot:()=>read('boot',meta.boot,(n,total)=>announce?.(`下载启动内容 ${Math.floor(n/total*100)}% · ${(n/1024).toFixed(0)}/${(total/1024).toFixed(0)} KB`)),configure(m){if(catalog||m.version!==meta.version)throw Error('manifest-version');Object.entries(m.resources).forEach(([id,d])=>check(id,d));catalog=m.resources;announce=null;},async get(id){if(!catalog)throw Error('manifest-not-ready');if(!pending.has(id)){const p=read(id,catalog[id]);pending.set(id,p);p.catch(()=>pending.delete(id));}return pending.get(id)},async json(id){try{return JSON.parse(new TextDecoder().decode(await api.get(id)))}finally{pending.delete(id)}},async url(id){if(!urls.has(id)){const p=api.get(id).then(b=>{pending.delete(id);return URL.createObjectURL(new Blob([b],{type:catalog[id].type}))});urls.set(id,p);p.catch(()=>urls.delete(id));}return urls.get(id)},dispose(){active=false;for(const p of urls.values())p.then(u=>URL.revokeObjectURL(u));urls.clear();pending.clear();key=null;}};
 return api;
};
