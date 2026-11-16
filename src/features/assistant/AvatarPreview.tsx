import {useEffect,useRef,useState} from 'react';
import type {AssistantImportDraft,AssistantModel} from '../../lib/assistant';
export function avatarUrl(model:AssistantModel|AssistantImportDraft){
 const draft='token'in model;return 'maji-avatar://renderer/avatar.html?'+new URLSearchParams({[draft?'draft':'model']:draft?model.token:model.id,kind:model.kind??'vrm',file:model.file}).toString();
}
export function AvatarPreview({model,onReady}:{model:AssistantModel|AssistantImportDraft;onReady(ready:boolean):void}){
 const frame=useRef<HTMLIFrameElement>(null),[status,setStatus]=useState('正在加载预览…'),[revision,setRevision]=useState(0);
 const identity='token'in model?model.token:model.id;
 useEffect(()=>{
  setStatus('正在加载预览…');onReady(false);
  const timer=setTimeout(()=>{setStatus('预览超时，请重试或返回检查格式；未成功预览不能导入。');onReady(false);},20000);
  function receive(event:MessageEvent){
   if(event.source!==frame.current?.contentWindow||event.origin!=='maji-avatar://renderer')return;
   if(event.data?.type==='ready'){try{frame.current?.contentWindow?.postMessage({type:'follow',enabled:false},'maji-avatar://renderer');}catch{}}
   if(event.data?.type==='loaded'){clearTimeout(timer);setStatus('预览加载成功');onReady(true);}
   if(event.data?.type==='error'){clearTimeout(timer);setStatus(typeof event.data.message==='string'?event.data.message:'预览失败');onReady(false);}
  }
  window.addEventListener('message',receive);return()=>{clearTimeout(timer);window.removeEventListener('message',receive);};
 },[identity,revision,onReady]);
 return <div className="assistant-import-preview"><iframe key={identity+revision} ref={frame} title="导入角色预览" src={avatarUrl(model)} sandbox="allow-scripts allow-same-origin"/><p role="status">{status}</p><button type="button" onClick={()=>setRevision(v=>v+1)}>重新预览</button></div>;
}
