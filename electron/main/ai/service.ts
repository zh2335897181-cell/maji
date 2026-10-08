import { AIClient } from './client';
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
  generateMindMap?(settings: AIProviderSettings, key: string, input: MindMapAIInput, signal?: AbortSignal): Promise<MindMapGraph>;
  testConnection(settings: AIProviderSettings, key: string): Promise<void>;
  ask(settings: AIProviderSettings, key: string, action: AIAction, context: AIContext): Promise<AIResult>;
  generateReview(settings: AIProviderSettings, key: string, input: ReviewGenerationInput): Promise<GeneratedReviewQuestion[]>;
  gradeReviewAnswer(settings: AIProviderSettings, key: string, input: ReviewGradingInput): Promise<ReviewGrade>;
}

export class AIService {
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
    const credential = await this.store.getCredential();
    const safeSettings = settings ? validateProviderSettings(settings) : credential?.settings;
    const safeKey = apiKey === undefined ? credential?.key : validateAPIKey(apiKey);
    if (!safeSettings || !safeKey) throw new Error('请先填写 AI 服务地址、模型和 API 密钥');
    await this.client.testConnection(safeSettings, safeKey);
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
