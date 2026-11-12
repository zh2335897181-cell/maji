import { app } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import type { SpeechDevice, SpeechEngine } from '../../../src/lib/localAI';

export const SPEECH_MODEL = 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17';
export function speechRuntime() {
  const pointer=join(app.getPath('userData'),'speech-location.json');
  if(existsSync(pointer)){
    const value=JSON.parse(readFileSync(pointer,'utf8'));
    if(typeof value.directory!=='string'||!isAbsolute(value.directory))throw Error('语音存储目录配置无效');
    return value.directory;
  }
  return process.env.MAJI_SPEECH_RUNTIME ?? join(app.getPath('userData'), 'speech-runtime');
}

export function speechConfig() {
  const configPath = join(speechRuntime(), 'model-config.json');
  const value = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('本地转写模型配置无效');
  const engine: SpeechEngine = value.engine ?? 'sensevoice';
  const device: SpeechDevice = value.device ?? 'auto';
  if (!['sensevoice', 'qwen3-asr'].includes(engine) || !['auto', 'cpu', 'cuda'].includes(device)) {
    throw Error('本地转写模型配置无效');
  }
  const senseDirectory = value.senseDirectory ?? (engine === 'sensevoice' ? value.directory : undefined);
  if (senseDirectory !== undefined && (typeof senseDirectory !== 'string' || !isAbsolute(senseDirectory))) {
    throw Error('本地转写模型配置无效');
  }
  return { engine, device, senseDirectory: senseDirectory as string | undefined };
}

export function speechPython(engine: SpeechEngine = speechConfig().engine) {
  return join(speechRuntime(), engine === 'qwen3-asr' ? 'venv-qwen' : 'venv', 'Scripts', 'python.exe');
}

export function speechModel(engine: SpeechEngine = speechConfig().engine) {
  return engine === 'qwen3-asr'
    ? join(speechRuntime(), 'models', 'Qwen3-ASR-0.6B')
    : speechConfig().senseDirectory ?? join(speechRuntime(), 'models', SPEECH_MODEL);
}

export function speechReady(engine: SpeechEngine = speechConfig().engine) {
  const model = speechModel(engine);
  const files = engine === 'qwen3-asr'
    ? ['config.json', 'model.safetensors', '.maji-ready'] : ['model.int8.onnx', 'tokens.txt'];
  return existsSync(speechPython(engine)) && files.every(file => existsSync(join(model, file)));
}

let maintenance = false;
export function isSpeechMaintenance() { return maintenance; }
export function beginSpeechMaintenance() {
  if (maintenance) throw Error('语音模型任务正在运行，请稍后重试');
  maintenance = true;
  return () => { maintenance = false; };
}
