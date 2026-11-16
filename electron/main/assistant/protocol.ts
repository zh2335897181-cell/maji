import {protocol,net} from 'electron';
import {readFile,realpath} from 'node:fs/promises';
import {join,relative,isAbsolute,sep,extname} from 'node:path';
import type {AssistantStore} from './assets';

export function registerAvatarScheme(){protocol.registerSchemesAsPrivileged([{scheme:'maji-avatar',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);}
const CSP="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob: data:; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.ts':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.css':'text/css','.vrm':'model/gltf-binary','.glb':'model/gltf-binary'};
export function installAvatarProtocol(store:AssistantStore){
 protocol.handle('maji-avatar',async request=>{
  try{
   const url=new URL(request.url);if(url.hostname!=='renderer'||request.method!=='GET')return new Response(null,{status:403});
   const path=decodeURIComponent(url.pathname).slice(1);
   if(!path||path.split('/').some(part=>part==='..'||part==='.')||/[\\\x00]/.test(path))return new Response(null,{status:403});
   const headers={'Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Type':types[extname(path)]??'application/octet-stream'};
   if(path.startsWith('drafts/')){const parts=path.split('/');if(parts.length!==3)return new Response(null,{status:403});return new Response(new Uint8Array(await store.draftAsset(parts[1],parts[2])),{headers});}
   if(path.startsWith('models/'))return new Response(new Uint8Array(await readFile(await store.assetPath(path))),{headers});
   if(process.env.MAJI_DEV_SERVER){
    if(!(path==='avatar.html'||path==='assistant/cosmic-bot.vrm'||path.startsWith('src/features/assistant/')||path.startsWith('node_modules/')||path.startsWith('@')))return new Response(null,{status:404});
    const source=await net.fetch(new URL('/'+path+url.search,process.env.MAJI_DEV_SERVER).toString());
    return new Response(await source.arrayBuffer(),{status:source.status,headers:{...headers,'Content-Type':source.headers.get('content-type')??headers['Content-Type']}});
   }
   if(!(path==='avatar.html'||path==='assistant/cosmic-bot.vrm'||/^assets\/[\w.-]+\.(js|css)$/.test(path)))return new Response(null,{status:404});
   const root=await realpath(join(__dirname,'../../../../dist')),file=await realpath(join(root,path)),rel=relative(root,file);
   if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep))return new Response(null,{status:403});
   return new Response(new Uint8Array(await readFile(file)),{headers});
  }catch{return new Response('资源不可用',{status:404});}
 });
}
