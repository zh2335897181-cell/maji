import { expect, it } from 'vitest';
import { summaryWindows, transcriptGroups, validateClassroom } from './classroom';
it('preserves long final summaries when validating saved classroom records',()=>{
 const record={id:'class_1',title:'课程',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),aiEnabled:true,chunks:[],summaries:[],finalSummary:{markdown:'知识点'.repeat(20000)}};
 expect(validateClassroom(record)).toBe(record);
});
it('groups originals by two minutes without duplicating boundary-crossing chunks',()=>{
 const chunks=[{start:0,end:20,text:'第一段'},{start:100,end:120.05,text:'跨界原文'},{start:120.05,end:140,text:'第二组'},{start:240,end:260,text:'第三组'},{start:260,end:280,text:''}];
 const groups=transcriptGroups(chunks);
 expect(groups.map(g=>g.start)).toEqual([0,120,240]);
 expect(groups.flatMap(g=>g.chunks)).toEqual(chunks.slice(0,4));
 expect(groups[1]!.chunks[0]!.start-groups[1]!.start).toBeCloseTo(0.05);
 expect(transcriptGroups([])).toEqual([]);
});
it('waits two minutes, preserves silence timing and flushes the tail',()=>{
 const chunks=[{start:0,end:20,text:'构造器注入'},{start:20,end:120,text:''},{start:120,end:135,text:'单构造器'}];
 expect(summaryWindows(chunks,0)).toEqual([{start:0,end:120,text:'构造器注入'}]);
 expect(summaryWindows(chunks,120,true)).toEqual([{start:120,end:135,text:'单构造器'}]);
 expect(summaryWindows(chunks,135,true)).toEqual([]);
});
it('rejects malformed classroom timelines',()=>{
 expect(()=>validateClassroom({id:'class_1',title:'课程',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),aiEnabled:false,chunks:[{start:20,end:10,text:'x'}],summaries:[]})).toThrow();
});
