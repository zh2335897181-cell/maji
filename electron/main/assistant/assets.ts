import {mkdir,readFile,writeFile,rename,realpath,rm} from 'node:fs/promises';
import {join,relative,isAbsolute,sep} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {snapshotModel,type ModelSnapshot,inspectGLB} from './modelFiles';
import {validateModelLicense,requireCompatibleLicense} from '../../../src/lib/assistantLicense';
import type {AssistantModelKind,AssistantImportDraft} from '../../../src/lib/assistant';
import {ASSISTANT_DEFAULTS,BUILTIN_ASSISTANT,type AssistantSettings,type AssistantPatch,type AssistantModel} from '../../../src/lib/assistant';

function inside(root:string,file:string){const rel=relative(root,file);return !isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep);}
export class AssistantStore {
 private drafts=new Map<string,{snapshot:ModelSnapshot;created:number;previewed:boolean;timer:ReturnType<typeof setTimeout>}>();
 constructor(readonly root:string){}
 async get():Promise<AssistantSettings>{
  try{
   const saved=JSON.parse(await readFile(join(this.root,'settings.json'),'utf8'));
   const models=[BUILTIN_ASSISTANT,...(Array.isArray(saved.models)?saved.models:[]).filter((m:AssistantModel)=>m&&/^[-a-f0-9]{36}$/.test(m.id)&&['avatar.vrm','avatar.glb','avatar.png','avatar.gif','avatar.webp','model.json'].includes(m.file)&&!m.builtin)];
   return {...ASSISTANT_DEFAULTS,...saved,models,modelId:models.some(m=>m.id===saved.modelId&&(m.builtin||m.license?.version===1))?saved.modelId:BUILTIN_ASSISTANT.id};
  }
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {...ASSISTANT_DEFAULTS,models:[BUILTIN_ASSISTANT]};throw error;}
 }
 async save(value:AssistantSettings){await mkdir(this.root,{recursive:true});await writeFile(join(this.root,'settings.json.tmp'),JSON.stringify(value),'utf8');await rename(join(this.root,'settings.json.tmp'),join(this.root,'settings.json'));return value;}
 async update(value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('助手设置无效');
  const patch=value as AssistantPatch,current=await this.get();
  for(const key of Object.keys(patch))if(!['enabled','name','personality','size','alwaysOnTop','followMouse','modelId'].includes(key))throw Error('助手设置字段无效');
  for(const key of ['enabled','alwaysOnTop','followMouse'] as const)if(patch[key]!==undefined&&typeof patch[key]!=='boolean')throw Error('助手开关无效');
  if(patch.name!==undefined&&(typeof patch.name!=='string'||!patch.name.trim()||patch.name.length>30))throw Error('昵称需为 1～30 个字符');
  if(patch.personality!==undefined&&(typeof patch.personality!=='string'||patch.personality.length>2000))throw Error('性格描述最多 2000 个字符');
  if(patch.size!==undefined&&(!Number.isInteger(patch.size)||patch.size<200||patch.size>500))throw Error('角色大小需为 200～500');
  if(patch.modelId!==undefined&&patch.modelId!==null&&!current.models.some(m=>m.id===patch.modelId))throw Error('请选择已导入的角色');
  if(patch.modelId&&current.models.some(m=>m.id===patch.modelId&&!m.builtin&&!m.license))throw Error('请先补充此角色的授权记录');
  return this.save({...current,...patch});
 }
 async prepareImport(file:string,kind:AssistantModelKind):Promise<AssistantImportDraft>{
  this.clearDrafts();const snapshot=await snapshotModel(file,kind),token=randomUUID();
  const timer=setTimeout(()=>this.cancelImport(token),20*60_000);timer.unref();
  this.drafts.set(token,{snapshot,created:Date.now(),previewed:false,timer});
  return {token,kind:snapshot.kind,name:snapshot.name,file:snapshot.file,bytes:snapshot.bytes,fileCount:snapshot.files.size,sha256:snapshot.sha256,warnings:snapshot.warnings,claims:snapshot.claims,conflicts:snapshot.conflicts};
 }
 private draft(token:unknown){
  if(typeof token!=='string')throw Error('导入令牌无效');const draft=this.drafts.get(token);
  if(!draft||Date.now()-draft.created>20*60_000){this.cancelImport(token);throw Error('导入预览已过期，请重新选择文件');}return draft.snapshot;
 }
 cancelImport(token:unknown){if(typeof token!=='string')throw Error('导入令牌无效');const value=this.drafts.get(token);if(value)clearTimeout(value.timer);this.drafts.delete(token);}
 clearDrafts(){for(const token of this.drafts.keys())this.cancelImport(token);}
 previewResult(frameUrl:string,success:boolean){
  try{const url=new URL(frameUrl),token=url.searchParams.get('draft');if(url.protocol!=='maji-avatar:'||url.hostname!=='renderer'||url.pathname!=='/avatar.html'||!token)return;
   const snapshot=this.draft(token);if(url.searchParams.get('kind')!==snapshot.kind||url.searchParams.get('file')!==snapshot.file)return;
   this.drafts.get(token)!.previewed=success;
  }catch{/* A late acknowledgement for a cancelled or expired frame has no effect. */}
 }
 async draftAsset(token:string,file:string){const snapshot=this.draft(token),bytes=snapshot.files.get(file);if(!bytes)throw Error('预览资源不存在');return bytes;}
 async confirmImport(token:unknown,name:unknown,record:unknown,activate:unknown):Promise<AssistantModel>{
  const snapshot=this.draft(token);
  if(!this.drafts.get(token as string)?.previewed)throw Error('请先完成成功的隔离预览，不能跳过或提交预览失败的文件');
  if(typeof name!=='string'||!name.trim()||name.length>60||typeof activate!=='boolean')throw Error('角色名称或启用选项无效');
  const license=validateModelLicense(record);requireCompatibleLicense(license,snapshot.claims);
  if(snapshot.conflicts.length)throw Error(snapshot.conflicts.join('；'));
  const current=await this.get();if(current.models.filter(m=>!m.builtin).length>=20)throw Error('最多导入20个自定义角色，请先移除不需要的副本');
  const id=randomUUID(),target=join(this.root,'models',id),importedAt=new Date().toISOString();
  const entry:AssistantModel={id,name:name.trim(),file:snapshot.file,files:[...snapshot.files.keys()],kind:snapshot.kind,license,sha256:snapshot.sha256,claims:snapshot.claims,importedAt};
  try{
   await mkdir(target,{recursive:true});for(const [path,bytes]of snapshot.files)await writeFile(join(target,path),bytes);
   await writeFile(join(target,'license-record.json'),JSON.stringify({license,sha256:entry.sha256,claims:entry.claims,kind:entry.kind,importedAt},null,2),'utf8');
   await this.save({...current,models:[...current.models,entry],...(activate?{modelId:id,enabled:true}:{})});
   this.cancelImport(token);return entry;
  }catch(error){if(inside(join(this.root,'models'),target)&&relative(join(this.root,'models'),target))await rm(target,{recursive:true,force:true});throw error;}
 }
 async setModelLicense(value:unknown,record:unknown){
  const current=await this.get(),entry=current.models.find(m=>m.id===value&&!m.builtin);if(!entry)throw Error('自定义角色不存在');
  const license=validateModelLicense(record);
  const files=new Map<string,Buffer>();for(const file of entry.files??[entry.file])files.set(file,await readFile(await this.assetPath(`models/${entry.id}/${file}`)));
  const claims=entry.kind==='vrm'||entry.file==='avatar.vrm'?inspectGLB(files.get(entry.file)!,'vrm').claims:entry.kind==='glb'?inspectGLB(files.get(entry.file)!,'glb').claims:entry.claims;
  requireCompatibleLicense(license,claims);
  const hash=createHash('sha256');for(const [name,bytes]of [...files].sort(([a],[b])=>a.localeCompare(b))){hash.update(name);hash.update('\0');hash.update(bytes);}
  const next={...entry,license,claims,sha256:hash.digest('hex'),licenseRecordedAt:new Date().toISOString()};await writeFile(join(this.root,'models',entry.id,'license-record.json'),JSON.stringify({license,sha256:next.sha256,claims,importedAt:entry.importedAt,licenseRecordedAt:next.licenseRecordedAt},null,2),'utf8');
  return this.save({...current,models:current.models.map(m=>m.id===entry.id?next:m)});
 }
 async removeModel(value:unknown){
  const settings=await this.get(),entry=settings.models.find(m=>m.id===value);
  if(!entry||!/^[-a-f0-9]{36}$/.test(entry.id))throw Error('角色不存在');
  const models=settings.models.filter(m=>m.id!==entry.id);
  const next=await this.save({...settings,models,modelId:settings.modelId===entry.id?(models[0]?.id??null):settings.modelId});
  const root=join(this.root,'models'),target=join(root,entry.id);
  if(!inside(root,target)||!relative(root,target))throw Error('角色目录无效');
  try{await rm(target,{recursive:true,force:true});}
  catch{throw Error('角色已从列表移除，但副本文件清理失败；原始模型未受影响');}
  return next;
 }
 async assetPath(path:string){

  if(!/^models\/[a-f0-9-]{36}\//.test(path))throw Error('资源路径无效');
  const parts=path.split('/');if(parts.length!==3||!/^(?:avatar\.(?:vrm|glb|png|gif|webp)|model\.json|asset-\d+\.(?:png|gif|webp))$/.test(parts[2]))throw Error('资源路径无效');
  const settings=await this.get();const entry=settings.models.find(m=>m.id===parts[1]);if(!entry||!(entry.files??[entry.file]).includes(parts[2]))throw Error('角色资源不存在');
  const root=await realpath(join(this.root,'models',parts[1])),actual=await realpath(join(this.root,path));
  if(!inside(root,actual))throw Error('资源超出角色目录');return actual;
 }
}
