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
  apiProfile?: AIProviderSettings & {encryptedKey:string|null};
  localProfile?: AIProviderSettings;
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
    return { baseUrl: config.baseUrl, model: config.model, ...(config.provider?{provider:config.provider}:{}), keyPresent:config.provider==='local'?false:keyPresent, configured:config.provider==='local'||keyPresent,
      ...(config.apiProfile?{savedApi:{baseUrl:config.apiProfile.baseUrl,model:config.apiProfile.model,provider:'api' as const}}:{}),...(config.localProfile?{savedLocal:config.localProfile}:{}) };
  }

  async getCredential(requested?:AIProviderSettings): Promise<{ settings: AIProviderSettings; key: string } | null> {
    const stored = await this.readConfig();
    const config=requested&&requested.provider!=='local'&&stored.provider==='local'&&stored.apiProfile?stored.apiProfile:stored;
    if(config.provider==='local')return {settings:{baseUrl:config.baseUrl,model:config.model,provider:'local'},key:'maji-local'};
    if (!config.encryptedKey) return null;
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error('系统密钥保护当前不可用，请检查 Windows 用户帐户后重试');
    try {
      const key = validateAPIKey(this.safeStorage.decryptString(Buffer.from(config.encryptedKey, 'base64')));
      return { settings: { baseUrl: config.baseUrl, model: config.model,...(config.provider?{provider:config.provider}:{}) }, key };
    } catch {
      throw new Error('无法解密已保存的 AI 密钥，请在偏好设置中重新配置');
    }
  }

  async save(settings: AIProviderSettings, apiKey?: string): Promise<AISettingsStatus> {
    const safeSettings = validateProviderSettings(settings);
    const previous = await this.readConfig();
    let apiProfile=previous.apiProfile,localProfile=previous.localProfile;
    if(previous.provider==='local')localProfile={baseUrl:previous.baseUrl,model:previous.model,provider:'local'};
    else if(safeSettings.provider==='local')apiProfile={baseUrl:previous.baseUrl,model:previous.model,provider:'api',encryptedKey:previous.encryptedKey};
    if(safeSettings.provider==='local'){
      await this.writeConfig({...safeSettings,version:1,encryptedKey:null,...(apiProfile?{apiProfile}:{}),localProfile:safeSettings});return this.getStatus();
    }
    let encryptedKey = previous.provider==='local'?apiProfile?.encryptedKey??null:previous.encryptedKey;
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
    await this.writeConfig({ ...safeSettings, version: 1, encryptedKey,...(apiProfile?{apiProfile:{...safeSettings,encryptedKey}}:{}),...(localProfile?{localProfile}:{}) });
    return this.getStatus();
  }

  async clearKey(): Promise<AISettingsStatus> {
    const previous = await this.readConfig();
    await this.writeConfig({ ...previous, encryptedKey: null,...(previous.apiProfile?{apiProfile:{...previous.apiProfile,encryptedKey:null}}:{}) });
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
      let apiProfile:StoredConfig['apiProfile'];
      if(input.apiProfile){const profile=input.apiProfile as Record<string,unknown>;if(profile.encryptedKey!==null&&typeof profile.encryptedKey!=='string')throw new Error();apiProfile={...validateProviderSettings(profile),encryptedKey:profile.encryptedKey as string|null};}
      const localProfile=input.localProfile?validateProviderSettings(input.localProfile):undefined;
      if(localProfile&&localProfile.provider!=='local')throw new Error();
      return { ...settings, version: 1, encryptedKey: input.encryptedKey as string | null,...(apiProfile?{apiProfile}:{}),...(localProfile?{localProfile}:{}) };
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
