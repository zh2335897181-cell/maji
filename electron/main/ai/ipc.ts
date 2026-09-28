import { IPC } from '../../../src/lib/ipc';
import type { AIService } from './service';
import { validateAIAction, validateAIContext, validateAPIKey, validateProviderSettings } from './validation';

type AIHandler = (args: unknown[]) => Promise<unknown>;

export function createAIHandlers(service: AIService): Record<string, AIHandler> {
  return {
    [IPC.aiSettingsGet]: async (args) => {
      requireArgCount(args, 0);
      return await service.getSettings();
    },
    [IPC.aiSettingsSave]: async (args) => {
      requireArgCount(args, 1, 2);
      const settings = validateProviderSettings(args[0]);
      const key = args[1] === undefined ? undefined : validateAPIKey(args[1]);
      return await service.saveSettings(settings, key);
    },
    [IPC.aiSettingsClearKey]: async (args) => {
      requireArgCount(args, 0);
      return await service.clearKey();
    },
    [IPC.aiTestConnection]: async (args) => {
      requireArgCount(args, 0, 2);
      const settings = args[0] === undefined ? undefined : validateProviderSettings(args[0]);
      const key = args[1] === undefined ? undefined : validateAPIKey(args[1]);
      return await service.testConnection(settings, key);
    },
    [IPC.aiAsk]: async (args) => {
      requireArgCount(args, 2);
      return await service.ask(validateAIAction(args[0]), validateAIContext(args[1]));
    },
  };
}

function requireArgCount(args: unknown[], minimum: number, maximum = minimum): void {
  if (args.length < minimum || args.length > maximum) throw new Error('AI 请求参数无效');
}
