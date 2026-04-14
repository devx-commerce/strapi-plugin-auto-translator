import type { Core } from '@strapi/strapi';

const bootstrap = ({ strapi }: { strapi: Core.Strapi }) => {
  const config = strapi.config.get('plugin::auto-translator') as any;
  const provider = config?.translationProvider || 'openai';

  strapi.log.info(`Auto Translator plugin bootstrapped (provider: ${provider})`);

  // Validate that the chosen provider's SDK is available
  if (provider === 'openai') {
    try {
      require.resolve('openai');
    } catch {
      strapi.log.warn(
        'Auto Translator: Provider "openai" selected but "openai" package is not installed. ' +
        'Translation will fail at runtime. Install it with: npm install openai'
      );
    }

    if (!config?.openai?.apiKey) {
      strapi.log.warn(
        'Auto Translator: Provider "openai" selected but no API key configured. ' +
        'Set OPENAI_API_KEY in your .env file or configure openai.apiKey in plugins.ts'
      );
    }
  } else if (provider === 'aws') {
    try {
      require.resolve('@aws-sdk/client-translate');
    } catch {
      strapi.log.warn(
        'Auto Translator: Provider "aws" selected but "@aws-sdk/client-translate" package is not installed. ' +
        'Translation will fail at runtime. Install it with: npm install @aws-sdk/client-translate'
      );
    }
  }
};

export default bootstrap;
