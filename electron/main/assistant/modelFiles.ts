import {readFile,lstat,realpath} from 'node:fs/promises';
import {dirname,join,relative,isAbsolute,sep,extname,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {licenseConflicts} from '../../../src/lib/assistantLicense';
import type {AssistantModelKind,Puppet2D} from '../../../src/lib/assistant';
export const MAX_MODEL_BYTES=128*1024**2;
export interface ModelSnapshot {kind:AssistantModelKind;name:string;file:string;files:Map<string,Buffer>;bytes:number;sha256:string;warnings:string[];claims?:Record<string,unknown>;conflicts:string[]}
async function read(file:string,max=MAX_MODEL_BYTES){const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max)throw Error('文件无效、为链接或超过大小限制');const bytes=await readFile(file);if(bytes.length>max)throw Error('文件读取时超过大小限制');return bytes;}
function imageInfo(bytes:Buffer){
 let width=0,height=0,extension='';
 if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);extension='png';}
 else if(bytes.length>=10&&/^GIF8[79]a$/.test(bytes.toString('ascii',0,6))){width=bytes.readUInt16LE(6);height=bytes.readUInt16LE(8);extension='gif';}
 else if(bytes.length>=30&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){
  extension='webp';const type=bytes.toString('ascii',12,16);
  if(type==='VP8X'){width=bytes.readUIntLE(24,3)+1;height=bytes.readUIntLE(27,3)+1;}
  else if(type==='VP8L'&&bytes[20]===0x2f){width=(bytes[21]|(bytes[22]&63)<<8)+1;height=((bytes[22]>>6)|(bytes[23]<<2)|((bytes[24]&15)<<10))+1;}
  else if(type==='VP8 '&&bytes.subarray(23,26).equals(Buffer.from([157,1,42]))){width=bytes.readUInt16LE(26)&16383;height=bytes.readUInt16LE(28)&16383;}
 }
 if(!width||!height||width>8192||height>8192||width*height>32_000_000)throw Error('图片必须是有效 PNG/GIF/WebP，最大8192边长且不超过3200万像素');
 return {width,height,extension};
}
export function inspectGLB(bytes:Buffer,kind:'vrm'|'glb'){
 if(bytes.length<20||bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length||bytes.readUInt32LE(16)!==0x4e4f534a)throw Error('不是有效的 VRM/GLB 文件');
 const length=bytes.readUInt32LE(12);if(length>4*1024**2||20+length>bytes.length)throw Error('模型描述无效或过大');
 const json=JSON.parse(bytes.toString('utf8',20,20+length));
 if(kind==='vrm'&&!json.extensions?.VRM&&!json.extensions?.VRMC_vrm)throw Error('模型未包含 VRM 角色信息');
 for(const group of [json.buffers,json.images])if(group!==undefined){
  if(!Array.isArray(group))throw Error('资源列表无效');
  for(const item of group)if(item.uri!==undefined&&(typeof item.uri!=='string'||!/^data:(?:image\/(?:png|jpeg|webp)|application\/octet-stream);base64,/.test(item.uri)))throw Error('只接受贴图和资源内嵌的模型，禁止外部文件或网络资源');
 }
 if((json.nodes?.length??0)>5000||(json.images?.length??0)>64||(json.meshes?.length??0)>512||(json.accessors??[]).reduce((n:number,a:{count?:number})=>n+(a.count??0),0)>10_000_000)throw Error('模型过于复杂，请先优化');
 if((json.extensionsRequired??[]).some((x:string)=>['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu'].includes(x)))throw Error('暂不支持压缩网格或KTX2纹理，请导出普通内嵌GLB');
 let meta=json.extensions?.VRMC_vrm?.meta??json.extensions?.VRM?.meta;
 if(json.extensions?.VRMC_vrm){
  const defaults={avatarPermission:'onlyAuthor',commercialUsage:'personalNonProfit',creditNotation:'required',allowRedistribution:false,modification:'prohibited'};
  meta={...defaults,...meta};
  for(const [key,allowed]of Object.entries({avatarPermission:['onlyAuthor','onlySeparatelyLicensedPerson','everyone'],commercialUsage:['personalNonProfit','personalProfit','corporation'],creditNotation:['required','unnecessary'],modification:['prohibited','allowModification','allowModificationRedistribution']}))if(!allowed.includes(meta[key]))throw Error('VRM1授权字段无效：'+key);
  if(typeof meta.allowRedistribution!=='boolean')throw Error('VRM1再分发声明无效');
 }
 const claims:Record<string,unknown>={};
 for(const key of ['title','name','author','authors','licenseName','licenseUrl','otherLicenseUrl','allowedUserName','avatarPermission','commercialUssageName','commercialUsage','allowCommercialUse','modification','allowRedistribution','creditNotation'])if(meta?.[key]!==undefined)claims[key]=typeof meta[key]==='string'?meta[key].slice(0,2000):meta[key];
 return {claims:Object.keys(claims).length?claims:undefined,conflicts:licenseConflicts(meta)};
}
const bounded=(value:unknown,min:number,max:number)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
export async function snapshotModel(file:string,kind:AssistantModelKind):Promise<ModelSnapshot>{
 if(!['vrm','glb','image2d','puppet2d'].includes(kind))throw Error('模型类型无效');
 const files=new Map<string,Buffer>(),warnings:string[]=[];let modelFile='',claims:Record<string,unknown>|undefined,conflicts:string[]=[];
 const extension=extname(file).toLowerCase();
 const bytes=await read(file,kind==='puppet2d'?1024**2:MAX_MODEL_BYTES);
 if(kind==='vrm'||kind==='glb'){
  if(extension!=='.'+kind)throw Error('文件扩展名与所选3D格式不一致');
  modelFile='avatar.'+kind;files.set(modelFile,bytes);({claims,conflicts}=inspectGLB(bytes,kind));
  warnings.push(kind==='vrm'?'VRM的表情、眼动取决于实际绑定；内嵌许可仍需人工核对。':'通用GLB不自动具备VRM表情、眼动或挥手；仅播放文件内已有动画。');
 }else if(kind==='image2d'){
  const info=imageInfo(bytes);if(extension!=='.'+info.extension)throw Error('图片扩展名与实际格式不一致');
  modelFile='avatar.'+info.extension;files.set(modelFile,bytes);warnings.push('图片/动图保持原有画面，不会自动变成骨骼或Live2D模型；可进行整体呼吸/摇摆。');
 }else{
  if(!file.toLowerCase().endsWith('.maji2d.json'))throw Error('请选择 .maji2d.json 分层角色描述文件');
  const data=JSON.parse(bytes.toString('utf8'));if(data.version!==1||!bounded(data.width,1,4096)||!bounded(data.height,1,4096)||!Array.isArray(data.layers)||!data.layers.length||data.layers.length>32)throw Error('2D包需包含1～32层和不超过4096的画布');
  const root=await realpath(dirname(file)),mapping=new Map<string,string>();let total=0,pixels=0;
  const asset=async(value:unknown)=>{
   if(typeof value!=='string'||value.length>500||!value||/[\\%:#?\x00]/.test(value)||isAbsolute(value)||value.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('2D图片路径必须位于角色目录内，不能是网址或链接');
   if(mapping.has(value))return mapping.get(value)!;
   if(mapping.size>=128)throw Error('分层角色最多128张图片');
   const original=join(root,value),actual=await realpath(original),rel=relative(root,actual);
   if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep))throw Error('2D资源超出所选角色目录');
   const content=await read(original);const info=imageInfo(content);total+=content.length;pixels+=info.width*info.height;if(total>MAX_MODEL_BYTES||pixels>64_000_000)throw Error('2D角色超过128MB或图片合计6400万像素');
   const target=`asset-${mapping.size}.${info.extension}`;files.set(target,content);mapping.set(value,target);return target;
  };
  const layers:Puppet2D['layers']=[],ids=new Set<string>();
  for(const layer of data.layers){
   if(!layer||typeof layer.id!=='string'||!/^[-\w]{1,40}$/.test(layer.id)||ids.has(layer.id)||!['body','head','eyes','mouth','decoration'].includes(layer.role)||!bounded(layer.x,-4096,4096)||!bounded(layer.y,-4096,4096)||!bounded(layer.width,1,4096)||!bounded(layer.height,1,4096))throw Error('分层ID、角色部位或位置尺寸无效');
   ids.add(layer.id);layers.push({id:layer.id,file:await asset(layer.file),x:layer.x,y:layer.y,width:layer.width,height:layer.height,role:layer.role});
  }
  if(data.expressions!==undefined&&(!Array.isArray(data.expressions)||data.expressions.length>32))throw Error('表情列表最多32项');
  const expressions:Puppet2D['expressions']=[],names=new Set<string>();
  for(const expression of data.expressions??[]){
   if(!expression||typeof expression.name!=='string'||!expression.name.trim()||expression.name.length>40||names.has(expression.name)||!expression.files||typeof expression.files!=='object'||Array.isArray(expression.files))throw Error('表情名称或图层替换无效');
   names.add(expression.name);const replacements:Record<string,string>={};for(const [id,path]of Object.entries(expression.files)){if(!ids.has(id))throw Error('表情引用了不存在的图层');replacements[id]=await asset(path);}expressions.push({name:expression.name,files:replacements});
  }
  modelFile='model.json';files.set(modelFile,Buffer.from(JSON.stringify({version:1,width:data.width,height:data.height,layers,expressions} satisfies Puppet2D),'utf8'));
  warnings.push('分层包只支持声明式图层、表情替换和部位移动，不兼容Live2D、Spine、Inochi2D骨骼数据；未绑定部位不生成动作。');
 }
 const total=[...files.values()].reduce((sum,b)=>sum+b.length,0);if(total>MAX_MODEL_BYTES)throw Error('角色总大小超过128MB');
 const hash=createHash('sha256');for(const [name,data]of [...files].sort(([a],[b])=>a.localeCompare(b))){hash.update(name);hash.update('\0');hash.update(data);}
 return {kind,name:basename(file).replace(/\.maji2d\.json$|\.[^.]+$/i,'').slice(0,60),file:modelFile,files,bytes:total,sha256:hash.digest('hex'),warnings,claims,conflicts};
}
