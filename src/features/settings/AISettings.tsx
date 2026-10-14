import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { AIProviderSettings, AISettingsStatus } from '../../lib/ipc';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Fields';
import styles from './AISettings.module.css';
import {LocalModels} from './LocalModels';

export interface AISettingsProps {
  onNotice?(message: string, tone: 'success' | 'error' | 'info'): void;
}

const DEFAULT_SETTINGS: AIProviderSettings = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
};

export function AISettings({ onNotice }: AISettingsProps): ReactElement {
  const api = window.maji?.ai;
  const [status, setStatus] = useState<AISettingsStatus | null>(null);
  const [settings, setSettings] = useState<AIProviderSettings>(DEFAULT_SETTINGS);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [tab,setTab]=useState<'api'|'local'|'speech'>('api');

  useEffect(() => {
    if (!api) return;
    let active = true;
    void api.getSettings().then((value) => {
      if (!active) return;
      setStatus(value);
      setSettings({ baseUrl: value.baseUrl || DEFAULT_SETTINGS.baseUrl, model: value.model || DEFAULT_SETTINGS.model,...(value.provider?{provider:value.provider}:{}) });
      setTab(value.provider==='local'?'local':'api');
    }).catch((reason: unknown) => {
      if (active) setError(errorMessage(reason, '读取 AI 设置失败'));
    });
    return () => { active = false; };
  }, [api]);

  const save = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    setError('');
    setConnectionMessage('');
    try {
      const value = await api.saveSettings(settings, apiKey.trim() ? apiKey : undefined);
      setStatus(value);
      setApiKey('');
      onNotice?.('AI 服务设置已保存在本机', 'success');
    } catch (reason) {
      setError(errorMessage(reason, '保存 AI 设置失败'));
    } finally {
      setLoading(false);
    }
  }, [api, apiKey, onNotice, settings]);

  const test = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    setError('');
    setConnectionMessage('');
    try {
      await api.testConnection(settings, apiKey.trim() ? apiKey : undefined);
      setConnectionMessage('连接成功');
    } catch (reason) {
      setError(errorMessage(reason, '连接失败'));
    } finally {
      setLoading(false);
    }
  }, [api, apiKey, settings]);

  const clearKey = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    setError('');
    try {
      const value = await api.clearKey();
      setStatus(value);
      setApiKey('');
      setConnectionMessage('');
      onNotice?.('已清除本机保存的 AI 密钥', 'success');
    } catch (reason) {
      setError(errorMessage(reason, '清除 AI 密钥失败'));
    } finally {
      setLoading(false);
    }
  }, [api, onNotice]);

  if (!api) {
    return (
      <section className={styles.section} aria-label="AI 服务">
        <h3>AI 服务</h3>
        <p className={styles.muted}>仅桌面版可使用 AI。浏览器预览不会连接模型服务，也不会发送笔记内容。</p>
      </section>
    );
  }

  return (
    <section className={styles.section} aria-label="AI 服务">
      <div className={styles.heading}>
        <h3>AI 服务</h3>
        <span className={status?.configured ? styles.ready : styles.unconfigured} role="status">
          {status?.configured ? 'AI 服务已配置' : '尚未配置'}
        </span>
      </div>
      <p className={styles.muted}>
        笔记解释、续写、复习出题与评阅、思维导图、编程题分析和课堂纪要共用保存后的文字模型。可使用在线 OpenAI 兼容 API 或本机模型。在线请求发送到服务商，本地模式仅允许回环地址，不会失败后自动切换到云端。课堂开启自动纪要后会按分段触发请求。密钥加密保存在本机。
      </p>
      <div className={styles.actions} role="tablist" aria-label="AI 配置类型">{(['api','local','speech'] as const).map(key=><button key={key} role="tab" aria-selected={tab===key} onClick={()=>{setTab(key);setConnectionMessage('');if(key==='local')setSettings(status?.savedLocal??{provider:'local',baseUrl:'http://127.0.0.1:11434/v1',model:'qwen3.5:4b'});if(key==='api')setSettings(status?.savedApi??(status?.provider!=='local'?{baseUrl:status?.baseUrl||DEFAULT_SETTINGS.baseUrl,model:status?.model||DEFAULT_SETTINGS.model}:DEFAULT_SETTINGS));}}>{key==='api'?'在线 API':key==='local'?'本地文字模型':'语音转写'}</button>)}</div>
      {tab==='speech'?<LocalModels speech onSelect={()=>{}}/>:<>
      {tab==='local'&&<LocalModels onSelect={model=>{setSettings({provider:'local',baseUrl:'http://127.0.0.1:11434/v1',model});setConnectionMessage('已选择模型，请测试并保存 AI 设置后应用到所有文字 AI 功能。');}}/>}
      {tab==='api'&&api.local&&<Button variant="secondary" disabled={loading} onClick={()=>{setLoading(true);setError('');void api.local!.importAPI().then(result=>{if(result){setSettings(result.settings);setApiKey(result.apiKey??'');setConnectionMessage('配置已导入表单，尚未保存。请确认地址和模型后保存。');}}).catch(e=>setError(errorMessage(e,'导入失败'))).finally(()=>setLoading(false));}}>导入 API 配置 JSON</Button>}
      <TextField
        label="接口地址"
        value={settings.baseUrl}
        onChange={(event) => setSettings((value) => ({ ...value, baseUrl: event.target.value }))}
        placeholder="https://api.deepseek.com/v1"
        autoComplete="url"
      />
      <TextField
        label="模型名称"
        value={settings.model}
        onChange={(event) => setSettings((value) => ({ ...value, model: event.target.value }))}
        placeholder="deepseek-chat"
        autoComplete="off"
      />
      {tab==='api'&&<TextField
        label="API 密钥"
        type="password"
        value={apiKey}
        onChange={(event) => setApiKey(event.target.value)}
        placeholder={status?.keyPresent ? '已保存密钥；留空则保持不变' : '输入服务商提供的 API 密钥'}
        autoComplete="new-password"
        spellCheck={false}
      />}
      {tab==='local'&&<p className={styles.muted}>本地 OpenAI 兼容地址也支持 LM Studio 等服务，无需 API 密钥。小模型可用于所有入口，但复杂 JSON、长代码和事实准确性需核对；本地请求可能比在线服务慢。</p>}
      <div className={styles.actions}>
        <Button variant="secondary" loading={loading} onClick={() => void test()}>测试连接</Button>
        <Button variant="primary" loading={loading} onClick={() => void save()}>保存 AI 设置</Button>
        {tab==='api'&&status?.keyPresent ? <Button variant="ghost" loading={loading} onClick={() => void clearKey()}>清除 AI 密钥</Button> : null}
      </div>
      </>}
      {connectionMessage ? <p className={styles.success} role="status">{connectionMessage}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
