import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { ClassroomTasks } from './classroomTasks';

let directory:string;
vi.mock('electron',()=>({app:{getPath:()=>directory}}));
beforeEach(async()=>{directory=await mkdtemp(join(tmpdir(),'maji-task-test-'));});
afterEach(async()=>{vi.unstubAllEnvs();if(dirname(directory)===tmpdir())await rm(directory,{recursive:true,force:true});});

it('restores saved answers and analyses in a new task manager after interruption',async()=>{
 const first=new ClassroomTasks();
 const job=await first.begin('class_test','transcript',null);
 await job.options.save!('abc','already generated');
 await job.options.fileAnalysis!('src/A.ts','class evidence');
 first.cancel('class_test');
 await job.finish(new Error('cancelled'));
 const second=new ClassroomTasks();
 expect(await second.status('class_test')).toMatchObject({state:'paused',analyses:['src/A.ts']});
 expect(await second.analysis('class_test','src/A.ts')).toEqual({path:'src/A.ts',text:'class evidence'});
 const resumed=await second.begin('class_test','transcript',null);
 expect(await resumed.options.cached!('abc')).toBe('already generated');
 await resumed.finish();
 expect(await second.status('class_test')).toMatchObject({state:'done'});
});

it('rejects resuming against edited classroom text',async()=>{
 const tasks=new ClassroomTasks();
 const job=await tasks.begin('class_test','original',null);
 await job.finish(new Error('interrupted'));
 await expect(tasks.resumeManifest('class_test','changed')).rejects.toThrow('原文已修改');
});
