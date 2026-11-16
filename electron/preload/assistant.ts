import {contextBridge,ipcRenderer} from 'electron';
import type {AssistantApi,AssistantSettings} from '../../src/lib/assistant';
const call=(command:string,value?:unknown)=>ipcRenderer.invoke('maji:assistant',command,value);
const api:Pick<AssistantApi,'get'|'show'|'hide'|'chat'|'cancel'|'clear'|'history'|'expand'|'openSettings'|'onChange'>&{onPointer(handler:(point:{x:number;y:number})=>void):()=>void}={
 get:()=>call('get'),show:()=>call('show'),hide:()=>call('hide'),chat:text=>call('chat',text),cancel:()=>call('cancel'),clear:()=>call('clear'),history:()=>call('history'),expand:open=>call('expand',open),openSettings:()=>call('openSettings'),
 onChange:handler=>{const listener=(_:unknown,value:AssistantSettings)=>handler(value);ipcRenderer.on('maji:assistant:change',listener);return()=>ipcRenderer.removeListener('maji:assistant:change',listener);},
 onPointer:handler=>{const listener=(_:unknown,value:{x:number;y:number})=>handler(value);ipcRenderer.on('maji:assistant:pointer',listener);return()=>ipcRenderer.removeListener('maji:assistant:pointer',listener);},
};
contextBridge.exposeInMainWorld('assistant',api);
