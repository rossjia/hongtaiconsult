'use strict';
(() => {
  // No password, key, plaintext data, or reusable password verifier is shipped here.
  const form = document.getElementById('unlockForm');
  const field = document.getElementById('password');
  const button = document.getElementById('submit');
  const status = document.getElementById('status');
  const show = document.getElementById('showPassword');
  const remember = document.getElementById('remember');
  const base = new URL('./', document.currentScript?.src || document.baseURI);
  const bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const message = (s, error = false) => { status.textContent = s; status.classList.toggle('error', error); };
  let busy = false, payloadPromise, metaPromise;
  // Structured cloning stores a non-exportable CryptoKey. Plaintext passwords are
  // never persisted. This is a local shared-password convenience, not an account.
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
  async function getMeta() {
    if (!metaPromise) metaPromise = (async () => {
      const response = await fetch(new URL('release.json', base), { cache: 'no-store' });
      if (!response.ok) throw new Error('network');
      const meta = await response.json();
      if (meta.format !== 'MERCK_EVIDENCE_VAULT_V1' || meta.iterations !== 600000 || !/^vault-[0-9a-f]{16}\.bin$/.test(meta.payload) || meta.bytes > 24 * 1024 * 1024) throw new Error('integrity');
      return meta;
    })().catch(e => { metaPromise = null; throw e; });
    return metaPromise;
  }
  show.addEventListener('click', () => {
    const visible = field.type === 'password';
    field.type = visible ? 'text' : 'password';
    show.textContent = visible ? '隐藏' : '显示';
    show.setAttribute('aria-pressed', String(visible));
    show.setAttribute('aria-label', visible ? '隐藏密码' : '显示密码');
  });
  async function fetchPayload() {
    const meta = await getMeta();
    const data = await fetch(new URL(meta.payload, base));
    if (!data.ok || !data.body) throw new Error('network');
    const reader = data.body.getReader(), chunks = [];
    let received = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > meta.bytes) { await reader.cancel(); throw new Error('integrity'); }
      chunks.push(value);
      message(`正在载入证据空间… ${Math.min(99, Math.floor(received / meta.bytes * 100))}%`);
    }
    if (received !== meta.bytes) throw new Error('integrity');
    const encrypted = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { encrypted.set(chunk, offset); offset += chunk.length; }
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encrypted)), b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== meta.sha256) throw new Error('integrity');
    return { meta, encrypted };
  }
  async function unlock(saved = null) {
    if (busy) return;
    if (!window.isSecureContext || !crypto.subtle || !window.DecompressionStream) {
      message('请使用新版 Edge、Chrome 或 Safari，并通过 HTTPS 地址访问。', true); return;
    }
    busy = true;
    button.disabled = true;
    field.disabled = true;
    show.disabled = true;
    remember.disabled = true;
    message('正在准备证据空间…');
    let phase = 'load';
    const password = field.value;
    field.value = '';
    try {
      if (!payloadPromise) payloadPromise = fetchPayload().catch(e => { payloadPromise = null; throw e; });
      const { meta, encrypted } = await payloadPromise;
      phase = 'decrypt';
      message('正在验证密码…');
      let key;
      if (saved) {
        if (saved.salt !== meta.salt || saved.iterations !== meta.iterations) throw new Error('new-password');
        key = saved.key;
      } else {
        const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
        key = await crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt:bytes(meta.salt), iterations:meta.iterations}, material, {name:'AES-GCM',length:256}, false, ['decrypt']);
      }
      const compressed = await crypto.subtle.decrypt({name:'AES-GCM', iv:bytes(meta.iv), additionalData:bytes(meta.aad), tagLength:128}, key, encrypted);
      let rememberFailed = false;
      if (!saved) {
        try {
          if (remember.checked) await keyStore('put', {key, salt:meta.salt, iterations:meta.iterations});
          else await keyStore('delete');
        } catch { rememberFailed = remember.checked; }
      }
      phase = 'render';
      message('正在打开平台…');
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
      const html = await new Response(stream).text();
      // Execute the unchanged, authenticated portable application at the same origin.
      // No password or raw key is saved to localStorage, sessionStorage or cookies.
      document.open(); document.write(html); document.close();
      // Keep the portable app from requesting an unrelated root favicon.
      const icon = document.createElement('link');
      icon.rel = 'icon'; icon.href = 'data:,'; document.head.append(icon);
      const actions = document.querySelector('.top-actions');
      if (actions) {
        const lock = document.createElement('button');
        lock.type = 'button'; lock.className = 'plain-btn'; lock.id = 'lockPlatform';
        lock.innerHTML = '<span class="access-full-label">退出登录</span><span class="access-short-label" aria-hidden="true">退出</span>';
        lock.setAttribute('aria-label', '退出登录'); lock.title = '退出并清除此浏览器的登录记忆';
        const style = document.createElement('style');
        style.textContent = '#lockPlatform .access-short-label{display:none}@media(max-width:650px){#lockPlatform .access-full-label{display:none}#lockPlatform .access-short-label{display:inline}#lockPlatform{padding:7px 5px}}@media(max-width:360px){.topbar{padding-inline:10px}.topbar .identity{gap:6px}.topbar .identity img{width:64px}}';
        document.head.append(style);
        lock.addEventListener('click', async () => {
          lock.disabled = true;
          try { await keyStore('delete'); location.replace(base.href); }
          catch { lock.disabled = false; alert('清除登录记忆失败，请在浏览器设置中清除此站点的数据。'); }
        });
        actions.append(lock);
      }
      if (rememberFailed) {
        const note = document.createElement('div');
        note.setAttribute('role', 'status');
        note.textContent = '浏览器未允许保存登录状态；下次访问仍需输入密码。';
        note.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:10000;background:#fff;color:#513880;padding:14px 20px;border:1px solid #ddd;border-radius:8px;max-width:90vw;font-size:13px;box-shadow:0 5px 24px #0002';
        document.body.append(note); setTimeout(() => note.remove(), 9000);
      }
      // A history restoration must not reopen an unlocked page after locking/leaving.
      addEventListener('pageshow', event => { if (event.persisted) location.replace(base.href); });
    } catch (error) {
      if (saved && phase === 'decrypt') { try { await keyStore('delete'); } catch {} }
      message(phase === 'decrypt' ? (saved ? '登录记忆已失效，请重新输入密码。' : '密码不正确，请重新输入。') : phase === 'render' ? '打开平台失败，请刷新后重试。' : '载入失败，请检查网络并重试。', true);
      field.disabled = false; button.disabled = false; show.disabled = false; busy = false;
      remember.disabled = false;
      field.type = 'password'; show.textContent = '显示'; show.setAttribute('aria-pressed', 'false'); show.setAttribute('aria-label', '显示密码');
      field.focus();
    }
  }
  form.addEventListener('submit', event => { event.preventDefault(); unlock(); });
  (async () => {
    if (!window.isSecureContext || !crypto.subtle || !window.DecompressionStream) return;
    try {
      const saved = await keyStore('get');
      if (saved?.key) await unlock(saved);
    } catch { /* Login remains usable when browser storage is disabled. */ }
  })();
})();
