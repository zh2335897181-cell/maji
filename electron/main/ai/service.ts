import { AIClient } from './client';
import { validateAIAction, validateAIContext, validateAPIKey, validateProviderSettings } from './validation';
import type { AIConfigStore } from './storage';
import type { AIAction, AIContext, AIProviderSettings, AIResult, AISettingsStatus } from './types';

interface AIClientLike {
  testConnection(settings: AIProviderSettings, key: string): Promise<void>;
  ask(settings: AIProviderSettings, key: string, action: AIAction, context: AIContext): Promise<AIResult>;
}

export class AIService {
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

  private async requireCredential(): Promise<{ settings: AIProviderSettings; key: string }> {
    const credential = await this.store.getCredential();
    if (!credential) throw new Error('请先在偏好设置中配置 AI 服务');
    return credential;
  }
}
