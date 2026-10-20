// This module has no public-static fallback. Object keys are fixed by the compiled release.
import { release } from './release.mjs';
const text = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const rows = new Map(release.files.map(row => [row.path, row]));
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.pdf':'application/pdf'};
let checked;
function rejected(status, message) { return new Response(message, {status,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}}); }
export async function validateRelease() {
  if (!checked) checked = (async () => {
    if (release.schema !== 1 || !/^[a-z0-9][a-z0-9.-]{5,90}$/.test(release.releaseId) || release.objectPrefix !== 'np/releases/'+release.releaseId+'/' || !/^[a-f0-9]{64}$/.test(release.manifestSha256) || !release.files.length || rows.size !== release.files.length) throw new Error('Invalid private release reference.');
    for (const file of release.files) {
      if (!/^[A-Za-z0-9_./-]+$/.test(file.path) || file.path.startsWith('/') || file.path.split('/').some(x => !x || x.startsWith('.')) || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || !/^[a-f0-9]{64}$/.test(file.sha256) || file.mime !== mime[file.path.slice(file.path.lastIndexOf('.'))]) throw new Error('Invalid private release manifest.');
    }
    const {schema,releaseId,objectPrefix,files} = release;
    const canonical = JSON.stringify({schema,releaseId,objectPrefix,files},null,2)+'\n';
    if (hex(await crypto.subtle.digest('SHA-256', text.encode(canonical))) !== release.manifestSha256) throw new Error('Private release manifest mismatch.');
    return true;
  })();
  return checked;
}
export async function readPrivateAsset(request, relative, bucket) {
  // Called only after buildAuthHandler's session, normalized path, and allow-list checks.
  try {
    await validateRelease();
    const file=rows.get(relative);
    if (!file) return rejected(404,'Not found.');
    if (!bucket || typeof bucket.get !== 'function') return rejected(503,'Private storage unavailable.');
    const object = await bucket.get(release.objectPrefix+file.path);
    if (!object) return rejected(404,'Private object not found.');
    if (object.size !== file.bytes || typeof object.arrayBuffer !== 'function') return rejected(503,'Private object integrity check failed.');
    const data = await object.arrayBuffer();
    if (data.byteLength !== file.bytes || hex(await crypto.subtle.digest('SHA-256',data)) !== file.sha256) return rejected(503,'Private object integrity check failed.');
    return new Response(request.method==='HEAD'?null:data,{headers:{'Content-Type':file.mime,'Content-Length':String(file.bytes),'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});
  } catch { return rejected(503,'Private storage unavailable.'); }
}
