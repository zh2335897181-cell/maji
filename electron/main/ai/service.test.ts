import { describe, expect, it, vi } from 'vitest';
import { AIService } from './service';
import type { AIContext } from './types';

const status = { baseUrl: 'https://provider.example/v1', model: 'demo', configured: true, keyPresent: true };
const context: AIContext = { selectedText: 'print(1)', scope: 'selection', language: 'python' };

describe('AI service orchestration', () => {
  it('reads every long classroom batch and combines the results without dropping the tail',async()=>{
    const store={getStatus:vi.fn(),getCredential:vi.fn().mockResolvedValue({settings:{baseUrl:status.baseUrl,model:status.model},key:'secret'}),save:vi.fn(),clearKey:vi.fn()};
    const summarizeClassroomFinal=vi.fn().mockResolvedValue('# 知识点\n- 完整整理');
    const client={testConnection:vi.fn(),ask:vi.fn(),generateReview:vi.fn(),gradeReviewAnswer:vi.fn(),summarizeClassroomFinal};
    const service=new AIService(store,client),text='开头知识点'+ '甲'.repeat(25000)+'末尾知识点';
    await expect(service.summarizeClassroomFinal(text)).resolves.toContain('完整整理');
    expect(summarizeClassroomFinal).toHaveBeenCalledTimes(4);
    const inputs=summarizeClassroomFinal.mock.calls.map(c=>JSON.parse(String(c[3])).SOURCE_DATA);
    expect(inputs.slice(0,3).join('')).toBe(text);
    expect(inputs[2]).toContain('末尾知识点');
  });
  it('does not call the provider until an explicit action and sends validated context', async () => {
    const store = {
      getStatus: vi.fn().mockResolvedValue(status),
      getCredential: vi.fn().mockResolvedValue({ settings: { baseUrl: status.baseUrl, model: status.model }, key: 'secret' }),
      save: vi.fn(), clearKey: vi.fn(),
    };
    const client = { testConnection: vi.fn(), ask: vi.fn().mockResolvedValue({ kind: 'text', text: 'answer' }), generateReview: vi.fn(), gradeReviewAnswer: vi.fn() };
    const service = new AIService(store, client);
    await service.getSettings();
    expect(client.ask).not.toHaveBeenCalled();
    await expect(service.ask('explain', context)).resolves.toEqual({ kind: 'text', text: 'answer' });
    expect(client.ask).toHaveBeenCalledWith({ baseUrl: status.baseUrl, model: status.model }, 'secret', 'explain', context);
  });

  it('does not call the provider when no key is configured or context is invalid', async () => {
    const store = {
      getStatus: vi.fn().mockResolvedValue({ ...status, configured: false, keyPresent: false }),
      getCredential: vi.fn().mockResolvedValue(null), save: vi.fn(), clearKey: vi.fn(),
    };
    const client = { testConnection: vi.fn(), ask: vi.fn(), generateReview: vi.fn(), gradeReviewAnswer: vi.fn() };
    const service = new AIService(store, client);
    await expect(service.ask('explain', context)).rejects.toThrow('请先在偏好设置中配置 AI 服务');
    await expect(service.ask('explain', { ...context, selectedText: '' })).rejects.toThrow();
    expect(client.ask).not.toHaveBeenCalled();
  });

  it('tests connection with metadata endpoint through the client and delegates settings changes', async () => {
    const store = {
      getStatus: vi.fn().mockResolvedValue(status),
      getCredential: vi.fn().mockResolvedValue({ settings: { baseUrl: status.baseUrl, model: status.model }, key: 'secret' }),
      save: vi.fn().mockResolvedValue(status), clearKey: vi.fn().mockResolvedValue({ ...status, configured: false }),
    };
    const client = { testConnection: vi.fn().mockResolvedValue(undefined), ask: vi.fn(), generateReview: vi.fn(), gradeReviewAnswer: vi.fn() };
    const service = new AIService(store, client);
    await service.testConnection();
    expect(client.testConnection).toHaveBeenCalledWith({ baseUrl: status.baseUrl, model: status.model }, 'secret');
    await service.saveSettings({ baseUrl: status.baseUrl, model: status.model });
    expect(store.save).toHaveBeenCalled();
    await service.clearKey();
    expect(store.clearKey).toHaveBeenCalledOnce();
  });
});
