import {app,dialog} from 'electron';
import {execFile,spawn,type ChildProcess} from 'node:child_process';
import {promisify} from 'node:util';
import {cpus,totalmem,freemem} from 'node:os';
import {access,mkdir,readFile,writeFile,rm,stat,statfs,open} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {localModelName,recommendModels,type LocalInspection,type LocalJob,type LocalModel,type LocalProbe,type Hardware} from '../../../src/lib/localAI';
import {validateProviderSettings,validateAPIKey} from './validation';
import {speechRuntime,speechModel} from './speechRuntime';
const exec=promisify(execFile),BASE='http://127.0.0.1:11434';
async function ollamaPath(){
 try{const {stdout}=await exec('where.exe',['ollama.exe'],{windowsHide:true,timeout:5000,maxBuffer:10000});const path=stdout.trim().split(/\r?\n/)[0]!;await access(path);return path;}catch{return null;}
}
async function json(path:string,body?:unknown,timeout=10000,signal?:AbortSignal):Promise<any>{
 const r=await fetch(BASE+path,{method:body?'POST':'GET',...(body?{body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}:{}),redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout)});
 const text=await r.text();if(text.length>2_000_000)throw Error('本地服务响应过大');if(!r.ok)throw Error('Ollama 请求失败：'+text.slice(0,250));return JSON.parse(text);
}
export class LocalModelService {
 private task:LocalJob={state:'idle',kind:'',message:'',progress:null};private controller:AbortController|null=null;private child:ChildProcess|null=null;
 constructor(private speechIdle:()=>boolean){app.on('before-quit',()=>{this.controller?.abort();this.child?.kill();});}
 job(){return {...this.task};}
 async hardware():Promise<Hardware>{
  let gpu='未检测到独立显卡',vramGB=0;
  try{const {stdout}=await exec('nvidia-smi',['--query-gpu=name,memory.total','--format=csv,noheader,nounits'],{windowsHide:true,timeout:8000,maxBuffer:10000});const [name,memory]=stdout.trim().split(/\r?\n/)[0]!.split(',');gpu=name!.trim();vramGB=Math.round(Number(memory)/1024*10)/10;}catch{
   try{const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command','Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress'],{windowsHide:true,timeout:10000,maxBuffer:10000});const cards=JSON.parse(stdout),rows=Array.isArray(cards)?cards:[cards];gpu=rows.map((r:any)=>r.Name).join(' / ');vramGB=Math.max(...rows.map((r:any)=>Number(r.AdapterRAM||0)/1024**3));}catch{/* CPU remains usable */}
  }
  let diskFreeGB:number|null=null;try{const disk=await statfs(app.getPath('userData'));diskFreeGB=Math.round(disk.bavail*disk.bsize/1024**3);}catch{/* No disk estimate */}
  return {cpu:cpus()[0]?.model??'未知 CPU',ramGB:Math.round(totalmem()/1024**3),freeGB:Math.round(freemem()/1024**3*10)/10,gpu,vramGB,diskFreeGB};
 }
 async inspect():Promise<LocalInspection>{
  const hardware=await this.hardware();let version='',models:LocalModel[]=[],message='';
  try{version=(await json('/api/version')).version;const tags=await json('/api/tags');
   models=await Promise.all((tags.models??[]).slice(0,80).map(async(row:any)=>{try{const info=await json('/api/show',{model:row.name});return {name:String(row.name),size:Number(row.size),capabilities:Array.isArray(info.capabilities)?info.capabilities:[],remote:!!info.remote_host||!!info.remote_model||/cloud/i.test(row.name)};}catch{return {name:String(row.name),size:Number(row.size),capabilities:[],remote:true};}}));
  }catch{message='Ollama 未启动，可点击启动本地服务。';}
  const available=models.filter(m=>!m.remote&&m.capabilities.includes('completion'));
  const best=available.find(m=>/qwen3.*4b/.test(m.name)&&hardware.ramGB>=12)??available.find(m=>/qwen2.5.*1.5b/.test(m.name))??available[0];if(best)best.recommended=true;
  let speechReady=false;try{speechReady=existsSync(join(speechRuntime(),'venv','Scripts','python.exe'))&&existsSync(join(speechModel(),'model.int8.onnx'))&&existsSync(join(speechModel(),'tokens.txt'));}catch{/* Report not ready */}
  return {hardware,installed:!!(await ollamaPath()),running:!!version,version,models,recommendations:recommendModels(hardware),speechReady,message};
 }
 async start(){
  try{await json('/api/version');return;}catch{/* Start only if absent */}
  const file=await ollamaPath();if(!file)throw Error('未找到 Ollama，请从官方 Windows 下载页安装后重试');
  const child=spawn(file,['serve'],{windowsHide:true,detached:true,stdio:'ignore',env:{...process.env,OLLAMA_HOST:'127.0.0.1:11434',OLLAMA_NO_CLOUD:'1'}});child.on('error',()=>{});child.unref();
  for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,500));try{await json('/api/version');return;}catch{/* warming up */}}throw Error('Ollama 启动失败，请手动打开后重试');
 }
 private begin(kind:string){if(this.task.state==='running')throw Error('已有模型任务在进行，请等待或取消');this.task={kind,state:'running',message:'正在准备',progress:null};this.controller=new AbortController();}
 private run(kind:string,action:()=>Promise<void>){this.begin(kind);void action().then(()=>{this.task={...this.task,state:this.controller?.signal.aborted?'error':'done',progress:100,message:this.controller?.signal.aborted?'已取消；可稍后重试':'完成，请刷新模型列表或运行自检'};}).catch(e=>{this.task={...this.task,state:'error',message:this.controller?.signal.aborted?'已取消；可稍后重试':e instanceof Error?e.message:String(e)};}).finally(()=>{this.child=null;this.controller=null;});}
 async cancel(){this.controller?.abort();this.child?.kill();}
 private async stream(path:string,body:unknown){
  const response=await fetch(BASE+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:this.controller!.signal});
  if(!response.ok||!response.body)throw Error('本地模型操作失败，请检查 Ollama 服务');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  const progress=(line:string)=>{if(!line.trim())return;const row=JSON.parse(line);if(row.error)throw Error(String(row.error));this.task={...this.task,message:String(row.status??'处理中').slice(0,300),progress:row.total?Math.min(100,Math.round(row.completed/row.total*100)):null};};
  try{while(true){const part=await reader.read();if(part.done)break;buffer+=decoder.decode(part.value,{stream:true});if(buffer.length>100000)throw Error('模型进度响应过大');let index;while((index=buffer.indexOf('\n'))>=0){progress(buffer.slice(0,index));buffer=buffer.slice(index+1);}}progress(buffer+decoder.decode());}finally{await reader.cancel().catch(()=>{});}
 }
 async pull(value:unknown){const model=localModelName(value);this.run('下载文字模型',async()=>{await this.stream('/api/pull',{model,stream:true});});}
 async importGGUF(){
  if(this.task.state==='running')throw Error('请先等待当前模型任务');
  const result=await dialog.showOpenDialog({title:'导入单文件 GGUF 文字模型',properties:['openFile'],filters:[{name:'GGUF 模型',extensions:['gguf']}]});if(result.canceled||!result.filePaths[0])return;
  const file=result.filePaths[0];if(/[\r\n]/.test(file))throw Error('文件路径无效');
  const handle=await open(file,'r');try{const header=Buffer.alloc(4);await handle.read(header,0,4,0);if(header.toString()!=='GGUF')throw Error('不是有效的 GGUF 文件');}finally{await handle.close();}
  const binary=await ollamaPath();if(!binary)throw Error('请先安装 Ollama');
  const name='maji-import-'+randomUUID().slice(0,8),temp=join(app.getPath('userData'),'model-imports',name+'.Modelfile');
  this.run('导入 GGUF',async()=>{await mkdir(dirname(temp),{recursive:true});await writeFile(temp,`FROM ${JSON.stringify(file.replaceAll('\\','/'))}\nPARAMETER num_ctx 8192\n`);
   try{this.controller?.signal.throwIfAborted();await new Promise<void>((resolve,reject)=>{const child=spawn(binary,['create',name,'-f',temp],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,OLLAMA_HOST:'127.0.0.1:11434',OLLAMA_NO_CLOUD:'1'}});this.child=child;child.stderr.on('data',b=>{this.task.message=String(b).replace(/\u001b\[[0-9;?]*[A-Za-z]/g,'').slice(-250);});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('模型导入失败，请确认 Ollama 支持该 GGUF 架构')));});}finally{await rm(temp,{force:true});}
  });
 }
 async importAPI(){const result=await dialog.showOpenDialog({title:'导入 OpenAI 兼容 API 配置（JSON）',properties:['openFile'],filters:[{name:'API 配置',extensions:['json']}]});if(result.canceled||!result.filePaths[0])return null;
  const file=result.filePaths[0];if((await stat(file)).size>32768)throw Error('API 配置文件过大');const value=JSON.parse(await readFile(file,'utf8'));const settings=validateProviderSettings({...value,provider:'api'});return {settings,...(value.apiKey?{apiKey:validateAPIKey(value.apiKey)}:{})};
 }
 async probe(value:unknown):Promise<LocalProbe>{
  const model=localModelName(value);this.begin('文字生成自检');try{const info=await json('/api/show',{model});if(info.remote_host||info.remote_model||!info.capabilities?.includes('completion'))throw Error('所选模型不是本地文字生成模型（检索向量模型不能用于笔记或纪要）');
  const started=Date.now();const text=await json('/api/chat',{model,think:false,stream:false,messages:[{role:'user',content:'请用一句简短中文介绍你能帮助整理学习笔记。'}],options:{num_ctx:4096,num_predict:64}},300000,this.controller!.signal);
  const structured=await json('/api/chat',{model,think:false,stream:false,format:'json',messages:[{role:'user',content:'只输出 JSON 对象 {"ok":true,"points":["知识点"]}，不要其他说明。'}],options:{num_ctx:4096,num_predict:96}},300000,this.controller!.signal);
  let jsonOK=false;try{const parsed=JSON.parse(structured.message?.content);jsonOK=parsed.ok===true&&Array.isArray(parsed.points);}catch{/* Show JSON failure clearly */}
  const answer=String(text.message?.content??'');this.task={...this.task,state:'done',message:'文字生成自检完成',progress:100};return {ok:!!answer.trim(),model,latencyMs:Date.now()-started,jsonOK,text:answer.slice(0,500),message:jsonOK?'已通过实际中文生成和 JSON 自检；不代表所有复杂题目都准确':'文字生成可用，但 JSON 自检未通过，思维导图和出题可能失败'};
  }catch(e){this.task={...this.task,state:'error',message:String(e)};throw e;}finally{this.controller=null;}
 }
 private python(){const choices=[join(speechRuntime(),'venv','Scripts','python.exe'),join(process.env.LOCALAPPDATA??'','Programs','Python','Python311','python.exe')];return choices.find(existsSync);}
 private async process(file:string,args:string[]){this.controller?.signal.throwIfAborted();await new Promise<void>((resolve,reject)=>{const child=spawn(file,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONUTF8:'1'}});this.child=child;const update=(b:Buffer)=>{this.task.message=String(b).trim().slice(-350);};child.stdout.on('data',update);child.stderr.on('data',update);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('本地转写操作失败：'+this.task.message)));});this.controller?.signal.throwIfAborted();}
 async installSpeech(){if(!this.speechIdle())throw Error('请先结束课堂录音');const python=this.python();if(!python)throw Error('请先安装 Python 3.11，再安装推荐语音模型');
  const script=join(speechRuntime(),'install.py');await mkdir(speechRuntime(),{recursive:true});await writeFile(script,await readFile(join(app.getAppPath(),'speech','install.py')));
  this.run('安装 SenseVoice INT8',()=>this.process(python,[script,'--runtime',speechRuntime()]));
 }
 private async checkSpeech(directory:string){
  if(!existsSync(join(directory,'model.int8.onnx'))||!existsSync(join(directory,'tokens.txt')))throw Error('请选择包含 model.int8.onnx 和 tokens.txt 的 SenseVoice INT8 文件夹');
  const python=join(speechRuntime(),'venv','Scripts','python.exe');if(!existsSync(python))throw Error('请先安装语音运行环境');
  const root=speechRuntime(),sample=join(root,'selfcheck.wav'),script=join(root,'worker.py');
  await mkdir(root,{recursive:true});const wav=Buffer.alloc(44+3200);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(3200,40);await writeFile(sample,wav);await writeFile(script,await readFile(join(app.getAppPath(),'speech','worker.py')));
  await this.process(python,[script,'--source','file','--model',directory,'--file',sample,'--self-test']);
 }
 async importSpeech(){if(!this.speechIdle())throw Error('请先结束课堂录音');if(this.task.state==='running')throw Error('请先等待当前模型任务');const result=await dialog.showOpenDialog({title:'选择 SenseVoice INT8 模型目录',properties:['openDirectory']});if(result.canceled||!result.filePaths[0])return;if(!this.speechIdle())throw Error('请先结束课堂录音');const directory=result.filePaths[0];this.run('验证语音模型',async()=>{await this.checkSpeech(directory);this.controller?.signal.throwIfAborted();await writeFile(join(speechRuntime(),'model-config.json'),JSON.stringify({directory}));});}
 async probeSpeech(){if(!this.speechIdle())throw Error('请先结束课堂录音');if(this.task.state==='running')throw Error('请先等待当前模型任务');this.begin('语音自检');try{await this.checkSpeech(speechModel());this.task={...this.task,state:'done',message:'语音模型加载和本地解码通过（静音样本，不代表课堂准确率）',progress:100};return this.task.message;}catch(e){this.task={...this.task,state:'error',message:String(e)};throw e;}finally{this.child=null;this.controller=null;}}
 async control(command:unknown,value:unknown){
  switch(command){case 'inspect':return this.inspect();case 'start':return this.start();case 'pull':return this.pull(value);case 'cancel':return this.cancel();case 'job':return this.job();case 'importGGUF':return this.importGGUF();case 'importAPI':return this.importAPI();case 'probe':return this.probe(value);case 'installSpeech':return this.installSpeech();case 'importSpeech':return this.importSpeech();case 'probeSpeech':return this.probeSpeech();default:throw Error('未知本地模型操作');}
 }
}
