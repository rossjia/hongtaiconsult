// Read-only bridge for the existing private china-dt-fulltext bucket.
// Copy with catalog.mjs under functions/evidence/merck/api/fulltext/.
import catalog from './catalog.mjs';
const json=(message,status)=>new Response(JSON.stringify({message}),{status,headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'private, no-store'}});
async function equalSecret(a,b){const enc=new TextEncoder();const [x,y]=await Promise.all([a,b].map(s=>crypto.subtle.digest('SHA-256',enc.encode(s))));const u=new Uint8Array(x),v=new Uint8Array(y);let n=0;for(let i=0;i<u.length;i++)n|=u[i]^v[i];return n===0;}
export async function serveFulltext(request,env,rid,entries=catalog.records){
 if(!['GET','HEAD'].includes(request.method))return json('只支持读取原文',405);
 const secret=env.MERCK_FULLTEXT_TOKEN;
 if(typeof secret!=='string'||secret.length<32)return json('原文服务尚未配置',503);
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 if(!token||!await equalSecret(token,secret))return json('请重新进入循证全景',401);
 if(!/^rayyan-\d+$/.test(rid)||!Object.hasOwn(entries,rid))return json('文献未登记',404);
 const item=entries[rid];
 if(!/^[a-f0-9]{64}$/.test(item.sha256||''))return json('原文映射待核对，文件并非缺失',409);
 const bucket=env.MERCK_FULLTEXT_BUCKET||env.PC497_PDF_BUCKET;
 if(!bucket?.head||!bucket?.get)return json('原文存储尚未连接',503);
 const head=await bucket.head(item.key);
 if(!head)return json('此原文暂时无法读取',404);
 if(head.customMetadata?.sha256!==item.sha256&&(!item.verifiedEtag||item.verifiedEtag!==head.etag))return json('原文版本待核对',409);
 const headers=new Headers({'Content-Type':'application/pdf','Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','ETag':head.httpEtag,'X-Source-SHA256':item.sha256});
 if(head.uploaded)headers.set('Last-Modified',new Date(head.uploaded).toUTCString());
 let start=0,end=head.size-1,status=200,range=request.headers.get('range');
 const ifRange=request.headers.get('if-range');
 if(ifRange&&ifRange!==head.httpEtag){const time=Date.parse(ifRange);if(!Number.isFinite(time)||!head.uploaded||time<Math.floor(new Date(head.uploaded).getTime()/1000)*1000)range=null;}
 const invalid=()=>{headers.set('Content-Range',`bytes */${head.size}`);return new Response(null,{status:416,headers});};
 if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||!m[1]&&!m[2])return invalid();
  if(!m[1]){const suffix=Number(m[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return invalid();start=Math.max(0,head.size-suffix);}
  else {start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end;}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=head.size||start<0||end<start)return invalid();
  status=206;headers.set('Content-Range',`bytes ${start}-${end}/${head.size}`);
 }
 headers.set('Content-Length',String(end-start+1));
 if(request.method==='HEAD')return new Response(null,{status,headers});
 const object=await bucket.get(item.key,{onlyIf:{etagMatches:head.etag},...(status===206?{range:{offset:start,length:end-start+1}}:{})});
 if(!object||!('body' in object))return json('原文版本发生变化，请重试',409);
 return new Response(object.body,{status,headers});
}
export async function onRequest(context){try{return await serveFulltext(context.request,context.env,context.params.id);}catch{return json('原文服务暂时不可用，请重试',503);}}
