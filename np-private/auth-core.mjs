// Shared Web API gate. Test clock injection is code-only; Pages never reads it from configuration.
import { loginMarkup } from './login-template.mjs';
import { logo } from './brand.mjs';
import { assetPaths } from './asset-list.mjs';
export const PREFIX='/evidence/daiichisankyo/';
export const COOKIE='NP_DS_SESSION';
export const SESSION_TTL_SECONDS=2592000;
const assets=new Set(assetPaths),utf8=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=text=>Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4)),c=>c.charCodeAt(0));
const random=n=>b64(crypto.getRandomValues(new Uint8Array(n)));
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safePath(raw){if(typeof raw!=='string'||!raw.startsWith('/')||raw.startsWith('//')||/[\\\u0000-\u001f\u007f]/.test(raw))return null;const p=raw.split(/[?#]/,1)[0];if(/%(?:2f|5c|25)/i.test(p))return null;let d;try{d=decodeURIComponent(p);}catch{return null;}if(/[\\%\u0000-\u001f\u007f]/.test(d)||d.includes('//')||d.split('/').some(p=>p==='.'||p==='..'||p.startsWith('.')))return null;return d;}
export function safeNext(raw){
 if(typeof raw!=='string'||raw.length>2048||/[\u0000-\u0020\u007f\\]/.test(raw))return PREFIX;
 const p=safePath(raw);if(p!==PREFIX&&p!==PREFIX+'index.html')return PREFIX;
 let decoded;try{decoded=decodeURIComponent(raw);}catch{return PREFIX;}
 if(/[\u0000-\u001f\u007f\\%]/.test(decoded)||decoded.split(/[/?#]/).some(s=>s==='.'||s==='..'))return PREFIX;
 return raw;
}
export function validateEnv(env,{allowLocal=false}={}){
 const username=env.NP_ACCESS_USERNAME,password=env.NP_ACCESS_PASSWORD,secret=env.NP_SESSION_SECRET,local=allowLocal&&env.NP_LOCAL_TEST==='1';
 if(typeof username!=='string'||!/^[A-Za-z0-9_.-]{1,64}$/.test(username)||typeof password!=='string'||password.length<12||password.length>512||typeof secret!=='string'||secret.length<32||secret.length>1024)throw new Error('Required authentication configuration is missing or invalid.');
 const o=new URL(env.NP_PUBLIC_ORIGIN||'');
 if(o.username||o.password||o.pathname!=='/'||o.search||o.hash||(local?(o.protocol!=='http:'||!['localhost','127.0.0.1'].includes(o.hostname)):o.protocol!=='https:'))throw new Error('Public origin is invalid.');
 const ttl=Number(env.NP_SESSION_TTL_SECONDS||SESSION_TTL_SECONDS);
 if(!Number.isInteger(ttl)||ttl!==SESSION_TTL_SECONDS)throw new Error('Session lifetime must be thirty days.');
 return{username,password,secret,origin:o.origin,local,ttl};
}
export async function buildAuthHandler(env,{allowLocal=false,clock=()=>Date.now()}={}){
 const cfg=validateEnv(env,{allowLocal});
 const seed=await crypto.subtle.importKey('raw',utf8.encode(cfg.secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const keyBytes=await crypto.subtle.sign('HMAC',seed,utf8.encode(JSON.stringify([COOKIE,2,cfg.username,cfg.password])));
 const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
 const [usernameProof,passwordProof]=await Promise.all([cfg.username,cfg.password].map(value=>crypto.subtle.sign('HMAC',key,utf8.encode(value))));
 const failed=new Map(),now=()=>Math.floor(clock()/1000);
 const sign=async payload=>b64(new Uint8Array(await crypto.subtle.sign('HMAC',key,utf8.encode(payload))));
 async function token(){const iat=now(),payload=b64(utf8.encode(JSON.stringify({v:2,sub:cfg.username,n:random(24),iat,exp:iat+cfg.ttl})));return payload+'.'+await sign(payload);}
 async function authenticated(req){
  const found=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));
  if(found.length!==1)return false;
  const value=found[0].slice(COOKIE.length+1);if(value.length>1024||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value))return false;
  const[p,s]=value.split('.');
  try{if(!await crypto.subtle.verify('HMAC',key,unb64(s),utf8.encode(p)))return false;const d=JSON.parse(new TextDecoder().decode(unb64(p))),t=now();return d.v===2&&d.sub===cfg.username&&typeof d.n==='string'&&/^[A-Za-z0-9_-]{32}$/.test(d.n)&&Number.isSafeInteger(d.iat)&&Number.isSafeInteger(d.exp)&&d.iat<=t&&d.exp===d.iat+cfg.ttl&&d.exp>t;}catch{return false;}
 }
 const cookie=(v,remove=false)=>COOKIE+'='+v+'; Path='+PREFIX+'; HttpOnly; SameSite=Lax; Max-Age='+(remove?0:cfg.ttl)+(cfg.local?'':'; Secure');
 const baseHeaders=()=>({'Cache-Control':'no-store, private','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});
 const response=(status,body='',extra={})=>new Response(status===204?null:body,{status,headers:{...baseHeaders(),'Content-Type':'text/plain; charset=utf-8',...extra}});
 function login(status,next,message='',extra={},username=''){
  const nonce=random(18),brand=logo.replace(/<style\b/g,'<style nonce="'+nonce+'"');
  return response(status,loginMarkup({nonce,brand,next,message,username,escape,safeNext,PREFIX}),{'Content-Type':'text/html; charset=utf-8','Referrer-Policy':'same-origin','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,...extra});
 }
 function limited(ip){const r=failed.get(ip);if(!r)return false;if(r.until<clock()){failed.delete(ip);return false;}return r.count>=8;}
 function failure(ip){if(failed.size>5000)failed.clear();const r=failed.get(ip);if(r&&r.until>=clock())r.count++;else failed.set(ip,{count:1,until:clock()+600000});}
 async function body(req){
  if(Number(req.headers.get('content-length'))>4096)throw Object.assign(new Error('Body too large'),{status:413});
  const reader=req.body?.getReader();if(!reader)return new URLSearchParams();let text='',total=0;const decoder=new TextDecoder();
  for(;;){const{value,done}=await reader.read();if(done)break;total+=value.length;if(total>4096){await reader.cancel();throw Object.assign(new Error('Body too large'),{status:413});}text+=decoder.decode(value,{stream:true});}
  text+=decoder.decode();return new URLSearchParams(text);
 }
 return async function handle(req,fetchAsset,{rawPath,clientKey='local'}={}){
  try{
   const url=new URL(req.url),pathname=safePath(rawPath||url.pathname+url.search);
   if(!pathname)return response(400,'Invalid request path.');
   if(pathname===PREFIX.slice(0,-1))return ['GET','HEAD'].includes(req.method)?response(308,'',{Location:PREFIX+url.search}):response(405,'Method not allowed.');
   if(!pathname.startsWith(PREFIX))return response(404,'Not found.');
   const endpoint=pathname.slice(PREFIX.length);
   if(endpoint==='__login'||endpoint==='__logout'){
    if(req.method!=='POST')return response(405,'Method not allowed.');
    if(req.headers.get('origin')!==cfg.origin)return response(403,'Origin rejected.');
    if(endpoint==='__logout')return response(303,'',{'Set-Cookie':cookie('',true),Location:PREFIX});
    if((req.headers.get('content-type')||'').split(';',1)[0].trim().toLowerCase()!=='application/x-www-form-urlencoded')return response(415,'Unsupported form encoding.');
    const fields=await body(req),next=fields.getAll('next').length===1?safeNext(fields.get('next')):PREFIX,userFields=fields.getAll('username'),passwordFields=fields.getAll('password'),username=(userFields[0]||'').trim().slice(0,64);
    // Parse within the existing size limit even when rate-limited, so retries retain the original target.
    if(limited(clientKey))return login(429,next,'尝试次数较多，请稍后重试。',{'Retry-After':'600'},username);
    const [userOK,passwordOK]=await Promise.all([crypto.subtle.verify('HMAC',key,usernameProof,utf8.encode((userFields[0]||'').trim())),crypto.subtle.verify('HMAC',key,passwordProof,utf8.encode(passwordFields[0]||''))]);
    if(userFields.length!==1||passwordFields.length!==1||!userOK||!passwordOK){failure(clientKey);return login(401,next,'用户名或密码不正确，请重试。',{},username);}
    failed.delete(clientKey);return response(303,'',{'Set-Cookie':cookie(await token()),Location:next});
   }
   if(!['GET','HEAD'].includes(req.method))return response(405,'Method not allowed.');
   const authorized=await authenticated(req);
   if(endpoint==='__session')return response(authorized?204:401);
   if(!authorized)return endpoint===''||endpoint==='index.html'?login(401,url.pathname+url.search):response(401,'Authentication required.');
   const relative=endpoint||'index.html';if(!assets.has(relative))return response(404,'Not found.');
   const asset=await fetchAsset(req,relative),result=new Response(req.method==='HEAD'?null:asset.body,{status:asset.status,statusText:asset.statusText,headers:asset.headers});
   for(const[k,v]of Object.entries(baseHeaders()))result.headers.set(k,v);return result;
  }catch(error){return response(error.status===413?413:500,error.status===413?'Request too large.':'Request failed.');}
 };
}
