import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {AssistantStore} from './assets';
import {snapshotModel} from './modelFiles';
const terms={type:'CC0-1.0',author:'测试作者',source:'本人原创的测试素材，用于程序验证',evidence:'本人原创并明确以 CC0 1.0 提供，允许免费、商用、改编及再分发。',changes:'未修改',free:true,commercial:true,derivatives:true,redistribution:true,confirmed:true};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
let root:string,store:AssistantStore;
beforeEach(async()=>{root=await mkdtemp(join(tmpdir(),'maji-import-flow-'));store=new AssistantStore(join(root,'data'));});
afterEach(async()=>{store.clearDrafts();vi.useRealTimers();if(dirname(root)===tmpdir())await rm(root,{recursive:true,force:true});});
function preview(draft:{token:string;kind:string;file:string}){store.previewResult('maji-avatar://renderer/avatar.html?'+new URLSearchParams({draft:draft.token,kind:draft.kind,file:draft.file}),true);}
async function image(){const file=join(root,'test.png');await writeFile(file,png);return file;}
it('keeps selection until confirmation and commits the exact preview snapshot',async()=>{
 const file=await image(),draft=await store.prepareImport(file,'image2d');expect((await store.get()).models).toHaveLength(1);
 await writeFile(file,'changed after preview');preview(draft);
 const entry=await store.confirmImport(draft.token,'我的2D角色',terms,false);
 expect((await store.get()).modelId).toBe('cosmic-bot');expect(entry.sha256).toBe(draft.sha256);
 expect(await readFile(await store.assetPath(`models/${entry.id}/avatar.png`))).toEqual(png);
 expect(JSON.parse(await readFile(join(root,'data','models',entry.id,'license-record.json'),'utf8')).license.verification).toBe('user-declared');
});
it('does not allow missing license, cancellation or a guessed token to commit',async()=>{
 const draft=await store.prepareImport(await image(),'image2d');
 preview(draft);await expect(store.confirmImport(draft.token,'角色',null,true)).rejects.toThrow();
 store.cancelImport(draft.token);await expect(store.confirmImport(draft.token,'角色',terms,true)).rejects.toThrow();
 await expect(store.draftAsset(draft.token,'avatar.png')).rejects.toThrow();
 await expect(store.confirmImport('guessed','角色',terms,true)).rejects.toThrow();expect((await store.get()).models).toHaveLength(1);
});
it('cannot commit before the isolated preview has loaded successfully',async()=>{
 const draft=await store.prepareImport(await image(),'image2d');
 await expect(store.confirmImport(draft.token,'跳过预览',terms,true)).rejects.toThrow('预览');
});
it('normalizes a scriptless layered 2D package with expression replacements',async()=>{
 await image();const file=join(root,'pet.maji2d.json');await writeFile(file,JSON.stringify({version:1,width:100,height:100,layers:[{id:'head',file:'test.png',role:'head',x:0,y:0,width:100,height:100}],expressions:[{name:'开心',files:{head:'test.png'}}]}));
 const draft=await store.prepareImport(file,'puppet2d');expect(draft.fileCount).toBe(2);
 const normalized=JSON.parse((await store.draftAsset(draft.token,'model.json')).toString());expect(normalized.layers[0].file).toBe('asset-0.png');
});
it.each(['../test.png','https://example.com/test.png','script.js'])('rejects unsafe layered file %s',async file=>{
 const path=join(root,'pet.maji2d.json');await writeFile(path,JSON.stringify({version:1,width:100,height:100,layers:[{id:'head',file,role:'head',x:0,y:0,width:100,height:100}]}));
 await expect(snapshotModel(path,'puppet2d')).rejects.toThrow();
});
it('rejects explicit NC permission even if all checkboxes are checked',async()=>{
 const json=JSON.stringify({asset:{version:'2.0'},extensions:{VRM:{meta:{licenseName:'CC_BY_NC',commercialUssageName:'Disallow'}}}});const text=Buffer.from(json.padEnd(Math.ceil(json.length/4)*4));const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(20+text.length,8);header.writeUInt32LE(text.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const file=join(root,'restricted.vrm');await writeFile(file,Buffer.concat([header,text]));const draft=await store.prepareImport(file,'vrm');expect(draft.conflicts.length).toBeGreaterThan(0);preview(draft);
 await expect(store.confirmImport(draft.token,'角色',terms,true)).rejects.toThrow();
});
it('applies restrictive VRM1 permission defaults instead of treating omission as permission',async()=>{
 const text=JSON.stringify({asset:{version:'2.0'},extensions:{VRMC_vrm:{meta:{name:'test',authors:['author'],licenseUrl:'https://vrm.dev/licenses/1.0/'}}}});const bytes=Buffer.from(text.padEnd(Math.ceil(text.length/4)*4));const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(20+bytes.length,8);header.writeUInt32LE(bytes.length,12);header.writeUInt32LE(0x4e4f534a,16);const file=join(root,'defaults.vrm');await writeFile(file,Buffer.concat([header,bytes]));
 const draft=await store.prepareImport(file,'vrm');expect(draft.claims?.modification).toBe('prohibited');expect(draft.claims?.allowRedistribution).toBe(false);expect(draft.conflicts.length).toBeGreaterThanOrEqual(3);
});
it('releases the draft automatically at the documented expiry time',async()=>{
 vi.useFakeTimers();const draft=await store.prepareImport(await image(),'image2d'),cancel=vi.spyOn(store,'cancelImport');
 vi.advanceTimersByTime(20*60_000);expect(cancel).toHaveBeenCalledWith(draft.token);await expect(store.draftAsset(draft.token,draft.file)).rejects.toThrow();
});
it('keeps unlicensed legacy copies removable and calculates their digest on license completion',async()=>{
 const draft=await store.prepareImport(await image(),'image2d');preview(draft);const entry=await store.confirmImport(draft.token,'旧角色',terms,true),settings=await store.get();
 await store.save({...settings,models:settings.models.map(m=>m.id===entry.id?{...m,license:undefined,sha256:undefined}:m)});
 expect((await store.get()).modelId).toBe('cosmic-bot');await expect(store.update({modelId:entry.id})).rejects.toThrow();
 const updated=await store.setModelLicense(entry.id,terms);expect(updated.models.find(m=>m.id===entry.id)?.sha256).toHaveLength(64);expect(updated.models.find(m=>m.id===entry.id)?.licenseRecordedAt).toBeTruthy();
 await store.removeModel(entry.id);expect((await store.get()).models).toHaveLength(1);
});
