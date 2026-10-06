'use strict';
(() => {
 const form=document.getElementById('unlockForm'),field=document.getElementById('password'),button=document.getElementById('submit'),status=document.getElementById('status'),show=document.getElementById('showPassword'),remember=document.getElementById('remember');
 const base=new URL('./',document.currentScript.src),bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 let busy=false,retrySaved=null,sessionKey=null;
 const message=(s,error=false)=>{status.textContent=s;status.classList.toggle('error',error)};
  function keyStore(operation, value) {
    return new Promise((resolve, reject) => {
      const opening = indexedDB.open('merck-evidence-access-v1', 1);
      opening.onupgradeneeded = () => opening.result.createObjectStore('access');
      opening.onerror = () => reject(opening.error);
      opening.onblocked = () => reject(new Error('storage-blocked'));
      opening.onsuccess = () => {
        const db = opening.result;
        const tx = db.transaction('access', operation === 'get' ? 'readonly' : 'readwrite');
        const store = tx.objectStore('access');
        const request = operation === 'get' ? store.get(base.pathname) : operation === 'put' ? store.put(value, base.pathname) : store.delete(base.pathname);
        tx.oncomplete = () => { const result = request.result; db.close(); resolve(result); };
        tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('storage')); };
      };
    });
  }

 show.onclick=()=>{const visible=field.type==='password';field.type=visible?'text':'password';show.textContent=visible?'隐藏':'显示';show.setAttribute('aria-pressed',String(visible));show.setAttribute('aria-label',visible?'隐藏密码':'显示密码');};
 async function unlock(saved){
  if(busy)return;busy=true;button.disabled=field.disabled=show.disabled=remember.disabled=true;
  let password=field.value;field.value='';let phase='metadata';
  try{
   if(!isSecureContext||!crypto.subtle||!window.DecompressionStream)throw Error('browser-unsupported');
   message('检查内容版本…');const response=await fetch(new URL('release.json',base),{cache:'no-store'});if(!response.ok)throw Error('metadata-http');const meta=await response.json();
   if(meta.format!=='MERCK_EVIDENCE_VAULT_V2'||meta.iterations!==600000||meta.kdf!=='PBKDF2-SHA256'||meta.cipher!=='AES-GCM'||!/^[A-Za-z0-9-]+$/.test(meta.version)||bytes(meta.salt).length!==16)throw Error('metadata-version');
   if(saved&&(saved.salt!==meta.salt||saved.iterations!==meta.iterations))throw Error('saved-key-version');
   phase='unlock';const t=performance.now();
   const keyPromise=saved?Promise.resolve(saved.key):(async()=>{message('验证访问权限，同时下载启动内容…');const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);password='';return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:bytes(meta.salt),iterations:meta.iterations},material,{name:'AES-GCM',length:256},false,['decrypt']);})();
   keyPromise.catch(()=>{});const resource=window.createMerckResources(base,meta,keyPromise,message);const raw=await resource.boot();
   sessionKey={key:await keyPromise,salt:meta.salt,iterations:meta.iterations};resource.metrics.keyAndDownload=performance.now()-t;
   let rememberFailed=false,persisted=!!saved;try{if(!saved){if(remember.checked){await keyStore('put',sessionKey);persisted=true;}else await keyStore('delete');}}catch{rememberFailed=remember.checked;}
   message('初始化证据与导航…');phase='render';const html=new TextDecoder().decode(raw);window.MerckResources=resource;
   document.open();document.write(html);document.close();if(!window.MerckApp)throw Error('application-init');
   const icon=document.createElement('link');icon.rel='icon';icon.href='data:,';document.head.append(icon);
   const lock=document.createElement('button');lock.id='lockPlatform';lock.className='plain-btn';lock.innerHTML='<span class="access-full-label">退出登录</span><span class="access-short-label" aria-hidden="true">退出</span>';lock.setAttribute('aria-label','退出登录');
   const style=document.createElement('style');style.textContent='#lockPlatform .access-short-label{display:none}@media(max-width:900px){#lockPlatform .access-full-label{display:none}#lockPlatform .access-short-label{display:inline}}';document.head.append(style);
   lock.onclick=async()=>{lock.disabled=true;try{if(persisted)await keyStore('delete');else try{await keyStore('delete')}catch{}window.MerckNavigation?.lock();resource.dispose();sessionKey=null;location.replace(base.href);}catch{lock.disabled=false;alert('清除登录记忆失败，请在浏览器设置中清除此站点数据。');}};document.querySelector('.top-actions').append(lock);
   if(rememberFailed){const note=document.createElement('p');note.textContent='浏览器未允许保存登录状态，下次仍需输入密码。';note.setAttribute('role','status');note.style.cssText='position:fixed;bottom:15px;left:15px;right:15px;z-index:9000;padding:14px;background:white;border:1px solid #9574aa;color:#503291;font-size:14px';document.body.append(note);setTimeout(()=>note.remove(),9000);}
   addEventListener('pageshow',event=>{if(event.persisted)location.replace(base.href)});
  }catch(error){
   password='';const bad=error.name==='OperationError'||error.message==='saved-key-version';
   if(bad&&saved){try{await keyStore('delete')}catch{}retrySaved=null;sessionKey=null;}else retrySaved=saved||sessionKey;
   if(phase==='render'){document.body.innerHTML='<main style="padding:30px;font-family:sans-serif"><h1>平台初始化失败</h1><p>请重新载入；浏览器草稿仍保留。</p><button onclick="location.reload()">重新载入</button></main>';return;}
   message(bad?(saved?'登录记忆已失效，请重新输入密码。':'密码不正确，请重新输入。'):error.message==='browser-unsupported'?'当前浏览器缺少安全解密能力，请使用较新的浏览器。':'内容载入失败，请检查网络后重试；版本或完整性不匹配的内容不会打开。',true);
   busy=false;button.disabled=field.disabled=show.disabled=remember.disabled=false;button.textContent=retrySaved?'重试载入 →':'重新进入 →';field.required=!retrySaved;field.type='password';show.textContent='显示';show.setAttribute('aria-pressed','false');
   if(!retrySaved)field.focus();
  }
 }
 form.onsubmit=e=>{e.preventDefault();unlock(field.value?null:retrySaved)};
 (async()=>{try{const saved=await keyStore('get');if(saved?.key){retrySaved=saved;await unlock(saved)}}catch{}})();
})();
