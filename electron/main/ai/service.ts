import { AIClient } from './client';
import { CLASSROOM_SYSTEM_PROMPT } from '../../../src/lib/classroom';
import { validateExamAIRequest, type ExamAIRequest, type ExamAnalysis, type ExamTraining } from '../../../src/lib/exams';
import type { MindMapAIInput } from './client';
import type { MindMapGraph } from '../../../src/lib/mindmap';
import { validateAIAction, validateAIContext, validateAPIKey, validateProviderSettings } from './validation';
import { validateReviewGenerationInput, validateReviewGradingInput } from '../ipc/validate';
import type { AIConfigStore } from './storage';
import type {
  AIAction,
  AIContext,
  AIProviderSettings,
  AIResult,
  AISettingsStatus,
  GeneratedReviewQuestion,
  ReviewGenerationInput,
  ReviewGrade,
  ReviewGradingInput,
} from './types';

interface AIClientLike {
  summarizeClassroom?(settings:AIProviderSettings,key:string,system:string,text:string):Promise<string>;
  analyzeExam?(settings: AIProviderSettings, key: string, input: ExamAIRequest): Promise<ExamAnalysis | ExamTraining[]>;
  generateMindMap?(settings: AIProviderSettings, key: string, input: MindMapAIInput, signal?: AbortSignal): Promise<MindMapGraph>;
  testConnection(settings: AIProviderSettings, key: string): Promise<void>;
  ask(settings: AIProviderSettings, key: string, action: AIAction, context: AIContext): Promise<AIResult>;
  generateReview(settings: AIProviderSettings, key: string, input: ReviewGenerationInput): Promise<GeneratedReviewQuestion[]>;
  gradeReviewAnswer(settings: AIProviderSettings, key: string, input: ReviewGradingInput): Promise<ReviewGrade>;
}

export class AIService {
  async summarizeClassroom(text:string,previous:string):Promise<string> {
    if(typeof text!=='string'||text.length>20000)throw new Error('课堂转写过长');
    const credential=await this.requireCredential();
    if(!this.client.summarizeClassroom)throw new Error('课堂 AI 不可用');
    const result=await this.client.summarizeClassroom(credential.settings,credential.key,CLASSROOM_SYSTEM_PROMPT,JSON.stringify({previous:previous.slice(-1000),transcript:text}));
    if(!result||result.length>1500)throw new Error('课堂摘要为空或过长，请重试');
    return result;
  }
  async analyzeExam(value: unknown): Promise<ExamAnalysis | ExamTraining[]> {
    const input=validateExamAIRequest(value), credential=await this.requireCredential();
    if(!this.client.analyzeExam)throw new Error('考试 AI 服务不可用，请重启新版应用');
    return this.client.analyzeExam(credential.settings,credential.key,input);
  }
  async generateMindMap(input: MindMapAIInput, signal?: AbortSignal): Promise<MindMapGraph> {
    const credential = await this.requireCredential();
    if (!this.client.generateMindMap) throw new Error('AI 导图服务不可用');
    return this.client.generateMindMap(credential.settings, credential.key, input, signal);
  }
  private readonly store: Pick<AIConfigStore, 'getStatus' | 'getCredential' | 'save' | 'clearKey'>;
  private readonly client: AIClientLike;

  constructor(
    store: Pick<AIConfigStore, 'getStatus' | 'getCredential' | 'save' | 'clearKey'>,
    client: AIClientLike = new AIClient(),
  ) {
    this.store = store;
    this.client = client;
  }

  getSettings(): Promise<AISettingsStatus> {
    return this.store.getStatus();
  }

  saveSettings(settings: AIProviderSettings, apiKey?: string): Promise<AISettingsStatus> {
    return this.store.save(validateProviderSettings(settings), apiKey);
  }

  clearKey(): Promise<AISettingsStatus> {
    return this.store.clearKey();
  }

  async testConnection(settings?: AIProviderSettings, apiKey?: string): Promise<void> {
    const credential = await this.store.getCredential(settings);
    const safeSettings = settings ? validateProviderSettings(settings) : credential?.settings;
    const safeKey = safeSettings?.provider==='local'?'maji-local':apiKey === undefined ? credential?.key : validateAPIKey(apiKey);
    if (!safeSettings || !safeKey) throw new Error('请先填写 AI 服务地址、模型和 API 密钥');
    await this.client.testConnection(safeSettings, safeKey);
    if(safeSettings.provider==='local')await this.client.ask(safeSettings,safeKey,'explain',{scope:'selection',selectedText:'仅回复“本地模型连接正常”。',language:'text'});
  }

  async ask(action: AIAction, context: AIContext): Promise<AIResult> {
    const safeAction = validateAIAction(action);
    const safeContext = validateAIContext(context);
    const credential = await this.requireCredential();
    return this.client.ask(credential.settings, credential.key, safeAction, safeContext);
  }

  async generateReview(input: ReviewGenerationInput): Promise<GeneratedReviewQuestion[]> {
    const safeInput = validateReviewGenerationInput(input);
    const credential = await this.requireCredential();
    return this.client.generateReview(credential.settings, credential.key, safeInput);
  }

  async gradeReviewAnswer(input: ReviewGradingInput): Promise<ReviewGrade> {
    const safeInput = validateReviewGradingInput(input);
    const credential = await this.requireCredential();
    return this.client.gradeReviewAnswer(credential.settings, credential.key, safeInput);
  }

  private async requireCredential(): Promise<{ settings: AIProviderSettings; key: string }> {
    const credential = await this.store.getCredential();
    if (!credential) throw new Error('请先在偏好设置中配置 AI 服务');
    return credential;
  }
}
