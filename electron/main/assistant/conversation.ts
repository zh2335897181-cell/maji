import type {AssistantMessage} from '../../../src/lib/assistant';
export class AssistantConversation {
 private messages:AssistantMessage[]=[];
 private active:AbortController|null=null;
 constructor(private complete:(history:AssistantMessage[],signal:AbortSignal)=>Promise<string>){}
 history(){return this.messages.map(m=>({...m}));}
 cancel(){this.active?.abort();this.active=null;}
 clear(){this.cancel();this.messages=[];}
 async chat(value:unknown){
  if(typeof value!=='string'||!value.trim()||value.length>4000)throw Error('请输入 1～4000 个字符');
  if(this.active)throw Error('助手正在回复，请先取消或等待完成');
  const controller=new AbortController();this.active=controller;
  const history=[...this.messages,{role:'user' as const,content:value.trim()}];
  while(history.length>19||history.reduce((n,m)=>n+m.content.length,0)>16000)history.splice(0,2);
  try{
   const content=await this.complete(history,controller.signal);
   controller.signal.throwIfAborted();
   const next:AssistantMessage[]=[...history,{role:'assistant',content}];
   while(next.length>20||next.reduce((n,m)=>n+m.content.length,0)>20000)next.splice(0,2);
   this.messages=next;return this.history();
  }finally{if(this.active===controller)this.active=null;}
 }
}
