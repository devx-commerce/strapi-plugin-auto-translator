import type { TranslationProvider } from './index';

interface AWSConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function createAWSProvider(config: AWSConfig): TranslationProvider {
  let TranslateClient: any;
  let TranslateTextCommand: any;
  try {
    const awsModule = require('@aws-sdk/client-translate');
    TranslateClient = awsModule.TranslateClient;
    TranslateTextCommand = awsModule.TranslateTextCommand;
  } catch (err: any) {
    if (err.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        'Auto Translator: Provider "aws" requires the "@aws-sdk/client-translate" package. ' +
        'Install it with: npm install @aws-sdk/client-translate'
      );
    }
    throw err;
  }

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
