import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { relocateSpeech } from './speechStorage';
import { speechRuntime } from './speechRuntime';

let directory:string;
vi.mock('electron',()=>({app:{getPath:()=>directory}}));
beforeEach(async()=>{directory=await mkdtemp(join(tmpdir(),'maji-storage-test-'));});
afterEach(async()=>{vi.unstubAllEnvs();if(dirname(directory)===tmpdir())await rm(directory,{recursive:true,force:true});});

it('copies and verifies the runtime before changing the persistent location',async()=>{
 const source=join(directory,'source'),selected=join(directory,'disk-d');
 vi.stubEnv('MAJI_SPEECH_RUNTIME',source);
 await mkdir(join(source,'models'),{recursive:true});await mkdir(selected);
 await writeFile(join(source,'models','weights'),'model-data');
 await writeFile(join(source,'model-config.json'),JSON.stringify({directory:join(source,'models')}));
 await relocateSpeech(selected,new AbortController().signal,()=>{});
 const target=join(selected,'maji-speech-runtime');
 expect(speechRuntime()).toBe(target);
 expect(await readFile(join(target,'models','weights'),'utf8')).toBe('model-data');
 expect(JSON.parse(await readFile(join(target,'model-config.json'),'utf8')).directory).toBe(join(target,'models'));
 expect(await readFile(join(source,'models','weights'),'utf8')).toBe('model-data');
});

it('does not activate a destination after migration was cancelled',async()=>{
 const source=join(directory,'source'),selected=join(directory,'disk-d');
 vi.stubEnv('MAJI_SPEECH_RUNTIME',source);
 await mkdir(source);await mkdir(selected);await writeFile(join(source,'model'),'weights');
 const controller=new AbortController();controller.abort();
 await expect(relocateSpeech(selected,controller.signal,()=>{})).rejects.toThrow();
 expect(speechRuntime()).toBe(source);
});

it('moves explicitly imported SenseVoice weights into the selected runtime',async()=>{
 const source=join(directory,'source'),selected=join(directory,'disk-d'),imported=join(directory,'imported');
 vi.stubEnv('MAJI_SPEECH_RUNTIME',source);
 await mkdir(source);await mkdir(selected);await mkdir(imported);
 await writeFile(join(imported,'model.int8.onnx'),'imported-weights');
 await writeFile(join(imported,'tokens.txt'),'tokens');
 await writeFile(join(source,'model-config.json'),JSON.stringify({directory:imported}));
 await relocateSpeech(selected,new AbortController().signal,()=>{});
 const target=join(selected,'maji-speech-runtime');
 const config=JSON.parse(await readFile(join(target,'model-config.json'),'utf8'));
 expect(config.senseDirectory).toBe(join(target,'models','imported-sensevoice'));
 expect(await readFile(join(config.senseDirectory,'model.int8.onnx'),'utf8')).toBe('imported-weights');
});
