import {app,BrowserWindow,dialog,ipcMain,screen} from 'electron';
import {join} from 'node:path';
import {AssistantStore} from './assets';
import {AssistantConversation} from './conversation';
import {installAvatarProtocol} from './protocol';
import type {AIService} from '../ai/service';
import type {AssistantSettings} from '../../../src/lib/assistant';

export class DesktopAssistant {
 private window:BrowserWindow|null=null;
 private main:BrowserWindow|null=null;
 private expanded=false;
 private settings:AssistantSettings|null=null;
 private pending=Promise.resolve();
 private pointer:ReturnType<typeof setInterval>|null=null;
 private savePosition:ReturnType<typeof setTimeout>|null=null;
 private disposed=false;
 readonly store=new AssistantStore(join(app.getPath('userData'),'assistant'));
 private conversation:AssistantConversation;
 constructor(ai:AIService){
  this.conversation=new AssistantConversation(async(history,signal)=>{const settings=await this.store.get();return ai.chatAssistant(history,settings.name,settings.personality,signal);});
  installAvatarProtocol(this.store);
  ipcMain.handle('maji:assistant',async(event,command:unknown,value:unknown)=>{
   if(event.senderFrame!==event.sender.mainFrame)throw Error('助手操作来源无效');
   const pet=this.window?.webContents===event.sender;
   if(!pet&&this.main?.webContents!==event.sender)throw Error('助手操作来源无效');
   if(typeof command!=='string')throw Error('助手操作无效');
   if(pet&&!['get','show','hide','chat','cancel','clear','history','expand','openSettings'].includes(command))throw Error('此窗口不能修改助手资源');
   if(command==='get')return this.store.get();
   if(command==='history')return this.conversation.history();
   if(command==='chat')return this.conversation.chat(value);
   if(command==='cancel'){this.conversation.cancel();return;}
   if(command==='clear'){this.conversation.clear();return;}
   if(command==='hide'){this.conversation.cancel();this.window?.hide();return;}
   if(command==='show'){if(!(await this.store.get()).enabled)throw Error('请先启用桌面助手');await this.show();return;}
   if(command==='expand'){if(typeof value!=='boolean')throw Error('窗口参数无效');this.expanded=value;this.applyBounds();return;}
   if(command==='openSettings'){this.main?.restore();this.main?.show();this.main?.focus();this.main?.webContents.send('maji:assistant:settings');return;}
   return this.serialize(async()=>{
    if(command==='update')await this.store.update(value);
    else if(command==='removeModel'){
     try{await this.store.removeModel(value);}
     catch(error){this.settings=await this.store.get();this.broadcast();throw error;}
    }
    else if(command==='cancelImport'){this.store.cancelImport(value);return;}
    else if(command==='prepareImport'){
     if(!['image2d','puppet2d','vrm','glb'].includes(String(value)))throw Error('请先选择导入类型');
     const extensions=value==='image2d'?['png','gif','webp']:value==='puppet2d'?['json']:[String(value)];
     const options={title:'选择要预览的2D/3D角色',properties:['openFile'] as ['openFile'],filters:[{name:'角色文件',extensions}]};
     const result=await dialog.showOpenDialog(this.main!,options);
     if(result.canceled||!result.filePaths[0])return null;
     return this.store.prepareImport(result.filePaths[0],value as import('../../../src/lib/assistant').AssistantModelKind);
    }else if(command==='confirmImport'){
     const input=value as {token:unknown;name:unknown;license:unknown;activate:unknown};if(!input)throw Error('导入参数无效');
     await this.store.confirmImport(input.token,input.name,input.license,input.activate);
    }else if(command==='setModelLicense'){
     const input=value as {id:unknown;license:unknown};if(!input)throw Error('授权参数无效');await this.store.setModelLicense(input.id,input.license);
    }else throw Error('未知助手操作');
    this.settings=await this.store.get();this.broadcast();
    if(this.settings.enabled)await this.show();else {this.conversation.cancel();this.destroyWindow();}
    return this.settings;
   });
  });
  app.on('before-quit',()=>this.dispose());
  screen.on('display-removed',()=>this.applyBounds());
  screen.on('display-metrics-changed',()=>this.applyBounds());
 }
 private serialize<T>(work:()=>Promise<T>):Promise<T>{const next=this.pending.then(work);this.pending=next.then(()=>{},()=>{});return next;}
 async attach(main:BrowserWindow){
  this.main=main;
  // Only our scriptless-asset renderer can acknowledge preview; there is no IPC method
  // that allows a settings page or imported asset to mark a draft as rendered.
  main.webContents.on('console-message',details=>{
   if(!['maji:avatar:preview:loaded','maji:avatar:preview:error'].includes(details.message))return;
   try{if(details.frame.parent!==main.webContents.mainFrame||!details.sourceId.startsWith('maji-avatar://renderer/'))return;
    this.store.previewResult(details.frame.url,details.message.endsWith(':loaded'));
   }catch{/* The preview frame can disappear during cancellation. */}
  });
  main.once('closed',()=>this.dispose());this.settings=await this.store.get();if(this.settings.enabled)await this.show();
 }
 private broadcast(){for(const win of [this.main,this.window])if(win&&!win.isDestroyed())win.webContents.send('maji:assistant:change',this.settings);}
 private area(){return screen.getDisplayMatching(this.window?.getBounds()??{x:0,y:0,width:1,height:1}).workArea;}
 private applyBounds(){
  const win=this.window,s=this.settings;if(!win||!s)return;
  const area=this.area(),current=win.getBounds();
  const width=Math.min(this.expanded?Math.max(680,s.size+390):s.size+24,area.width),height=Math.min(this.expanded?620:Math.round(s.size*1.25)+84,area.height);
  const x=Math.max(area.x,Math.min(current.x,area.x+area.width-width)),y=Math.max(area.y,Math.min(current.y,area.y+area.height-height));
  win.setBounds({x,y,width,height});win.setAlwaysOnTop(s.alwaysOnTop);
 }
 private async show(){
  if(this.disposed)return;
  this.settings=await this.store.get();
  if(this.disposed)return;
  if(this.window&&!this.window.isDestroyed()){this.applyBounds();this.window.show();this.broadcast();return;}
  const area=screen.getPrimaryDisplay().workArea,s=this.settings;
  const width=s.size+24,height=Math.round(s.size*1.25)+84;
  const win=new BrowserWindow({width,height,x:s.position?.x??area.x+area.width-width-24,y:s.position?.y??area.y+area.height-height-24,frame:false,transparent:true,backgroundColor:'#00000000',resizable:false,alwaysOnTop:s.alwaysOnTop,skipTaskbar:true,show:false,title:'码迹 · 桌面助手',webPreferences:{preload:join(__dirname,'../../preload/assistant.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,spellcheck:false}});
  this.window=win;this.applyBounds();
  win.once('ready-to-show',()=>{if(!this.disposed)win.showInactive();});
  win.on('move',()=>{
   if(this.savePosition)clearTimeout(this.savePosition);
   this.savePosition=setTimeout(()=>{if(win.isDestroyed())return;const {x,y}=win.getBounds();void this.serialize(async()=>{const value=await this.store.get();this.settings=await this.store.save({...value,position:{x,y}});}).catch(()=>{});},500);
  });
  win.once('closed',()=>{this.window=null;this.expanded=false;if(this.pointer)clearInterval(this.pointer);this.pointer=null;this.conversation.cancel();});
  this.pointer=setInterval(()=>{if(win.isDestroyed()||!win.isVisible()||!this.settings?.followMouse)return;const point=screen.getCursorScreenPoint(),bounds=win.getBounds();win.webContents.send('maji:assistant:pointer',{x:point.x-bounds.x,y:point.y-bounds.y});},50);
  try{await (process.env.MAJI_DEV_SERVER?win.loadURL(process.env.MAJI_DEV_SERVER+'/assistant.html'):win.loadFile(join(__dirname,'../../../../dist/assistant.html')));}
  catch(error){this.destroyWindow();throw error;}
 }
 private destroyWindow(){if(this.savePosition)clearTimeout(this.savePosition);this.savePosition=null;this.window?.destroy();this.window=null;this.expanded=false;}
 dispose(){if(this.disposed)return;this.disposed=true;this.store.clearDrafts();this.conversation.cancel();this.destroyWindow();if(this.pointer)clearInterval(this.pointer);this.pointer=null;}
}
