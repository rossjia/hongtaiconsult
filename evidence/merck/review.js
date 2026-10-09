'use strict';
const form=document.querySelector('#unlock'),status=document.querySelector('#status'),list=document.querySelector('#files');
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
form.addEventListener('submit',async e=>{
 e.preventDefault();const input=document.querySelector('#password'),button=form.querySelector('button');button.disabled=true;status.textContent='正在解锁…';
 try{
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(input.value),'PBKDF2',false,['deriveKey']);input.value='';
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:decode(config.salt),iterations:config.iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']);
  const response=await fetch(config.file);if(!response.ok)throw Error('download');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(config.iv)},key,await response.arrayBuffer());
  const files=JSON.parse(new TextDecoder().decode(plain));list.replaceChildren();
  for(const file of files){const li=document.createElement('li'),a=document.createElement('a');a.textContent=file.name;a.download=file.name;a.href=URL.createObjectURL(new Blob([file.encoding==='base64'?decode(file.content):file.content],{type:file.type||(file.name.endsWith('.json')?'application/json;charset=utf-8':'text/markdown;charset=utf-8')}));li.append(a);list.append(li)}
  form.hidden=true;status.textContent='已解锁，可下载以下完整文件。';
 }catch{status.textContent='未能解锁，请检查口令及网络后重试。'}finally{button.disabled=false}
});
