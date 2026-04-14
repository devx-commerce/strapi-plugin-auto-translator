import type { TranslationProvider } from './index';

interface AWSConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function createAWSProvider(config: AWSConfig): TranslationProvider {
  const { TranslateClient, TranslateTextCommand } = require('@aws-sdk/client-translate');

  const clientOptions: any = {
    region: config.region || 'us-east-1',
  };

  // Only set explicit credentials if provided; otherwise let the AWS SDK
  // fall back to its default credential chain (env vars, instance profile, etc.)
  if (config.accessKeyId && config.secretAccessKey) {
    clientOptions.credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    };
  }

  const client = new TranslateClient(clientOptions);

  return {
    translateText: async (text, src, tgt) => {
      const cmd = new TranslateTextCommand({
        Text: text,
        SourceLanguageCode: src,
        TargetLanguageCode: tgt,
      });
      const res = await client.send(cmd);
      return res.TranslatedText;
    },
    translateHtml: async (html, src, tgt) => {
      const cmd = new TranslateTextCommand({
        Text: html,
        SourceLanguageCode: src,
        TargetLanguageCode: tgt,
        TextType: 'HTML',
      });
      const res = await client.send(cmd);
      return res.TranslatedText;
    },
  };
}
