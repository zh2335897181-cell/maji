import {useEffect,useState} from 'react';
import type {AssistantSettings as Settings,AssistantPatch,AssistantModel} from '../../lib/assistant';
import {Button} from '../../components/ui/Button';
import {ImportWizard,ModelLicenseDetails,MODEL_KIND_LABELS} from './ImportWizard';
import styles from './assistantSettings.module.css';
export function AssistantSettings(){
 const api=window.maji?.assistant;
 const [settings,setSettings]=useState<Settings|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [name,setName]=useState(''),[personality,setPersonality]=useState('');
 const [importing,setImporting]=useState(false),[licensing,setLicensing]=useState<AssistantModel|undefined>();
 useEffect(()=>{
  if(!api)return;let live=true;
  void api.get().then(value=>{if(live){setSettings(value);setName(value.name);setPersonality(value.personality);}}).catch(e=>{if(live)setError(String(e));});
  const unsub=api.onChange?.(value=>{if(live)setSettings(value);});return()=>{live=false;unsub?.();};
 },[api]);
 async function run(action:()=>Promise<Settings|void>){setBusy(true);setError('');try{const value=await action();if(value)setSettings(value);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 function update(patch:AssistantPatch){void run(()=>api!.update(patch));}
 if(!api)return <p>桌面助手仅在桌面应用中可用。</p>;
 if(!settings)return <p role="status">{error||'正在读取助手设置…'}</p>;
 return <div className={styles.panel}>
  <div className={styles.intro}><span className={styles.badge}>VRM · 内置角色</span><h3>桌面上的学习伙伴</h3><p>拖动角色上方的把手移动位置，点击角色或对话按钮开始聊天。</p></div>
  <label className={styles.toggle}><span>启用桌面 AI 助手<small>随码迹启动，退出码迹时关闭</small></span><input type="checkbox" checked={settings.enabled} disabled={busy} onChange={e=>update({enabled:e.target.checked})}/></label>
  <div className={styles.actions}><Button variant="secondary" disabled={busy||!settings.enabled} onClick={()=>void run(()=>api.show())}>显示助手</Button><Button variant="ghost" disabled={busy} onClick={()=>void run(()=>api.hide())}>暂时隐藏</Button></div>
  <fieldset disabled={busy||importing||!!licensing}><legend>角色形象</legend>
   <p className={styles.hint}>已内置免费 CC0 角色「小码 · 太空机器人」，启用即可使用，不需要建模软件或额外运行库。</p>
   <Button variant="secondary" onClick={()=>setImporting(true)}>导入 2D / 3D 角色</Button>
   <label>当前角色<select aria-label="当前角色" value={settings.modelId??'cosmic-bot'} onChange={e=>update({modelId:e.target.value})}>{settings.models.map(m=><option value={m.id} key={m.id} disabled={!m.builtin&&!m.license}>{m.name} · {MODEL_KIND_LABELS[m.kind??'vrm']}{!m.builtin&&!m.license?' · 待补授权':''}</option>)}</select></label>
   <Button variant="ghost" disabled={!settings.modelId||settings.models.some(m=>m.id===settings.modelId&&m.builtin)} onClick={()=>void run(()=>api.removeModel(settings.modelId!))}>移除此角色副本</Button>
   <p className={styles.hint}>2D支持PNG/GIF/WebP及分层包，3D支持VRM和内嵌GLB。导入向导会显示能力、格式限制与授权要求；不会自动转换模型或授予商用权利。</p>
   {settings.models.map(model=><details key={model.id}><summary>{model.name} · 来源与授权</summary><ModelLicenseDetails model={model}/>{!model.builtin&&<div className={styles.actions}><Button variant="secondary" onClick={()=>setLicensing(model)}>{model.license?'更新授权记录':'补充授权后使用'}</Button><Button variant="ghost" onClick={()=>void run(()=>api.removeModel(model.id))}>移除 {model.name} 的副本</Button></div>}</details>)}
  </fieldset>
  {(importing||licensing)&&<ImportWizard api={api} existing={licensing} onClose={()=>{setImporting(false);setLicensing(undefined);}} onDone={next=>{setSettings(next);setImporting(false);setLicensing(undefined);}}/>}
  <fieldset disabled={busy}><legend>陪伴方式</legend>
   <label>昵称<input value={name} maxLength={30} onChange={e=>setName(e.target.value)}/></label>
   <label>性格与回复风格<textarea rows={3} maxLength={2000} value={personality} onChange={e=>setPersonality(e.target.value)}/></label>
   <Button variant="secondary" onClick={()=>update({name,personality})}>保存昵称与性格</Button>
   <label>角色大小 · {settings.size}<input aria-label="角色大小" type="range" min={200} max={500} step={25} value={settings.size} onChange={e=>update({size:Number(e.target.value)})}/></label>
   <label className={styles.check}><input type="checkbox" checked={settings.alwaysOnTop} onChange={e=>update({alwaysOnTop:e.target.checked})}/>始终显示在其他窗口上方</label>
   <label className={styles.check}><input type="checkbox" checked={settings.followMouse} onChange={e=>update({followMouse:e.target.checked})}/>目光跟随鼠标</label>
  </fieldset>
  <p className={styles.hint}>聊天复用「AI 服务」配置，仅发送你输入的对话。助手不会自动读取笔记、项目或桌面。对话只保留在本次运行中。</p>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
 </div>;
}
