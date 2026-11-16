import type {ModelLicense} from './assistantLicense';
export type AssistantModelKind='image2d'|'puppet2d'|'vrm'|'glb';
export interface AssistantModel {id:string;name:string;file:string;files?:string[];kind?:AssistantModelKind;builtin?:boolean;license?:ModelLicense;sha256?:string;importedAt?:string;licenseRecordedAt?:string;claims?:Record<string,unknown>}
export interface AssistantImportDraft {token:string;kind:AssistantModelKind;name:string;file:string;bytes:number;fileCount:number;sha256:string;warnings:string[];claims?:Record<string,unknown>;conflicts:string[]}
export interface Puppet2D {version:1;width:number;height:number;layers:{id:string;file:string;x:number;y:number;width:number;height:number;role:'body'|'head'|'eyes'|'mouth'|'decoration'}[];expressions:{name:string;files:Record<string,string>}[]}
export const BUILTIN_ASSISTANT:AssistantModel={id:'cosmic-bot',name:'小码 · 太空机器人',file:'cosmic-bot.vrm',kind:'vrm',builtin:true};
export interface AssistantSettings {
 enabled:boolean;name:string;personality:string;size:number;alwaysOnTop:boolean;followMouse:boolean;
 modelId:string|null;models:AssistantModel[];
 position?:{x:number;y:number};
}
export type AssistantPatch=Partial<Pick<AssistantSettings,'enabled'|'name'|'personality'|'size'|'alwaysOnTop'|'followMouse'|'modelId'>>;
export interface AssistantMessage {role:'user'|'assistant';content:string}
export interface AssistantApi {
 get():Promise<AssistantSettings>;update(patch:AssistantPatch):Promise<AssistantSettings>;
 prepareImport(kind:AssistantModelKind):Promise<AssistantImportDraft|null>;
 cancelImport(token:string):Promise<void>;
 confirmImport(token:string,name:string,license:unknown,activate:boolean):Promise<AssistantSettings>;
 setModelLicense(id:string,license:unknown):Promise<AssistantSettings>;
 removeModel(id:string):Promise<AssistantSettings>;
 show():Promise<void>;hide():Promise<void>;chat(text:string):Promise<AssistantMessage[]>;
 cancel():Promise<void>;clear():Promise<void>;history():Promise<AssistantMessage[]>;
 expand(open:boolean):Promise<void>;openSettings():Promise<void>;
 onChange?(listener:(settings:AssistantSettings)=>void):()=>void;
}
export const ASSISTANT_DEFAULTS:AssistantSettings={enabled:false,name:'小码',personality:'温柔耐心的编程学习伙伴，用简体中文提供清晰、实用的帮助。',size:300,alwaysOnTop:true,followMouse:true,modelId:BUILTIN_ASSISTANT.id,models:[BUILTIN_ASSISTANT]};
