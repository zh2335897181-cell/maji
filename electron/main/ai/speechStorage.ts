import { app } from 'electron';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, constants } from 'node:fs';
import { mkdir, lstat, opendir, readFile, writeFile, rename, realpath, statfs } from 'node:fs/promises';
import { join, relative, isAbsolute, dirname, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { speechRuntime } from './speechRuntime';

async function* files(root:string, prefix=''):AsyncGenerator<{path:string;size:number}> {
  let directory;
  try{directory=await opendir(join(root,prefix));}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
  for await(const entry of directory){
    if(entry.name==='.maji-migration.json'||entry.name.endsWith('.maji-part'))continue;
    const path=join(prefix,entry.name),stats=await lstat(join(root,path));
    if(stats.isSymbolicLink())throw Error('语音目录包含符号链接，请使用普通目录');
    if(stats.isDirectory())yield* files(root,path);
    else if(stats.isFile())yield {path,size:stats.size};
  }
}

export async function speechStorageInfo(){
  const directory=speechRuntime();
  let bytes=0;
  for await(const file of files(directory))bytes+=file.size;
  let freeGB:number|null=null;
  try{const disk=await statfs(directory);freeGB=Math.round(disk.bavail*disk.bsize/1024**3*10)/10;}catch{/* New directory may not exist yet */}
  return {directory,usedGB:Math.round(bytes/1024**3*100)/100,freeGB};
}

async function hash(file:string,signal?:AbortSignal){
  const digest=createHash('sha256');
  for await(const chunk of createReadStream(file,{signal}))digest.update(chunk);
  return digest.digest('hex');
}

export async function relocateSpeech(selected:string,signal:AbortSignal,progress:(message:string,percent:number)=>void){
  const source=speechRuntime(),base=await realpath(selected),target=join(base,'maji-speech-runtime');
  const from=relative(source,target),to=relative(target,source);
  if(!from)return;
  const inside=(value:string)=>!isAbsolute(value)&&value!=='..'&&!value.startsWith('..'+sep);
  if(inside(from)||inside(to))throw Error('新目录不能与现有语音目录互相包含');
  const byPath=new Map<string,{path:string;size:number;sourceFile:string}>();
  for await(const file of files(source)){
    signal.throwIfAborted();
    byPath.set(file.path,{...file,sourceFile:join(source,file.path)});
  }
  let importedTarget:string|undefined;
  const sourceConfig=await readFile(join(source,'model-config.json'),'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(sourceConfig){
    const config=JSON.parse(sourceConfig);
    const imported=config.senseDirectory??(config.engine!=='qwen3-asr'?config.directory:undefined);
    if(typeof imported==='string'&&!inside(relative(source,imported))){
      importedTarget=join(target,'models','imported-sensevoice');
      for(const name of ['model.int8.onnx','tokens.txt']){
        const original=join(imported,name),stats=await lstat(original);
        if(!stats.isFile())throw Error('导入的 SenseVoice 模型文件无效');
        const path=join('models','imported-sensevoice',name);
        byPath.set(path,{path,size:stats.size,sourceFile:original});
      }
    }
  }
  const entries=[...byPath.values()];
  const total=entries.reduce((sum,file)=>sum+file.size,0);
  const marker=join(target,'.maji-migration.json');
  const targetStats=await lstat(target).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(targetStats){
    if(!targetStats.isDirectory()||targetStats.isSymbolicLink())throw Error('目标语音目录不可用');
    const existing=JSON.parse(await readFile(marker,'utf8').catch(()=>{throw Error('目标目录已存在，请选择其他位置');}));
    if(existing.source!==source)throw Error('目标目录属于另一个语音资料库，请选择其他位置');
  }
  await mkdir(target,{recursive:true});
  await writeFile(marker,JSON.stringify({source}));
  const disk=await statfs(target);
  let missing=0;
  for(const entry of entries){
    const dest=await lstat(join(target,entry.path)).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(!dest?.isFile()||dest.size!==entry.size)missing+=entry.size;
  }
  if(disk.bavail*disk.bsize<missing)throw Error('目标磁盘空间不足以复制语音模型和运行环境');
  let copied=0;
  for(const entry of entries){
    signal.throwIfAborted();
    const original=entry.sourceFile,destination=join(target,entry.path);
    progress('迁移并校验 '+entry.path,Math.round(copied/Math.max(1,total)*95));
    await mkdir(dirname(destination),{recursive:true});
    const dest=await lstat(destination).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(dest?.isSymbolicLink()||dest?.isDirectory())throw Error('目标文件位置不可用');
    const matches=dest?.size===entry.size&&await hash(original,signal)===await hash(destination,signal);
    if(!matches){
      const temporary=destination+'.maji-part';
      await pipeline(createReadStream(original),createWriteStream(temporary,{flags:'w',mode:constants.S_IRUSR|constants.S_IWUSR}),{signal});
      if(await hash(original,signal)!==await hash(temporary,signal))throw Error('迁移文件校验失败，请重试');
      await rename(temporary,destination);
    }
    copied+=entry.size;
  }
  // Rebase an explicitly imported model if it was stored inside the old runtime.
  const config=join(target,'model-config.json');
  try{
    const value=JSON.parse(await readFile(config,'utf8'));
    for(const key of ['directory','senseDirectory']){
      if(typeof value[key]!=='string')continue;
      const within=relative(source,value[key]);
      if(inside(within))value[key]=join(target,within);
    }
    if(importedTarget){
      value.senseDirectory=importedTarget;
      if(value.engine!=='qwen3-asr')value.directory=importedTarget;
    }
    await writeFile(config,JSON.stringify(value));
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  signal.throwIfAborted();
  const pointer=join(app.getPath('userData'),'speech-location.json');
  await mkdir(app.getPath('userData'),{recursive:true});
  await writeFile(pointer+'.tmp',JSON.stringify({directory:target,previousDirectory:source}));
  signal.throwIfAborted();
  await rename(pointer+'.tmp',pointer);
  progress('已切换到 '+target+'。原目录 '+source+' 仍保留，可核对后手动清理。',100);
}
