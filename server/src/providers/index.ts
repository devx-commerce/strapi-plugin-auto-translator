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

// Import provider factories directly so the bundler can inline them.
// The external SDK require() calls (openai, @aws-sdk/client-translate)
// stay inside each provider function and are resolved at runtime.
import { createOpenAIProvider } from './openai';
import { createAWSProvider } from './aws';

/**
 * Create a translation provider based on the plugin configuration.
 * The external SDK packages (openai, @aws-sdk/client-translate) are
 * loaded lazily inside each provider factory, so only the chosen
 * provider's dependency needs to be installed.
 */
export function createProvider(config: ProviderConfig): TranslationProvider {
  const provider = config.translationProvider || 'openai';

  switch (provider) {
    case 'aws':
      return createAWSProvider(config.aws);

    case 'openai':
      return createOpenAIProvider(config.openai);

    default:
      throw new Error(
        `Auto Translator: Unknown translation provider "${provider}". ` +
        `Supported providers: "openai", "aws".`
      );
  }
}
