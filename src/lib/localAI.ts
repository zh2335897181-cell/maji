import type {AIProviderSettings} from './ipc';
export interface LocalModel {name:string;size:number;capabilities:string[];remote:boolean;recommended?:boolean}
export interface Hardware {cpu:string;ramGB:number;freeGB:number;gpu:string;vramGB:number;diskFreeGB:number|null}
export interface ModelRecommendation {name:string;sizeGB:number;reason:string}
export interface LocalJob {state:'idle'|'running'|'done'|'error';kind:string;message:string;progress:number|null}
export interface LocalInspection {hardware:Hardware;installed:boolean;running:boolean;version:string;models:LocalModel[];recommendations:ModelRecommendation[];speechReady:boolean;message:string}
export interface LocalProbe {ok:boolean;model:string;latencyMs:number;jsonOK:boolean;text:string;message:string}
export interface LocalAIApi {
 inspect():Promise<LocalInspection>;start():Promise<void>;pull(model:string):Promise<void>;cancel():Promise<void>;job():Promise<LocalJob>;
 importGGUF():Promise<void>;importAPI():Promise<{settings:AIProviderSettings;apiKey?:string}|null>;probe(model:string):Promise<LocalProbe>;
 installSpeech():Promise<void>;importSpeech():Promise<void>;probeSpeech():Promise<string>;
}
export function recommendModels(h:Hardware):ModelRecommendation[]{
 if(h.ramGB<8)return [{name:'qwen2.5:0.5b',sizeGB:0.4,reason:'内存较少，仅建议短文本体验，复杂代码和结构化输出优先使用在线 API'}];
 if(h.ramGB<12)return [{name:'qwen2.5:1.5b',sizeGB:1,reason:'轻量中文模型，适合短摘要和解释，复杂任务能力有限'}];
 const result=[{name:'qwen3:4b-instruct-2507-q4_K_M',sizeGB:2.5,reason:h.vramGB>=4?'约 2.5GB 权重，4GB 显存下需给上下文留空间，适合中文纪要与学习辅助':'可通过 CPU 或混合推理运行，速度需要实测'}, {name:'qwen2.5:1.5b',sizeGB:1,reason:'低占用备用，适合边上课边转写；代码和复杂 JSON 需核对'}];
 if(h.vramGB>=8&&h.ramGB>=24)result.unshift({name:'qwen2.5:7b',sizeGB:4.7,reason:'较充足显存与内存可尝试 7B，复杂分析更合适，仍需实际生成自检'});
 return result;
}
export function localModelName(value:unknown):string{
 if(typeof value!=='string'||value.length>150||!/^([a-zA-Z0-9][a-zA-Z0-9._-]*\/)?[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(value)||/(?:^|[:/-])cloud(?:$|[:/-])/i.test(value))throw new Error('本地模型名称无效，不能使用云端模型');return value;
}
