import { describe, expect, it, vi } from 'vitest';
import { AIService } from './service';
import type { AIContext } from './types';

const status = { baseUrl: 'https://provider.example/v1', model: 'demo', configured: true, keyPresent: true };
const context: AIContext = { selectedText: 'print(1)', scope: 'selection', language: 'python' };

describe('AI service orchestration', () => {
  it('accepts a final classroom answer beyond the old 6000-character limit',async()=>{
    const answer='# 总结\n'+'知识点\n'.repeat(10000);
    const store={getStatus:vi.fn(),getCredential:vi.fn().mockResolvedValue({settings:{baseUrl:status.baseUrl,model:status.model},key:'secret'}),save:vi.fn(),clearKey:vi.fn()};
    const summarizeClassroomFinal=vi.fn().mockResolvedValue(answer);
    const client={testConnection:vi.fn(),ask:vi.fn(),generateReview:vi.fn(),gradeReviewAnswer:vi.fn(),summarizeClassroomFinal};
    await expect(new AIService(store,client).summarizeClassroomFinal('课堂原文')).resolves.toBe(answer.trim());
    expect(summarizeClassroomFinal).toHaveBeenCalledTimes(1);
    expect(summarizeClassroomFinal.mock.calls[0][2]).not.toContain('最多6000字符');
  });
  it('reads every long classroom batch and combines the results without dropping the tail',async()=>{
    const store={getStatus:vi.fn(),getCredential:vi.fn().mockResolvedValue({settings:{baseUrl:status.baseUrl,model:status.model},key:'secret'}),save:vi.fn(),clearKey:vi.fn()};
    const summarizeClassroomFinal=vi.fn().mockResolvedValue('# 知识点\n- 完整整理');
    const client={testConnection:vi.fn(),ask:vi.fn(),generateReview:vi.fn(),gradeReviewAnswer:vi.fn(),summarizeClassroomFinal};
    const service=new AIService(store,client),text='开头知识点'+ '甲'.repeat(25000)+'末尾知识点';
    await expect(service.summarizeClassroomFinal(text)).resolves.toContain('完整整理');
    const inputs=summarizeClassroomFinal.mock.calls.map(c=>JSON.parse(String(c[3])))
      .filter(data=>data.stage==='课堂原文分批整理').map(data=>data.SOURCE_DATA);
    expect(inputs.join('')).toBe(text);
    expect(inputs.at(-1)).toContain('末尾知识点');
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

it('sends the complete selected file beyond the fourth batch and merges its analysis', async () => {
  const store = {
    getStatus: vi.fn(),
    getCredential: vi.fn().mockResolvedValue({ settings: { baseUrl: status.baseUrl, model: status.model }, key: 'secret' }),
    save: vi.fn(), clearKey: vi.fn(),
  };
  const summarizeClassroomFinal = vi.fn().mockResolvedValue('关联知识点和实现');
  const client = { testConnection: vi.fn(), ask: vi.fn(), generateReview: vi.fn(), gradeReviewAnswer: vi.fn(), summarizeClassroomFinal };
  async function* files() {
    for (let index = 0; index < 6; index++) {
      yield { fileId: 'file', path: 'src/Login.ts', offset: index * 4096, nextOffset: null, text: '代码 ' + index };
    }
  }
  await new AIService(store, client).summarizeClassroomFinal('课堂原文', {
    tree: 'src/Login.ts', treeIncomplete: false, files: files(),
  });
  const payloads = summarizeClassroomFinal.mock.calls.map(call => JSON.parse(String(call[3])));
  const batches=payloads.filter(payload=>payload.file);
  expect(batches.length).toBeLessThan(6);
  expect(batches.map(payload=>payload.file.code).join('')).toBe('代码 0代码 1代码 2代码 3代码 4代码 5');
  expect(payloads.at(-1).SOURCE_DATA).toContain('课堂原文');
  expect(payloads.at(-1).SOURCE_DATA).toContain('关联知识点和实现');
});

it('reuses completed batches after interruption and preserves each file analysis independently', async () => {
  const store={getStatus:vi.fn(),getCredential:vi.fn().mockResolvedValue({settings:{baseUrl:status.baseUrl,model:status.model},key:'secret'}),save:vi.fn(),clearKey:vi.fn()};
  const summarizeClassroomFinal=vi.fn().mockResolvedValue('文件实现证据');
  const client={testConnection:vi.fn(),ask:vi.fn(),generateReview:vi.fn(),gradeReviewAnswer:vi.fn(),summarizeClassroomFinal};
  const service=new AIService(store,client);
  const cache=new Map<string,string>();
  const controller=new AbortController();
  async function* files(){
    yield {fileId:'a',path:'src/A.ts',offset:0,nextOffset:null,text:'class A {}'.repeat(3000)};
    yield {fileId:'b',path:'src/B.ts',offset:0,nextOffset:null,text:'class B {}'};
  }
  let saved=0;
  await expect(service.summarizeClassroomFinal('课堂原文',{tree:'src/A.ts\nsrc/B.ts',treeIncomplete:false,files:files()},{
    signal:controller.signal,cached:async key=>cache.get(key)??null,
    save:async(key,text)=>{cache.set(key,text);if(++saved===2)controller.abort();},
  })).rejects.toThrow();
  const analysis=vi.fn();
  await service.summarizeClassroomFinal('课堂原文',{tree:'src/A.ts\nsrc/B.ts',treeIncomplete:false,files:files()},{
    cached:async key=>cache.get(key)??null,save:async(key,text)=>{cache.set(key,text);},fileAnalysis:analysis,
  });
  const batches=summarizeClassroomFinal.mock.calls.map(call=>JSON.parse(String(call[3]))).filter(data=>data.file);
  expect(batches.filter(data=>data.file.path==='src/A.ts'&&data.file.part===0)).toHaveLength(1);
  expect(batches.filter(data=>data.file.path==='src/A.ts').map(data=>data.file.code).join('')).toBe('class A {}'.repeat(3000));
  expect(analysis.mock.calls.map(call=>call[0])).toEqual(['src/A.ts','src/B.ts']);
});
