import Database from 'better-sqlite3';
import {afterAll,beforeEach,expect,it,vi} from 'vitest';
import {migrate} from './db/schema';
import {ClassroomService} from './classroom';
import {beginRestore} from './backup/writeGate';
import type {AIService} from './ai/service';
vi.mock('electron',()=>({app:{on:vi.fn(),getPath:()=>'.'},dialog:{showOpenDialog:vi.fn()},BrowserWindow:{getAllWindows:()=>[]}}));
vi.mock('./db/connection',()=>({getDb:()=>db}));
const db=new Database(':memory:');migrate(db);
afterAll(()=>db.close());beforeEach(()=>{db.prepare('DELETE FROM classroom_records').run();db.prepare('DELETE FROM notes').run();db.prepare('DELETE FROM courses').run();});
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
it('creates one Markdown note from the full transcript, not the brief summaries',async()=>{
 insert();const summarizeClassroomFinal=vi.fn().mockResolvedValue('# 课堂知识点\n\n- 构造器注入');
 const service=new ClassroomService({summarizeClassroomFinal} as unknown as AIService);
 await service.finalize('class_test');
 expect(summarizeClassroomFinal.mock.calls[0]![0]).toContain('老师的知识点');
 const row=service.list()[0]!;expect(row.finalSummary?.noteId).toMatch(/^note_/);
 const note=db.prepare('SELECT content_json FROM notes WHERE id=?').get(row.finalSummary!.noteId) as {content_json:string};
 expect(JSON.parse(note.content_json).content.at(-1).content[0].text).toBe('# 课堂知识点\n\n- 构造器注入');
 await service.finalize('class_test');expect(summarizeClassroomFinal).toHaveBeenCalledTimes(1);
 expect((db.prepare('SELECT count(*) AS n FROM notes').get() as {n:number}).n).toBe(1);
});
it('retains originals when final generation fails and allows retry',async()=>{
 insert();const summarizeClassroomFinal=vi.fn().mockRejectedValueOnce(Error('模型暂不可用')).mockResolvedValue('# 重试成功');
 const service=new ClassroomService({summarizeClassroomFinal} as unknown as AIService);
 await service.finalize('class_test');expect(service.list()[0]!.finalSummary?.error).toBe('模型暂不可用');
 expect(service.list()[0]!.chunks[0]!.text).toBe('老师的知识点');
 await service.finalize('class_test');expect(service.list()[0]!.finalSummary?.noteId).toBeTruthy();
});
it('edits text with conflict checks, keeps timing, and preserves the generated note on deletion',async()=>{
 insert();const service=new ClassroomService({summarizeClassroomFinal:async()=>'# 知识点'} as unknown as AIService);await service.finalize('class_test');
 const record=service.list()[0]!,patch={title:'修改后的课堂',chunkTexts:['已纠正原文'],summaryTexts:record.summaries.map(()=> '已纠正知识点')};
 expect(()=>service.update(record.id,patch,'stale')).toThrow('已变化');
 service.update(record.id,patch,record.updatedAt);
 const edited=service.list()[0]!;expect(edited.title).toBe(patch.title);expect(edited.chunks[0]).toEqual({start:0,end:125,text:'已纠正原文'});expect(edited.finalSummary?.outdated).toBe(true);
 service.update(record.id,{...patch,summaryTexts:edited.summaries.map(()=> '')},edited.updatedAt);
 const reloaded=new ClassroomService({} as AIService).list()[0]!;expect(reloaded.summaries.every(s=>s.edited&&!s.error&&s.text==='')).toBe(true);
 service.remove(record.id);expect(service.list()).toHaveLength(0);expect(db.prepare('SELECT id FROM notes WHERE id=?').get(record.finalSummary!.noteId)).toBeTruthy();
});
