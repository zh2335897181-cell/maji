import Database from 'better-sqlite3';
import {afterAll,beforeEach,expect,it,vi} from 'vitest';
import {migrate} from './db/schema';
import {ClassroomService} from './classroom';
import {beginRestore} from './backup/writeGate';
import type {AIService} from './ai/service';
vi.mock('electron',()=>({app:{on:vi.fn(),getPath:()=>'.'},dialog:{showOpenDialog:vi.fn()}}));
vi.mock('./db/connection',()=>({getDb:()=>db}));
const db=new Database(':memory:');migrate(db);
afterAll(()=>db.close());beforeEach(()=>db.prepare('DELETE FROM classroom_records').run());
function insert(){const now=new Date().toISOString();const doc={id:'class_test',title:'课堂',createdAt:now,updatedAt:now,aiEnabled:true,chunks:[{start:0,end:125,text:'老师的知识点'}],summaries:[{start:0,end:120,text:''}]};db.prepare('INSERT INTO classroom_records VALUES (?,?,?)').run(doc.id,JSON.stringify(doc),now);}
it('recovers interrupted summaries and the unfinished tail as retryable failures',()=>{
 insert();const service=new ClassroomService({} as AIService),rows=service.list();
 expect(rows[0]!.summaries).toHaveLength(2);expect(rows[0]!.summaries.every(s=>!!s.error)).toBe(true);
});
it('serializes retry requests and blocks restoration while AI writes are pending',async()=>{
 insert();let resolve!:(s:string)=>void;const pending=new Promise<string>(r=>resolve=r);
 const service=new ClassroomService({summarizeClassroom:()=>pending} as unknown as AIService);
 const first=service.retry('class_test',0);
 await expect(service.retry('class_test',1)).rejects.toThrow('请先结束');
 expect(()=>beginRestore()).toThrow('课堂录音');resolve('关键知识点');await first;
 expect(service.list()[0]!.summaries[0]!.text).toBe('关键知识点');
 const unblock=beginRestore();unblock();
});
