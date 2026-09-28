import { describe, expect, it, vi } from 'vitest';
import { AIService } from './service';
import { createAIHandlers } from './ipc';
import { IPC } from '../../../src/lib/ipc';

describe('AI IPC handlers', () => {
  it('validates arguments before invoking service operations', async () => {
    const service = {
      getSettings: vi.fn().mockResolvedValue({ configured: false, keyPresent: false, baseUrl: '', model: '' }),
      saveSettings: vi.fn(), clearKey: vi.fn(), testConnection: vi.fn(), ask: vi.fn(),
    } as unknown as AIService;
    const handlers = createAIHandlers(service);
    await expect(handlers[IPC.aiAsk](['explain', { scope: 'selection', selectedText: '', language: 'python' }])).rejects.toThrow();
    await expect(handlers[IPC.aiSettingsSave]([{ baseUrl: 'http://example.com', model: 'demo' }])).rejects.toThrow();
    expect(service.ask).not.toHaveBeenCalled();
    expect(service.saveSettings).not.toHaveBeenCalled();
  });

  it('dispatches only validated settings, action, and context through the named handlers', async () => {
    const service = {
      getSettings: vi.fn(),
      saveSettings: vi.fn().mockResolvedValue({ configured: true, keyPresent: true, baseUrl: 'https://api.example', model: 'demo' }),
      clearKey: vi.fn().mockResolvedValue({ configured: false, keyPresent: false, baseUrl: '', model: '' }),
      testConnection: vi.fn(),
      ask: vi.fn().mockResolvedValue({ kind: 'text', text: 'answer' }),
    } as unknown as AIService;
    const handlers = createAIHandlers(service);
    await handlers[IPC.aiSettingsSave]([{ baseUrl: 'https://api.example/v1', model: 'demo' }, 'sk-secret']);
    await handlers[IPC.aiAsk](['explain', { scope: 'selection', selectedText: 'code', language: 'python' }]);
    expect(service.saveSettings).toHaveBeenCalledWith({ baseUrl: 'https://api.example/v1', model: 'demo' }, 'sk-secret');
    expect(service.ask).toHaveBeenCalledWith('explain', { scope: 'selection', selectedText: 'code', language: 'python' });
  });
});
