import { app, dialog } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { getDb } from './db/connection';
import { assertWritable, holdBackgroundWrites } from './backup/writeGate';
import { summaryWindows, validateClassroom, type ClassroomRecord, type ClassroomStatus } from '../../src/lib/classroom';
import type { AIService } from './ai/service';
import {speechRuntime,speechModel} from './ai/speechRuntime';

export class ClassroomService {
  private child:ChildProcessWithoutNullStreams|null=null;
  private current:ClassroomRecord|null=null;
  private queue:Promise<void>=Promise.resolve();
  private state:ClassroomStatus['state']='idle';
  private error='';private device='';private finishing=false;
  private drain:Promise<void>=Promise.resolve();private resolveDrain=()=>{};private quitting=false;
  constructor(private ai:AIService){
    for(const record of this.list()){
      let changed=false;
      if(record.aiEnabled)for(const window of summaryWindows(record.chunks,record.summaries.at(-1)?.end??0,true)){record.summaries.push({start:window.start,end:window.end,text:'',error:'上次课堂意外中断，请重试本段纪要'});changed=true;}
      for(const row of record.summaries)if(!row.text&&!row.error){row.error='上次摘要生成中断，请重试';changed=true;}
      if(changed)this.save(record);
    }
    app.on('before-quit',event=>{if(this.state==='idle')return;event.preventDefault();if(this.quitting)return;this.quitting=true;void this.stop().finally(()=>{this.quitting=false;app.quit();});});
  }
  private runtime(){return speechRuntime();}
  status():ClassroomStatus {return {installed:existsSync(join(this.runtime(),'venv','Scripts','python.exe'))&&existsSync(join(speechModel(),'model.int8.onnx'))&&existsSync(join(speechModel(),'tokens.txt')),state:this.state,activeId:this.current?.id??null,error:this.error,device:this.device};}
  list():ClassroomRecord[]{return (getDb().prepare('SELECT document FROM classroom_records ORDER BY updated_at DESC').all() as {document:string}[]).map(r=>validateClassroom(JSON.parse(r.document)));}
  private save(record:ClassroomRecord){assertWritable();record.updatedAt=new Date().toISOString();validateClassroom(record);getDb().prepare('INSERT INTO classroom_records(id,document,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document,updated_at=excluded.updated_at').run(record.id,JSON.stringify(record),record.updatedAt);}
  private async summarize(record:ClassroomRecord,index:number){
    const row=record.summaries[index]!;
    try {
      const text=record.chunks.filter(c=>c.end>row.start&&c.start<row.end).map(c=>c.text).filter(Boolean).join('\n');
      row.text=text.trim()?await this.ai.summarizeClassroom(text,record.summaries.slice(0,index).filter(s=>!s.error).map(s=>s.text).join('\n')):'本段没有可识别人声。';
      delete row.error;
    }catch(e){row.error=e instanceof Error?e.message:'摘要生成失败';row.text='';}
    this.save(record);
  }
  private schedule(record:ClassroomRecord,flush=false){
    if(!record.aiEnabled)return;
    const covered=record.summaries.at(-1)?.end??0;
    for(const window of summaryWindows(record.chunks,covered,flush)){
      const index=record.summaries.length;
      record.summaries.push({start:window.start,end:window.end,text:window.text.trim()?'':'本段没有可识别人声。'});
      this.save(record);
      if(window.text.trim())this.queue=this.queue.then(()=>this.summarize(record,index)).catch(e=>{this.error=String(e);});
    }
  }
  async retry(id:unknown,index:unknown){
    if(this.state!=='idle')throw Error('请先结束课堂并等待处理完成');
    if(typeof id!=='string'||!Number.isSafeInteger(index))throw Error('课堂分段参数无效');
    const record=this.list().find(r=>r.id===id),i=Number(index);
    if(!record||!record.summaries[i]?.error)throw Error('未找到失败的纪要');
    const release=holdBackgroundWrites();this.state='stopping';this.drain=new Promise(resolve=>{this.resolveDrain=resolve;});try{await this.summarize(record,i);}finally{release();this.state='idle';this.resolveDrain();}
  }
  async start(value:unknown,source:unknown,aiEnabled:unknown,file?:string):Promise<string>{
    if(this.state!=='idle')throw Error('已有课堂任务正在运行');
    if(typeof value!=='string'||!value.trim()||value.length>200||!['system','microphone','file'].includes(String(source))||typeof aiEnabled!=='boolean')throw Error('课堂参数无效');
    if(!this.status().installed)throw Error('本地模型未安装，请按课堂纪要文档安装');
    if(aiEnabled&&!(await this.ai.getSettings()).configured)throw Error('请先配置 AI 服务，或关闭自动 AI 纪要');
    if(this.state!=='idle')throw Error('已有课堂任务正在启动');
    const release=holdBackgroundWrites();
    const now=new Date().toISOString(),record:ClassroomRecord={id:'class_'+randomUUID(),title:value.trim(),createdAt:now,updatedAt:now,chunks:[],summaries:[],aiEnabled};
    this.current=record;this.error='';this.device='';this.state='starting';this.queue=Promise.resolve();this.finishing=false;
    this.drain=new Promise(resolve=>{this.resolveDrain=resolve;});
    try {
      this.save(record);
      const script=join(this.runtime(),'worker.py');mkdirSync(this.runtime(),{recursive:true});writeFileSync(script,readFileSync(join(app.getAppPath(),'speech','worker.py')));
      const args=[script,'--model',speechModel(),'--source',String(source)];if(file)args.push('--file',file);
      const child=spawn(join(this.runtime(),'venv','Scripts','python.exe'),args,{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONUTF8:'1'}});this.child=child;
      let stderr='';child.stderr.on('data',b=>{stderr=(stderr+String(b)).slice(-2000);});
      const lines=createInterface({input:child.stdout});
      lines.on('line',line=>{try{
        if(line.length>50000)throw Error('转写返回内容过长');
        const data=JSON.parse(line);
        if(data.type==='ready'){this.device=String(data.device);if(this.state==='starting')this.state=source==='file'?'importing':'recording';}
        if(data.type==='chunk'){
          const row={start:Number(data.start),end:Number(data.end),text:String(data.text)};
          if(row.start<(record.chunks.at(-1)?.end??0)-0.01)throw Error('转写时间顺序无效');
          validateClassroom({...record,chunks:[...record.chunks,row]});record.chunks.push(row);this.save(record);this.schedule(record);
        }
        if(data.type==='error'){this.error=String(data.message).slice(0,2000);child.kill();}
      }catch(e){this.error=e instanceof Error?e.message:String(e);child.kill();}});
      const finish=async(code:number|null)=>{
        if(this.finishing)return;this.finishing=true;this.state='stopping';
        if(code!==0&&!this.error)this.error=stderr||'本地转写进程退出，请检查音频设备';
        try{this.schedule(record,true);await this.queue;this.save(record);}catch(e){this.error=String(e);}finally{release();lines.close();this.child=null;this.current=null;this.state='idle';this.resolveDrain();}
      };
      child.on('error',e=>{this.error=e.message;void finish(1);});child.on('close',code=>void finish(code));
      return record.id;
    }catch(e){release();this.child?.kill();this.child=null;this.current=null;this.state='idle';this.resolveDrain();throw e;}
  }
  async stop(){if(this.child){this.state='stopping';if(!this.child.stdin.destroyed)this.child.stdin.write('stop\n');}await this.drain;}
  async importAudio(title:unknown,aiEnabled:unknown){
    if(this.state!=='idle')throw Error('请先结束当前课堂');
    const result=await dialog.showOpenDialog({title:'导入课堂录音',properties:['openFile'],filters:[{name:'录音文件',extensions:['wav','flac','ogg','mp3']} ]});
    if(result.canceled||!result.filePaths[0])return null;
    return this.start(title,'file',aiEnabled,result.filePaths[0]);
  }
  async control(command:unknown,value:unknown){const v=value as Record<string,unknown>|undefined;
    if(command==='status')return this.status();if(command==='list')return this.list();
    if(command==='start')return this.start(v?.title,v?.source,v?.aiEnabled);
    if(command==='import')return this.importAudio(v?.title,v?.aiEnabled);
    if(command==='stop')return this.stop();if(command==='retry')return this.retry(v?.id,v?.index);
    throw Error('未知课堂操作');
  }
}
