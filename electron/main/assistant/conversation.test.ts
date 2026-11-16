import {expect,it,vi} from 'vitest';
import {AssistantConversation} from './conversation';
it('keeps bounded multi-turn history and rejects empty input',async()=>{
 const complete=vi.fn(async()=> 'answer');const chat=new AssistantConversation(complete);
 await expect(chat.chat('')).rejects.toThrow();
 for(let i=0;i<12;i++)await chat.chat('question '+i);
 expect(chat.history()).toHaveLength(20);expect(complete.mock.calls).toHaveLength(12);
 expect(chat.history()[0].content).toBe('question 2');
});
it('does not commit a late response after clear or cancellation',async()=>{
 let done!:(value:string)=>void;const chat=new AssistantConversation(()=>new Promise(resolve=>{done=resolve;}));
 const request=chat.chat('hello');chat.clear();done('late');await expect(request).rejects.toThrow();expect(chat.history()).toEqual([]);
});
it('accepts a new request immediately after cancelling and discards the old completion',async()=>{
 const completions:((value:string)=>void)[]=[];
 const chat=new AssistantConversation(()=>new Promise(resolve=>completions.push(resolve)));
 const old=chat.chat('old');chat.cancel();const next=chat.chat('new');
 completions[1]('new answer');await next;completions[0]('old answer');await expect(old).rejects.toThrow();
 expect(chat.history().map(m=>m.content)).toEqual(['new','new answer']);
});
it('also bounds the committed history after long replies',async()=>{
 const chat=new AssistantConversation(async()=> 'a'.repeat(6000));
 for(let i=0;i<5;i++)await chat.chat('q'.repeat(4000));
 expect(chat.history().reduce((n,m)=>n+m.content.length,0)).toBeLessThanOrEqual(20000);
 expect(chat.history().at(-1)?.content).toHaveLength(6000);
});
