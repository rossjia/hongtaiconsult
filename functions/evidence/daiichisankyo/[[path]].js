import { buildAuthHandler } from '../../../np-private/auth-core.mjs';
import { readPrivateAsset, validateRelease } from '../../../np-private/private-assets.mjs';
let current, handlerPromise;
export async function onRequest(context) {
  try {
    const env=context.env;
    const signature=[env.NP_ACCESS_USERNAME,env.NP_ACCESS_PASSWORD,env.NP_SESSION_SECRET,env.NP_PUBLIC_ORIGIN,env.NP_SESSION_TTL_SECONDS];
    if (!current || signature.some((value,index)=>value!==current[index])) { current=signature;handlerPromise=buildAuthHandler(env); }
    const handle=await handlerPromise;
    await validateRelease();
    return await handle(context.request,(request,relative)=>readPrivateAsset(request,relative,env.NP_PRIVATE_BUCKET),{clientKey:context.request.headers.get('CF-Connecting-IP')||'unknown'});
  } catch { return new Response('Service unavailable.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}}); }
}
