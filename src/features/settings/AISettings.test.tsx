import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AISettings } from './AISettings';

const status = { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', configured: false, keyPresent: false };
const api = {
  getSettings: vi.fn().mockResolvedValue(status),
  saveSettings: vi.fn().mockResolvedValue({ ...status, configured: true, keyPresent: true }),
  clearKey: vi.fn().mockResolvedValue(status),
  testConnection: vi.fn().mockResolvedValue(undefined),
  ask: vi.fn(),
};

afterEach(() => {
  Object.defineProperty(window, 'maji', { configurable: true, value: undefined });
  vi.clearAllMocks();
});

describe('AI provider preferences', () => {
  it('explains desktop-only support in browser preview', () => {
    render(<AISettings />);
    expect(screen.getByText(/仅桌面版可使用 AI/)).toBeInTheDocument();
  });

  it('keeps saved keys hidden and reports status without rendering secret data', async () => {
    Object.defineProperty(window, 'maji', { configurable: true, value: { ai: api } });
    api.getSettings.mockResolvedValueOnce({ ...status, configured: true, keyPresent: true, apiKey: 'secret-leaked' } as never);
    render(<AISettings />);
    await screen.findByText('AI 服务已配置');
    expect(screen.getByLabelText('API 密钥')).toHaveAttribute('type', 'password');
    expect(screen.queryByText('secret-leaked')).not.toBeInTheDocument();
  });

  it('saves settings and an explicitly entered key, then clears the field', async () => {
    Object.defineProperty(window, 'maji', { configurable: true, value: { ai: api } });
    render(<AISettings />);
    await screen.findByDisplayValue('deepseek-chat');
    await userEvent.clear(screen.getByLabelText('模型名称'));
    await userEvent.type(screen.getByLabelText('模型名称'), 'deepseek-reasoner');
    await userEvent.type(screen.getByLabelText('API 密钥'), 'sk-user-key');
    await userEvent.click(screen.getByRole('button', { name: '保存 AI 设置' }));
    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith(
      { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-reasoner' }, 'sk-user-key',
    ));
    expect(screen.getByLabelText('API 密钥')).toHaveValue('');
  });

  it('tests the current form without sending note content', async () => {
    Object.defineProperty(window, 'maji', { configurable: true, value: { ai: api } });
    render(<AISettings />);
    await screen.findByDisplayValue('deepseek-chat');
    await userEvent.type(screen.getByLabelText('API 密钥'), 'sk-test');
    await userEvent.click(screen.getByRole('button', { name: '测试连接' }));
    await waitFor(() => expect(api.testConnection).toHaveBeenCalledWith(
      { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' }, 'sk-test',
    ));
    expect(await screen.findByText('连接成功')).toBeInTheDocument();
  });

  it('clears the key only after the explicit clear action', async () => {
    Object.defineProperty(window, 'maji', { configurable: true, value: { ai: api } });
    api.getSettings.mockResolvedValueOnce({ ...status, configured: true, keyPresent: true });
    render(<AISettings />);
    await screen.findByDisplayValue('deepseek-chat');
    await userEvent.click(screen.getByRole('button', { name: '清除 AI 密钥' }));
    expect(api.clearKey).toHaveBeenCalledOnce();
  });
});
