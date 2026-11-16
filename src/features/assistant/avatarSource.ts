import type {AssistantModelKind} from '../../lib/assistant';
export function avatarSource(){
 const query=new URL(location.href).searchParams,kind=(query.get('kind')??'vrm') as AssistantModelKind,draft=query.get('draft'),id=query.get('model'),file=query.get('file')??'avatar.vrm';
 if(!['vrm','glb','image2d','puppet2d'].includes(kind)||!(/^(?:avatar\.(?:vrm|glb|png|gif|webp)|model\.json|cosmic-bot\.vrm)$/.test(file)))throw Error('角色类型或文件无效');
 if(draft){if(!/^[-a-f0-9]{36}$/.test(draft))throw Error('预览令牌无效');return {kind,url:`/drafts/${draft}/${file}`,base:`/drafts/${draft}/`};}
 if(id==='cosmic-bot')return {kind:'vrm' as const,url:'/assistant/cosmic-bot.vrm',base:'/assistant/'};
 if(!id||!/^[-a-f0-9]{36}$/.test(id))throw Error('角色参数无效');return {kind,url:`/models/${id}/${file}`,base:`/models/${id}/`};
}
