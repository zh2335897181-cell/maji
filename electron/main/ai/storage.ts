import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { validateAPIKey, validateProviderSettings } from './validation';
import type { AIProviderSettings, AISettingsStatus } from './types';

interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

interface StoredConfig extends AIProviderSettings {
  version: 1;
  encryptedKey: string | null;
}

const DEFAULTS: AIProviderSettings = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
};

export class AIConfigStore {
  private readonly filePath: string;
  private readonly safeStorage: SafeStorageLike;

  constructor(options: { filePath: string; safeStorage: SafeStorageLike }) {
    this.filePath = options.filePath;
    this.safeStorage = options.safeStorage;
  }

  async getStatus(): Promise<AISettingsStatus> {
    const config = await this.readConfig();
    const keyPresent = config.encryptedKey !== null;
    return { baseUrl: config.baseUrl, model: config.model, keyPresent, configured: keyPresent };
  }

  async getCredential(): Promise<{ settings: AIProviderSettings; key: string } | null> {
    const config = await this.readConfig();
    if (!config.encryptedKey) return null;
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error('系统密钥保护当前不可用，请检查 Windows 用户帐户后重试');
    try {
      const key = validateAPIKey(this.safeStorage.decryptString(Buffer.from(config.encryptedKey, 'base64')));
      return { settings: { baseUrl: config.baseUrl, model: config.model }, key };
    } catch {
      throw new Error('无法解密已保存的 AI 密钥，请在偏好设置中重新配置');
    }
  }

  async save(settings: AIProviderSettings, apiKey?: string): Promise<AISettingsStatus> {
    const safeSettings = validateProviderSettings(settings);
    const previous = await this.readConfig();
    let encryptedKey = previous.encryptedKey;
    if (apiKey !== undefined) {
      const safeKey = validateAPIKey(apiKey);
      if (!this.safeStorage.isEncryptionAvailable()) {
        throw new Error('系统密钥保护不可用，未保存 API 密钥。请更新系统或检查用户帐户设置后重试');
      }
      try {
        encryptedKey = this.safeStorage.encryptString(safeKey).toString('base64');
      } catch {
        throw new Error('API 密钥加密失败，未保存任何设置');
      }
    }
    await this.writeConfig({ ...safeSettings, version: 1, encryptedKey });
    return this.getStatus();
  }

  async clearKey(): Promise<AISettingsStatus> {
    const previous = await this.readConfig();
    await this.writeConfig({ ...previous, encryptedKey: null });
    return this.getStatus();
  }

  private async readConfig(): Promise<StoredConfig> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (isMissingFile(error)) return { ...DEFAULTS, version: 1, encryptedKey: null };
      throw new Error('无法读取本机 AI 设置，请检查应用数据目录权限');
    }
    try {
      const value: unknown = JSON.parse(raw);
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error();
      const input = value as Record<string, unknown>;
      if (input.version !== 1 || (input.encryptedKey !== null && typeof input.encryptedKey !== 'string')) throw new Error();
      const settings = validateProviderSettings(input);
      return { ...settings, version: 1, encryptedKey: input.encryptedKey as string | null };
    } catch {
      throw new Error('本机 AI 设置文件无效；为保护密钥，应用不会覆盖或回退到明文存储');
    }
  }

  private async writeConfig(config: StoredConfig): Promise<void> {
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(temporaryPath, JSON.stringify(config), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporaryPath, this.filePath);
    } catch {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw new Error('无法安全保存 AI 设置，请检查应用数据目录权限');
    }
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
