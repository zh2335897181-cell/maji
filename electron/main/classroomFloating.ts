import {app,BrowserWindow,screen} from 'electron';
import {join} from 'node:path';

/** A second isolated renderer; closing it never stops the classroom. */
export class ClassroomFloatingWindow {
  private popup:BrowserWindow|null=null;
  private main:BrowserWindow|null=null;
  private quitting=false;
  constructor(private enabled:()=>boolean){app.on('before-quit',()=>{this.quitting=true;});}
  attach(main:BrowserWindow){
    this.main=main;
    main.on('minimize',()=>{if(this.enabled())this.show();});
    main.on('restore',()=>this.hide());
    main.on('show',()=>{if(!main.isMinimized())this.hide();});
    main.on('closed',()=>{this.popup?.destroy();this.popup=null;this.main=null;});
  }
  private show(){
    if(this.popup&&!this.popup.isDestroyed()){this.popup.showInactive();return;}
    const area=screen.getPrimaryDisplay().workArea;
    const width=Math.min(340,area.width),height=Math.min(300,area.height);
    const popup=new BrowserWindow({width,height,x:area.x+area.width-width-16,y:area.y+24,minWidth:220,minHeight:160,frame:false,resizable:true,movable:true,alwaysOnTop:true,skipTaskbar:true,show:false,title:'码迹 · 悬浮知识点',backgroundColor:'#101923',webPreferences:{preload:join(__dirname,'../preload/index.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,spellcheck:false}});
    this.popup=popup;
    popup.once('ready-to-show',()=>{if(this.main?.isMinimized()&&!this.quitting)popup.showInactive();});
    popup.on('close',event=>{if(!this.quitting){event.preventDefault();popup.hide();}});
    popup.on('closed',()=>{if(this.popup===popup)this.popup=null;});
    const loading=process.env.MAJI_DEV_SERVER?popup.loadURL(process.env.MAJI_DEV_SERVER+'/#/classroom-floating'):popup.loadFile(join(__dirname,'../../../dist/index.html'),{hash:'/classroom-floating'});
    void loading.catch(()=>{popup.destroy();if(this.popup===popup)this.popup=null;});
  }
  hide(){if(this.popup&&!this.popup.isDestroyed())this.popup.hide();}
  restore(){if(this.main&&!this.main.isDestroyed()){this.main.restore();this.main.show();this.main.focus();}this.hide();}
}
