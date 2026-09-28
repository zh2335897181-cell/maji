import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { AIProviderSettings, AISettingsStatus } from '../../lib/ipc';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Fields';
import styles from './AISettings.module.css';

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

  useEffect(() => {
    if (!api) return;
    let active = true;
    void api.getSettings().then((value) => {
      if (!active) return;
      setStatus(value);
      setSettings({ baseUrl: value.baseUrl || DEFAULT_SETTINGS.baseUrl, model: value.model || DEFAULT_SETTINGS.model });
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
        支持 OpenAI 兼容接口，可配置 DeepSeek 等服务。请求只会在你点击 AI 操作后发送；默认仅发送选中内容，选择整篇笔记时会再次明确提示。密钥使用系统安全存储保存在本机。
      </p>
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
      <TextField
        label="API 密钥"
        type="password"
        value={apiKey}
        onChange={(event) => setApiKey(event.target.value)}
        placeholder={status?.keyPresent ? '已保存密钥；留空则保持不变' : '输入服务商提供的 API 密钥'}
        autoComplete="new-password"
        spellCheck={false}
      />
      <div className={styles.actions}>
        <Button variant="secondary" loading={loading} onClick={() => void test()}>测试连接</Button>
        <Button variant="primary" loading={loading} onClick={() => void save()}>保存 AI 设置</Button>
        {status?.keyPresent ? <Button variant="ghost" loading={loading} onClick={() => void clearKey()}>清除 AI 密钥</Button> : null}
      </div>
      {connectionMessage ? <p className={styles.success} role="status">{connectionMessage}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
