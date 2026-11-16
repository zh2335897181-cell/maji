import {afterEach,beforeEach,expect,it} from 'vitest';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {AssistantStore} from './assets';
import {BUILTIN_ASSISTANT} from '../../../src/lib/assistant';

const terms={type:'CC0-1.0',author:'作者',source:'https://example.com/avatar',evidence:'作者发布页明确声明此角色以 CC0 1.0 提供，可免费获取及使用。',attribution:'',changes:'未修改',free:true,commercial:true,derivatives:true,redistribution:true,confirmed:true};
async function importModel(store:AssistantStore,file:string){const draft=await store.prepareImport(file,'vrm');store.previewResult('maji-avatar://renderer/avatar.html?'+new URLSearchParams({draft:draft.token,kind:draft.kind,file:draft.file}),true);return store.confirmImport(draft.token,'测试角色',terms,true);}

let root:string;
beforeEach(async()=>{root=await mkdtemp(join(tmpdir(),'maji-assistant-'));});
afterEach(async()=>{if(dirname(root)===tmpdir())await rm(root,{recursive:true,force:true});});
async function model(extra:object={}){
 const text=JSON.stringify({asset:{version:'2.0'},extensions:{VRM:{humanoid:{humanBones:[]}}},...extra});const json=Buffer.from(text.padEnd(Math.ceil(text.length/4)*4));
 const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(20+json.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const file=join(root,'test.vrm');await writeFile(file,Buffer.concat([header,json]));return file;
}
it('includes the default avatar without any SDK import',async()=>{
 const store=new AssistantStore(join(root,'data')),settings=await store.get();
 expect(settings.modelId).toBe(BUILTIN_ASSISTANT.id);expect(settings.models).toEqual([BUILTIN_ASSISTANT]);
 await expect(store.removeModel(BUILTIN_ASSISTANT.id)).rejects.toThrow();
});
it('imports a self-contained VRM and persists the selected copy',async()=>{
 const store=new AssistantStore(join(root,'data')),original=await model(),entry=await importModel(store,original);
 await store.update({name:'码码',modelId:entry.id,enabled:true,size:320});
 const next=new AssistantStore(join(root,'data'));expect((await next.get()).name).toBe('码码');
 expect(await readFile(await next.assetPath(`models/${entry.id}/avatar.vrm`))).toEqual(await readFile(original));
});
it.each(['https://example.com/texture.png','../secret.png','file:///C:/secret.png'])('rejects external model resources %s',async uri=>{
 const store=new AssistantStore(join(root,'data'));
 await expect(importModel(store,await model({images:[{uri}]}))).rejects.toThrow();
 expect((await store.get()).models).toHaveLength(1);
});
it('rejects invalid binary files and unsafe settings',async()=>{
 const store=new AssistantStore(join(root,'data'));const file=join(root,'fake.vrm');await writeFile(file,'not-vrm');
 await expect(importModel(store,file)).rejects.toThrow();await expect(store.update({size:9000})).rejects.toThrow();await expect(store.update({modelId:'missing'})).rejects.toThrow();
 await expect(store.assetPath('../settings.json')).rejects.toThrow();
});
it('removes only the imported copy and falls back to the builtin avatar',async()=>{
 const store=new AssistantStore(join(root,'data')),original=await model(),entry=await importModel(store,original);
 const settings=await store.removeModel(entry.id);expect(settings.models).toEqual([BUILTIN_ASSISTANT]);expect(settings.modelId).toBe(BUILTIN_ASSISTANT.id);expect((await readFile(original)).toString('ascii',0,4)).toBe('glTF');
});
it('accepts the bundled CC0 model through the custom import path',async()=>{
 const store=new AssistantStore(join(root,'data'));
 const entry=await importModel(store,join(process.cwd(),'public','assistant','cosmic-bot.vrm'));
 expect(entry.file).toBe('avatar.vrm');expect((await store.get()).models).toHaveLength(2);
});
