import { describe, expect, it, vi } from 'vitest';
import type { MajiApi } from '../../src/lib/ipc';

const bridge = vi.hoisted(() => ({ expose: vi.fn(), invoke: vi.fn() }));
vi.mock('electron', () => ({ contextBridge: { exposeInMainWorld: bridge.expose }, ipcRenderer: { invoke: bridge.invoke, on: vi.fn(), send: vi.fn() } }));
import './index';
const api = bridge.expose.mock.calls[0][1] as MajiApi;

describe('preload IPC errors', () => {
  it('waits for editor saves and aborts backup on a failed save', async () => {
    const unregister = api.app.onPrepareClose(async () => { throw new Error('未保存'); });
    const before = bridge.invoke.mock.calls.length;
    try { await expect(api.backup!.export()).rejects.toThrow('未保存'); }
    finally { unregister(); }
    expect(bridge.invoke.mock.calls.length).toBe(before);
    expect(document.body.inert).not.toBe(true);
  });
  it('saves before export and permits native dialog cancellation', async () => {
    const saved = vi.fn().mockResolvedValue(undefined);
    const unregister = api.app.onPrepareClose(saved);
    bridge.invoke.mockImplementationOnce(async channel => { expect(saved).toHaveBeenCalledOnce(); expect(channel).toBe('maji:backup:export'); return {saved:false}; });
    try { await expect(api.backup!.export()).resolves.toEqual({saved:false}); }
    finally { unregister(); }
  });
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
