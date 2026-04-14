/**
 * Generic translation provider interface.
 * Both AWS and OpenAI adapters implement this.
 */
export interface TranslationProvider {
  translateText: (text: string, sourceLang: string, targetLang: string) => Promise<string>;
  translateHtml: (html: string, sourceLang: string, targetLang: string) => Promise<string>;
}

export interface ProviderConfig {
  translationProvider: string;
  openai: {
    apiKey: string;
    model: string;
    temperature: number;
    systemPromptText: string;
    systemPromptHtml: string;
  };
  aws: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
}

/**
 * Create a translation provider based on the plugin configuration.
 * Lazily loads the SDK so only the chosen provider's dependency is required.
 */
export function createProvider(config: ProviderConfig): TranslationProvider {
  const provider = config.translationProvider || 'openai';

  switch (provider) {
    case 'aws': {
      try {
        const { createAWSProvider } = require('./aws');
        return createAWSProvider(config.aws);
      } catch (err: any) {
        if (err.code === 'MODULE_NOT_FOUND') {
          throw new Error(
            `Auto Translator: Provider "aws" requires the "@aws-sdk/client-translate" package. ` +
            `Install it with: npm install @aws-sdk/client-translate`
          );
        }
        throw err;
      }
    }

    case 'openai': {
      try {
        const { createOpenAIProvider } = require('./openai');
        return createOpenAIProvider(config.openai);
      } catch (err: any) {
        if (err.code === 'MODULE_NOT_FOUND') {
          throw new Error(
            `Auto Translator: Provider "openai" requires the "openai" package. ` +
            `Install it with: npm install openai`
          );
        }
        throw err;
      }
    }

    default:
      throw new Error(
        `Auto Translator: Unknown translation provider "${provider}". ` +
        `Supported providers: "openai", "aws".`
      );
  }
}
