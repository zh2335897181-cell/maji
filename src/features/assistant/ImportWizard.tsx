import {useCallback,useEffect,useRef,useState} from 'react';
import type {AssistantApi,AssistantImportDraft,AssistantModel,AssistantModelKind,AssistantSettings} from '../../lib/assistant';
import {LICENSE_URLS,validateModelLicense} from '../../lib/assistantLicense';
import {Button} from '../../components/ui/Button';
import {AvatarPreview} from './AvatarPreview';
import './importWizard.css';
export const MODEL_KIND_LABELS:Record<AssistantModelKind,string>={image2d:'2D 图片 / 动图',puppet2d:'2D 分层角色包',vrm:'3D VRM 角色',glb:'3D 通用 GLB'};
const boundaries:Record<AssistantModelKind,string>={image2d:'PNG/GIF/WebP，建议透明背景。保留图片或原有动图，可整体呼吸、摇摆；不会自动变为骨骼角色或生成表情。',puppet2d:'选择 .maji2d.json 及同目录下的图片；支持声明式图层、部位移动和表情图片替换，不兼容 Live2D/Spine/Inochi2D。',vrm:'VRM 0.x / 1.0，贴图需内嵌。眼动、表情依赖角色绑定；程序提供点头、挥手，不保证任意模型都表现一致。',glb:'二进制 glTF 2.0（.glb），所有贴图与资源内嵌。可播放文件自带的动画；不会自动获得 VRM 的眼动、表情或人形动作。'};
type LicenseForm={type:string;author:string;source:string;licenseUrl:string;evidence:string;attribution:string;changes:string;free:boolean;commercial:boolean;derivatives:boolean;redistribution:boolean;confirmed:boolean;shareAlike:boolean};
function initialLicense(model?:AssistantModel):LicenseForm{return {type:'',author:'',source:'',licenseUrl:'',evidence:'',attribution:'',changes:'未修改',free:false,commercial:false,derivatives:false,redistribution:false,confirmed:false,shareAlike:false,...model?.license};}
export function ModelLicenseDetails({model}:{model:AssistantModel}){
 if(model.builtin)return <p>内置 Cosmic Bot 使用 CC0；来源、许可和摘要随安装包保存在 assistant/MODEL-LICENSE.md。</p>;
 if(!model.license)return <p>此角色尚无完整授权记录，暂不能启用。请补充授权依据。</p>;
 const license=model.license;
 return <div className="assistant-license-record"><p><b>{license.type}</b> · 用户提供的声明，非平台认证</p><dl><dt>作者</dt><dd>{license.author}</dd><dt>来源</dt><dd>{license.source}</dd><dt>许可网址</dt><dd>{license.licenseUrl}</dd><dt>署名</dt><dd>{license.attribution||'未要求额外署名'}</dd><dt>改动说明</dt><dd>{license.changes}</dd><dt>导入时间</dt><dd>{model.importedAt??'旧副本补充记录'}</dd><dt>授权记录时间</dt><dd>{model.licenseRecordedAt??model.importedAt??'旧记录未注明'}</dd><dt>快照 SHA-256</dt><dd>{model.sha256??'旧副本未记录摘要'}</dd></dl><details><summary>许可原文 / 授权依据</summary><pre>{license.evidence}</pre></details><p>此记录不授予新权利；对外分享仍需遵守原许可、署名及相同方式共享等义务。</p></div>;
}
export function ImportWizard({api,existing,onDone,onClose}:{api:AssistantApi;existing?:AssistantModel;onDone(settings:AssistantSettings):void;onClose():void}){
 const [step,setStep]=useState(existing?3:1),[kind,setKind]=useState<AssistantModelKind>('vrm'),[draft,setDraft]=useState<AssistantImportDraft|null>(null),[name,setName]=useState(existing?.name??''),[license,setLicense]=useState<LicenseForm>(()=>initialLicense(existing)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[ready,setReady]=useState(false),[activate,setActivate]=useState(false);
 const token=useRef<string|null>(null),alive=useRef(true),heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(token.current)void api.cancelImport(token.current).catch(()=>{});};},[api]);
 useEffect(()=>{heading.current?.focus({preventScroll:true});heading.current?.scrollIntoView({block:'start'});},[step]);
 const onReady=useCallback((value:boolean)=>setReady(value),[]);
 const field=<K extends keyof LicenseForm>(key:K,value:LicenseForm[K])=>setLicense(old=>({...old,[key]:value}));
 async function choose(){setBusy(true);setError('');try{
  const next=await api.prepareImport(kind);if(!alive.current){if(next)void api.cancelImport(next.token);return;}if(!next)return;
  token.current=next.token;setDraft(next);setName(next.name);setLicense(initialLicense());setReady(false);setStep(2);
 }catch(e){setError(e instanceof Error?e.message:String(e));setDraft(null);setStep(1);}finally{if(alive.current)setBusy(false);}}
 function reviewLicense(){try{validateModelLicense(license);setError('');setStep(4);}catch(e){setError(e instanceof Error?e.message:String(e));}}
 async function confirm(){setBusy(true);setError('');try{
  const record=validateModelLicense(license);
  if(!existing&&(!draft||!ready||draft.conflicts.length))throw Error('请先成功预览并解决文件许可冲突');
  const settings=existing?await api.setModelLicense(existing.id,record):await api.confirmImport(draft!.token,name,record,activate);
  if(alive.current){token.current=null;onDone(settings);}
 }catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e));}finally{if(alive.current)setBusy(false);}}
 const preview=draft??existing;
 return <section className="assistant-import" aria-label="角色导入向导">
  <header><h3 ref={heading} tabIndex={-1}>{existing?'补充角色授权':'导入自定义角色'}</h3><Button variant="ghost" disabled={busy} onClick={onClose}>取消导入</Button></header>
  <ol className="assistant-import-steps" aria-label="导入步骤">{['选择文件','检查与预览','授权记录','确认保存'].map((label,i)=><li key={label} aria-current={step===i+1?'step':undefined}><b>{i+1}</b>{label}</li>)}</ol>
  {existing&&<p>仅补充此本地副本的授权，不重新导入或自动启用；保存时会重新计算资源摘要。</p>}
  <fieldset disabled={busy}>
   {step===1&&<><label>角色类型<select aria-label="角色类型" value={kind} onChange={e=>setKind(e.target.value as AssistantModelKind)}>{Object.entries(MODEL_KIND_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><p>{boundaries[kind]}</p><p>仅导入免费取得且明确允许商用、改编和再分发的素材。不会自动转换 FBX/OBJ/Live2D/Spine，也不接受 ZIP、HTML、SVG 或脚本包。</p><p>上限：128MB、20个自定义角色；像素图片最大8192边长且不超过3200万像素。分层包画布≤4096、最多32层/32表情/128张图片。</p>
    {kind==='puppet2d'&&<details><summary>分层包格式示例与制作边界</summary><pre>{JSON.stringify({version:1,width:600,height:800,layers:[{id:'body',file:'body.png',role:'body',x:100,y:300,width:400,height:500},{id:'head',file:'head.png',role:'head',x:150,y:50,width:300,height:300}],expressions:[{name:'开心',files:{head:'head-happy.png'}}]},null,2)}</pre><p>将文件保存为 pet.maji2d.json，图片放在其目录内。role 可为 body/head/eyes/mouth/decoration；图层按数组顺序叠放，表情按图层ID替换图片。它是码迹的开放声明格式，不是通用骨骼或模型制作工具。</p></details>}
    <Button onClick={()=>void choose()}>选择文件并检查</Button></>}
   {step===2&&draft&&<><h4>{MODEL_KIND_LABELS[draft.kind]}</h4><p>{(draft.bytes/1024/1024).toFixed(2)} MB · {draft.fileCount} 个资源 · 快照保留20分钟</p>{!draft.conflicts.length&&<AvatarPreview model={draft} onReady={onReady}/>} {draft.warnings.map(w=><p key={w}>{w}</p>)}{draft.claims&&<details><summary>文件内的作者 / 许可声明（仍需核对）</summary><pre>{JSON.stringify(draft.claims,null,2)}</pre></details>}{draft.conflicts.map(c=><p className="assistant-import-error" role="alert" key={c}>{c}；不能用勾选覆盖。</p>)}<div className="assistant-import-actions"><Button variant="ghost" onClick={()=>setStep(1)}>返回重选</Button><Button disabled={!ready||!!draft.conflicts.length} onClick={()=>setStep(3)}>下一步：填写授权</Button></div></>}
   {step===3&&<><h4>确认素材的使用权限</h4><p>“免费下载”不等于可商用或可改编。仅依据你提供的记录和文件内声明检查一致性，不联网认证作者身份，也不生成授权。</p>
    <label>许可类型<select aria-label="许可类型" value={license.type} onChange={e=>field('type',e.target.value)}><option value="">请选择已核对的许可</option><option value="CC0-1.0">CC0 1.0 · 公有领域贡献</option><option value="CC-BY-4.0">CC BY 4.0 · 需署名</option><option value="CC-BY-SA-4.0">CC BY-SA 4.0 · 需署名、相同方式共享</option><option value="custom">自定义许可 · 必须明确覆盖四项权限</option></select></label>
    <label>作者 / 权利人<input aria-label="作者 / 权利人" maxLength={200} value={license.author} onChange={e=>field('author',e.target.value)}/></label>
    <label>原始来源网址或本人原创说明<input maxLength={2000} value={license.source} onChange={e=>field('source',e.target.value)}/></label>
    {license.type==='custom'?<label>自定义许可网址<input value={license.licenseUrl} maxLength={2000} onChange={e=>field('licenseUrl',e.target.value)}/></label>:license.type&&<p>许可原文网址：{LICENSE_URLS[license.type]}</p>}
    <label>许可原文 / 授权依据<textarea rows={4} minLength={20} maxLength={20000} placeholder="粘贴作者明确的许可原文或授权说明；不要只填写“网上下载”或“免费”。" value={license.evidence} onChange={e=>field('evidence',e.target.value)}/></label>
    <label>署名内容与需保留的声明<textarea rows={2} maxLength={2000} placeholder="CC BY / BY-SA 必填：作品名、作者、来源与许可链接等。" value={license.attribution} onChange={e=>field('attribution',e.target.value)}/></label>
    <label>改动说明<input maxLength={2000} value={license.changes} onChange={e=>field('changes',e.target.value)}/></label>
    {([['free','素材为免费获取，且不是破解、盗取或冒用授权的文件'],['commercial','原许可明确允许所需商业使用'],['derivatives','原许可允许改编，并允许按其条件分享改编作品'],['redistribution','原许可允许再分发；对外发布时我会遵守署名等条件'],['confirmed','已核对作者、来源与完整许可，并确认相关贴图、角色IP等权利足够']] as const).map(([key,label])=><label className="assistant-import-check" key={key}><input type="checkbox" checked={license[key]} onChange={e=>field(key,e.target.checked)}/>{label}</label>)}
    {(license.type==='CC-BY-SA-4.0'||license.type==='custom'&&/by.?sa/i.test(String(preview?.claims?.licenseName??'')))&&<label className="assistant-import-check"><input type="checkbox" checked={license.shareAlike} onChange={e=>field('shareAlike',e.target.checked)}/>理解：对外分享改编素材时需按相同或兼容许可共享，并保留署名。此要求不自动把码迹整个应用变为同一许可。</label>}
    <p>NC（非商业）、ND（禁止分享改编）、禁止再分发、仅个人使用及授权不明不符合本次导入条件。本版范围较窄：VRM需允许所有人、企业商业使用，以及分享修改后的模型；仅个人营利也不符合本导入策略。省略字段按格式规定处理，不视为同意。自定义许可不能通过勾选覆盖原文限制；肖像、商标及第三方素材权利仍需单独核对。</p>
    <div className="assistant-import-actions">{!existing&&<Button variant="ghost" onClick={()=>setStep(2)}>返回预览</Button>}<Button onClick={reviewLicense}>下一步：确认保存</Button></div></>}
   {step===4&&preview&&<><h4>核对后保存到本机</h4><label>角色名称<input value={name} maxLength={60} disabled={!!existing} onChange={e=>setName(e.target.value)}/></label><p>{MODEL_KIND_LABELS[preview.kind??'vrm']} · {license.type} · 作者：{license.author}</p><p>来源：{license.source}</p><p>改动：{license.changes}</p><p className="assistant-import-digest">快照 SHA-256：{preview.sha256??'旧副本将在补充授权时计算'}</p>{!existing&&<label className="assistant-import-check"><input type="checkbox" checked={activate} onChange={e=>setActivate(e.target.checked)}/>导入后立即启用此角色（否则仅加入角色库）</label>}<p>只复制模型和授权记录到本机，不修改源文件、不自动分享或随应用再发布，也不会把模型传给 AI。这里能显示角色，不代表能在此编辑网格、骨骼或贴图；二次开发需使用对应编辑工具并遵守原许可。</p><div className="assistant-import-actions"><Button variant="ghost" onClick={()=>setStep(3)}>返回授权</Button><Button disabled={!name.trim()||(!existing&&!ready)} onClick={()=>void confirm()}>{busy?'正在保存…':existing?'保存授权记录':'确认导入'}</Button></div></>}
  </fieldset>
  {error&&<p role="alert" className="assistant-import-error">{error}</p>}
 </section>;
}
