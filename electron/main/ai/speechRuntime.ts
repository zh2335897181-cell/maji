import {app} from 'electron';
import {existsSync,readFileSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
export const SPEECH_MODEL='sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17';
export function speechRuntime(){return process.env.MAJI_SPEECH_RUNTIME??join(app.getPath('userData'),'speech-runtime');}
export function speechModel(){
 const config=join(speechRuntime(),'model-config.json');
 if(existsSync(config)){const value=JSON.parse(readFileSync(config,'utf8'));if(typeof value.directory!=='string'||!isAbsolute(value.directory))throw Error('本地转写模型配置无效');return value.directory;}
 return join(speechRuntime(),'models',SPEECH_MODEL);
}
