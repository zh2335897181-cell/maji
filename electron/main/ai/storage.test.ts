import { mkdtemp, readFile, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AIConfigStore } from './storage';

describe('AI config storage', () => {
  let directory: string;
  let filePath: string;
  let available: boolean;
  let store: AIConfigStore;
  const fakeSafeStorage = {
    isEncryptionAvailable: () => available,
    encryptString: (value: string) => Buffer.from(`cipher:${value}`),
    decryptString: (value: Buffer) => value.toString().replace(/^cipher:/, ''),
  };

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'maji-ai-'));
    filePath = path.join(directory, 'ai-settings.json');
    available = true;
    store = new AIConfigStore({ filePath, safeStorage: fakeSafeStorage });
  });

  afterEach(async () => rm(directory, { recursive: true, force: true }));

  it('stores only ciphertext and never returns the secret in status', async () => {
    await store.save({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' }, 'sk-secret');
    const persisted = await readFile(filePath, 'utf8');
    expect(persisted).not.toContain('sk-secret');
    expect(JSON.parse(persisted).encryptedKey).toBe(Buffer.from('cipher:sk-secret').toString('base64'));
    await expect(store.getStatus()).resolves.toEqual({
      baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', configured: true, keyPresent: true,
    });
  });

  it('preserves an existing key when settings are saved without a replacement key', async () => {
    await store.save({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' }, 'sk-original');
    await store.save({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-reasoner' });
    await expect(store.getCredential()).resolves.toMatchObject({ key: 'sk-original' });
  });

  it('replaces and clears the encrypted key explicitly', async () => {
    await store.save({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' }, 'sk-old');
    await store.save({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' }, 'sk-new');
    await expect(store.getCredential()).resolves.toMatchObject({ key: 'sk-new' });
    await store.clearKey();
    await expect(store.getStatus()).resolves.toMatchObject({ keyPresent: false, configured: false });
  });

  it('fails closed when encryption is unavailable or fails', async () => {
    available = false;
    await expect(store.save({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' }, 'sk-secret')).rejects.toThrow();
    available = true;
    const broken = new AIConfigStore({
      filePath,
      safeStorage: { ...fakeSafeStorage, encryptString: () => { throw new Error('sk-secret'); } },
    });
    await expect(broken.save({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' }, 'sk-secret')).rejects.not.toThrow('sk-secret');
    await expect(readFile(filePath)).rejects.toThrow();
  });

  it('does not reveal secrets from malformed config', async () => {
    await import('node:fs/promises').then(({ writeFile }) => writeFile(filePath, '{bad json sk-secret'));
    await expect(store.getStatus()).rejects.not.toThrow('sk-secret');
  });

  it('rejects a decrypted credential that fails API key validation', async () => {
    const malformedStorage = {
      ...fakeSafeStorage,
      decryptString: () => 'sk-test\r\nInjected: true',
    };
    const malformedStore = new AIConfigStore({ filePath, safeStorage: malformedStorage });
    await malformedStore.save({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' }, 'sk-valid');
    await expect(malformedStore.getCredential()).rejects.toThrow('无法解密已保存的 AI 密钥');
  });
});
