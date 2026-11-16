// Native integration: bundled CC0 VRM rendering, chat, isolation and disposable data.
const {_electron}=require('playwright');
const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const assert=require('node:assert/strict');
(async()=>{
 const project=path.resolve(__dirname,'..'),temporary=await fs.mkdtemp(path.join(os.tmpdir(),'maji-pet-electron-'));
 let electron;
 try{
  const harness=path.join(temporary,'harness.cjs');
  await fs.writeFile(harness,`
   const {app,BrowserWindow}=require('electron');
   const {registerAvatarScheme}=require(${JSON.stringify(path.join(project,'dist-electron/electron/main/assistant/protocol.js'))});
   const {DesktopAssistant}=require(${JSON.stringify(path.join(project,'dist-electron/electron/main/assistant/service.js'))});
   app.setPath('userData',${JSON.stringify(temporary)});registerAvatarScheme();
   app.whenReady().then(async()=>{
    const assistant=new DesktopAssistant({chatAssistant:async(history)=>'答复：'+history.at(-1).content});
    const main=new BrowserWindow({show:false,webPreferences:{preload:${JSON.stringify(path.join(project,'dist-electron/electron/preload/index.js'))},contextIsolation:true,sandbox:true}});
    await assistant.attach(main);global.assistantService=assistant;
    await main.loadFile(${JSON.stringify(path.join(project,'dist/assistant.html'))});
   });
  `);
  electron=await _electron.launch({args:[harness],timeout:30000});
  const main=await electron.firstWindow();await main.waitForFunction(()=>!!window.maji?.assistant);
  await main.evaluate(()=>window.maji.assistant.update({enabled:true,name:'测试助手'}));
  let pet;for(let i=0;i<100;i++){pet=electron.windows().find(w=>w!==main);if(pet)break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(pet,'assistant window created');await pet.getByRole('button',{name:'和我聊聊'}).click();
  await pet.getByLabel('发送给助手').fill('你好');await pet.getByRole('button',{name:'发送 ↑'}).click();await pet.getByText('答复：你好').waitFor();
  await pet.getByRole('combobox',{name:'角色动作'}).waitFor({timeout:30000});
  await pet.getByRole('combobox',{name:'角色动作'}).selectOption('挥手');
  await pet.getByRole('combobox',{name:'角色动作'}).selectOption('点头');
  const frame=pet.frames().find(f=>f.url().startsWith('maji-avatar:'));assert.ok(frame,'isolated avatar frame created');
  const isolation=await frame.evaluate(()=>{let parentReadable=false;try{void window.parent.document.body;parentReadable=true;}catch{}return {parentReadable,bridge:typeof window.maji,require:typeof window.require,origin:location.origin};});
  assert.equal(isolation.parentReadable,false);assert.equal(isolation.bridge,'undefined');assert.equal(isolation.require,'undefined');
  console.log('avatar isolation:',JSON.stringify(isolation));
  await fs.mkdir(path.join(project,'test-results/native-assistant'),{recursive:true});
  await pet.screenshot({path:path.join(project,'test-results/native-assistant/assistant.png')});
  await main.evaluate(()=>window.maji.assistant.update({name:'小码'}));
  await pet.locator('.pet-chat-toggle').click();
  await pet.evaluate(()=>{document.body.style.background='#edf4f2';});
  await pet.screenshot({path:path.join(project,'test-results/native-assistant/default-avatar.png')});
  // Reopen before the recreate check so it exercises the expanded-state reset.
  await pet.locator('.pet-chat-toggle').click();
  const forbidden=await frame.evaluate(async()=>{try{await fetch('https://example.com');return false;}catch{return true;}});assert.equal(forbidden,true);
  const source=path.join(temporary,'fixtures');await fs.mkdir(source);
  const png=await main.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=100;canvas.height=100;const ctx=canvas.getContext('2d');ctx.fillStyle='#4e9c99';ctx.fillRect(10,10,80,80);ctx.fillStyle='white';ctx.fillRect(25,30,10,10);ctx.fillRect(65,30,10,10);return canvas.toDataURL('image/png').split(',')[1];});
  const imageFile=path.join(source,'test.png');await fs.writeFile(imageFile,Buffer.from(png,'base64'));
  const terms={type:'CC0-1.0',author:'测试生成素材',source:'本测试脚本原创图形，非用户素材',evidence:'本测试脚本生成的简单图形以CC0提供，允许免费、商用、改编和再分发。',attribution:'',changes:'未修改',free:true,commercial:true,derivatives:true,redistribution:true,confirmed:true};
  async function prepare(file,kind){await electron.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);return main.evaluate(kind=>window.maji.assistant.prepareImport(kind),kind);}
  async function preview(draft){
   const result=await main.evaluate(draft=>new Promise((resolve,reject)=>{
    const element=document.createElement('iframe');element.sandbox='allow-scripts allow-same-origin';element.style.cssText='width:240px;height:260px';element.src='maji-avatar://renderer/avatar.html?'+new URLSearchParams({draft:draft.token,kind:draft.kind,file:draft.file});
    const timer=setTimeout(()=>{element.remove();reject(Error('preview timed out'));},20000);
    const listen=event=>{if(event.source!==element.contentWindow||event.origin!=='maji-avatar://renderer')return;if(['loaded','error'].includes(event.data?.type)){clearTimeout(timer);window.removeEventListener('message',listen);element.remove();resolve(event.data);}};
    window.addEventListener('message',listen);document.body.appendChild(element);
   }),draft);assert.equal(result.type,'loaded',JSON.stringify(result));
  }
  const imageDraft=await prepare(imageFile,'image2d');
  await assert.rejects(main.evaluate(({draft,terms})=>window.maji.assistant.confirmImport(draft.token,'跳过预览',terms,true),{draft:imageDraft,terms}));
  await preview(imageDraft);
  await assert.rejects(main.evaluate(({draft,terms})=>window.maji.assistant.confirmImport(draft.token,'测试图片',{...terms,commercial:false},true),{draft:imageDraft,terms}));
  const imageSettings=await main.evaluate(({draft,terms})=>window.maji.assistant.confirmImport(draft.token,'测试图片',terms,true),{draft:imageDraft,terms});assert.equal(imageSettings.models.find(m=>m.id===imageSettings.modelId).kind,'image2d');
  await pet.getByRole('combobox',{name:'角色动作'}).selectOption('跳跃');
  await pet.screenshot({path:path.join(project,'test-results/native-assistant/import-image2d.png')});
  const puppetFile=path.join(source,'test.maji2d.json');await fs.writeFile(puppetFile,JSON.stringify({version:1,width:100,height:150,layers:[{id:'body',file:'test.png',role:'body',x:0,y:60,width:100,height:90},{id:'head',file:'test.png',role:'head',x:10,y:0,width:80,height:80}],expressions:[{name:'开心',files:{head:'test.png'}}]}));
  const puppetDraft=await prepare(puppetFile,'puppet2d');await preview(puppetDraft);await main.evaluate(({draft,terms})=>window.maji.assistant.confirmImport(draft.token,'测试分层',terms,true),{draft:puppetDraft,terms});
  await pet.getByRole('combobox',{name:'角色表情'}).selectOption('开心');await pet.getByRole('combobox',{name:'角色动作'}).selectOption('点头');
  const positions=Buffer.alloc(36);[-.5,0,0,.5,0,0,0,1,0].forEach((value,index)=>positions.writeFloatLE(value,index*4));
  const glbJSON=JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[.2,.7,.6,1],metallicFactor:0,roughnessFactor:1},doubleSided:true}],buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-.5,0,0],max:[.5,1,0]}]});
  const jsonBytes=Buffer.from(glbJSON.padEnd(Math.ceil(glbJSON.length/4)*4)),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(20+jsonBytes.length+8+36,8);header.writeUInt32LE(jsonBytes.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(36,0);binHeader.writeUInt32LE(0x004e4942,4);
  const glbFile=path.join(source,'test.glb');await fs.writeFile(glbFile,Buffer.concat([header,jsonBytes,binHeader,positions]));const glbDraft=await prepare(glbFile,'glb');await preview(glbDraft);
  await main.evaluate(({draft,terms})=>window.maji.assistant.confirmImport(draft.token,'测试GLB',terms,true),{draft:glbDraft,terms});
  await pet.locator('.pet-state').waitFor({state:'hidden'});
  const cancelled=await prepare(imageFile,'image2d');await main.evaluate(token=>window.maji.assistant.cancelImport(token),cancelled.token);
  await assert.rejects(main.evaluate(({draft,terms})=>window.maji.assistant.confirmImport(draft.token,'取消后禁止提交',terms,true),{draft:cancelled,terms}));
  console.log('Image2D, layered2D, GLB previews/commits, permission rejection and cancellation passed.');
  await main.evaluate(()=>window.maji.assistant.update({enabled:false}));
  const nextWindow=electron.waitForEvent('window');
  await main.evaluate(()=>window.maji.assistant.update({enabled:true}));
  const recreated=await nextWindow;await recreated.getByRole('button',{name:'和我聊聊'}).waitFor();
  assert.equal(await recreated.evaluate(()=>innerWidth),324,'recreated window starts collapsed');
  await main.evaluate(()=>window.maji.assistant.update({enabled:false}));
  console.log('Bundled VRM rendered; gestures, chat, isolation and window recreation passed.');
 }finally{if(electron)await electron.close();if(path.dirname(temporary)===os.tmpdir())await fs.rm(temporary,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
