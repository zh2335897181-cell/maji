import { describe, expect, it, vi } from 'vitest';
import type { MajiApi } from '../../src/lib/ipc';

const bridge = vi.hoisted(() => ({ expose: vi.fn(), invoke: vi.fn() }));
vi.mock('electron', () => ({ contextBridge: { exposeInMainWorld: bridge.expose }, ipcRenderer: { invoke: bridge.invoke, on: vi.fn(), send: vi.fn() } }));
import './index';
const api = bridge.expose.mock.calls[0][1] as MajiApi;

describe('preload IPC errors', () => {
  it.each(['ai:ask', 'mindmaps:generate'])('removes the Electron transport wrapper from %s', async (channel) => {
    bridge.invoke.mockRejectedValueOnce(new Error(`Error invoking remote method 'maji:${channel}': Error: AI 服务只返回了思考内容，没有最终答案`));
    await expect(api.ai.getSettings()).rejects.toThrow(/^AI 服务只返回了思考内容，没有最终答案$/);
  });
  it('preserves successful payloads and unwrapped error messages', async () => {
    const settings = { baseUrl: 'https://example.com', model: 'test', configured: true, keyPresent: true };
    bridge.invoke.mockResolvedValueOnce(settings);
    await expect(api.ai.getSettings()).resolves.toEqual(settings);
    bridge.invoke.mockRejectedValueOnce(new Error('网络不可用'));
    await expect(api.ai.getSettings()).rejects.toThrow(/^网络不可用$/);
  });
});
