import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {AssistantApi,AssistantSettings,AssistantMessage} from '../../lib/assistant';
import './pet.css';
import {avatarUrl} from './AvatarPreview';
declare global {interface Window {assistant?:Pick<AssistantApi,'get'|'show'|'hide'|'chat'|'cancel'|'clear'|'history'|'expand'|'openSettings'|'onChange'>&{onPointer?(listener:(point:{x:number;y:number})=>void):()=>void}}}
function DesktopPet(){
 const api=window.assistant;
 const [settings,setSettings]=useState<AssistantSettings|null>(null),[open,setOpen]=useState(false),[messages,setMessages]=useState<AssistantMessage[]>([]),[text,setText]=useState(''),[pending,setPending]=useState(''),[error,setError]=useState(''),[status,setStatus]=useState('正在加载角色…');
 const [expressions,setExpressions]=useState<string[]>([]),[motions,setMotions]=useState<string[]>([]);
 const [avatarRevision,setAvatarRevision]=useState(0);
 const frame=useRef<HTMLIFrameElement>(null),log=useRef<HTMLDivElement>(null),generation=useRef(0);
 const post=(data:unknown)=>{try{frame.current?.contentWindow?.postMessage(data,'maji-avatar://renderer');}catch{/* The isolated desktop protocol is unavailable in browser previews. */}};
 useEffect(()=>{
  if(!api)return;let live=true;
  void Promise.all([api.get(),api.history()]).then(([s,h])=>{if(live){setSettings(s);setMessages(h);}}).catch(e=>{if(live)setError(String(e));});
  const unsub=api.onChange?.(s=>setSettings(s));
  const pointer=api.onPointer?.(point=>{const rect=frame.current?.getBoundingClientRect();if(rect)post({type:'pointer',x:point.x-rect.left,y:point.y-rect.top});});
  return()=>{live=false;unsub?.();pointer?.();};
 },[api]);
 useEffect(()=>{log.current?.scrollTo({top:log.current.scrollHeight});},[messages,pending,error]);
 async function expand(next:boolean){try{await api?.expand(next);setOpen(next);}catch(e){setError(String(e));}}
 useEffect(()=>{
  function receive(event:MessageEvent){
   if(event.source!==frame.current?.contentWindow||event.origin!=='maji-avatar://renderer')return;
   const value=event.data;
   if(value?.type==='ready')post({type:'load',settings});
   if(value?.type==='loaded'){setStatus('');setExpressions(Array.isArray(value.expressions)?value.expressions:[]);setMotions(Array.isArray(value.motions)?value.motions:[]);}
   if(value?.type==='error')setStatus(typeof value.message==='string'?value.message:'角色加载失败');
   if(value?.type==='tap')void expand(true);
  }
  window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);
 },[settings,api]);
 useEffect(()=>{setStatus(!settings?.modelId?'请先在设置中选择角色':'正在加载角色…');setExpressions([]);setMotions([]);},[settings?.modelId,avatarRevision]);
 useEffect(()=>{post({type:'follow',enabled:settings?.followMouse});},[settings?.followMouse]);
 async function send(){
  if(!api||pending||!text.trim())return;const input=text.trim(),request=++generation.current;
  setPending(input);setText('');setError('');
  try{const history=await api.chat(input);if(request===generation.current){setMessages(history);post({type:'react'});}}
  catch(e){if(request===generation.current){setError(e instanceof Error?e.message:String(e));setText(input);}}
  finally{if(request===generation.current)setPending('');}
 }
 async function cancel(clear=false){generation.current++;setPending('');setError('');try{if(clear){await api?.clear();setMessages([]);}else await api?.cancel();}catch(e){setError(String(e));}}
 if(!api)return <div className="pet-empty">桌面助手仅在码迹桌面应用内运行。</div>;
 if(!settings)return <div className="pet-empty">{error||'正在连接助手…'}</div>;
 const model=settings.models.find(m=>m.id===settings.modelId);
 return <main className={'pet-shell'+(open?' is-open':'')}>
  <section className="pet-character" style={{width:settings.size+8}}>
   <header className="pet-toolbar"><span className="pet-handle" title="拖动以移动助手">⠿ {settings.name}</span><button title="助手设置" aria-label="助手设置" onClick={()=>void api.openSettings().catch(e=>setError(String(e)))}>⚙</button><button aria-label="隐藏助手" title="隐藏助手，可从设置重新显示" onClick={()=>void api.hide().catch(e=>setError(String(e)))}>×</button></header>
   <div className="pet-avatar">
    {model&&<iframe key={model.id+avatarRevision} ref={frame} title="桌面角色" src={avatarUrl(model)} sandbox="allow-scripts allow-same-origin"/>}
    {status&&<div className="pet-state"><span>✦</span><p>{status}</p><button onClick={()=>void api.openSettings().catch(e=>setError(String(e)))}>打开助手设置</button>{model&&<button onClick={()=>setAvatarRevision(value=>value+1)}>重新加载角色</button>}</div>}
   </div>
   <footer className="pet-controls"><button className="pet-chat-toggle" onClick={()=>void expand(!open)}>{open?'收起对话':'和我聊聊'} <span>↗</span></button>{expressions.length>0&&<select aria-label="角色表情" defaultValue="" onChange={e=>post({type:'expression',name:e.target.value})}><option value="">表情</option>{expressions.map(name=><option key={name}>{name}</option>)}</select>}{motions.length>0&&<select aria-label="角色动作" defaultValue="" onChange={e=>post({type:'motion',name:e.target.value})}><option value="">动作</option>{motions.map(name=><option key={name}>{name}</option>)}</select>}</footer>
  </section>
  {open&&<section className="pet-chat" aria-label="助手对话"><header><div><small>码迹 AI 助手</small><h1>{settings.name}</h1></div><button disabled={!!pending} onClick={()=>void cancel(true)}>清空</button><button aria-label="收起对话" onClick={()=>void expand(false)}>×</button></header>
   <div className="pet-log" ref={log} role="log" aria-live="polite">{!messages.length&&!pending&&<div className="pet-welcome"><span>一起把问题想明白。</span><p>想讨论代码，还是复习今天的知识？</p><small>仅发送对话，不自动读取你的笔记或桌面。</small></div>}{messages.map((m,i)=><article className={'pet-message '+m.role} key={i}><small>{m.role==='user'?'你':settings.name}</small><p>{m.content}</p></article>)}{pending&&<><article className="pet-message user"><small>你</small><p>{pending}</p></article><p role="status" className="pet-thinking">正在想一想…</p></>}{error&&<p role="alert" className="pet-error">{error}</p>}</div>
   <form onSubmit={e=>{e.preventDefault();void send();}}><label className="sr-only" htmlFor="pet-input">发送给助手</label><textarea id="pet-input" value={text} maxLength={4000} rows={3} placeholder="输入问题，和我聊聊…" disabled={!!pending} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/><div><small>Enter 发送 · Shift+Enter 换行</small>{pending?<button type="button" onClick={()=>void cancel()}>取消回复</button>:<button type="submit" disabled={!text.trim()}>发送 ↑</button>}</div></form>
  </section>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<DesktopPet/>);
