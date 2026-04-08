export interface AutoTranslatorConfig {
  translationProvider: 'openai' | 'aws';
  openai: {
    apiKey?: string;
    model?: string;
    temperature?: number;
  };
  aws: {
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
  /** Field names that should never be translated (copied as-is from source locale). */
  doNotTranslateFields: string[];
  /**
   * Regex patterns (as strings) for field names that should not be translated.
   * Any field whose name matches at least one pattern is excluded.
   * Example: ['url', '^handle', 'Id$']
   */
  doNotTranslateFieldPatterns: string[];
}

const DEFAULT_DO_NOT_TRANSLATE_FIELDS: string[] = [
  'handle',
  'slug',
  'url',
  'href',
  'cartUrl',
  'videoId',
  'youtubeVideoId',
];

export default {
  default: {
    translationProvider: 'openai',
    openai: {
      apiKey: '',
      model: 'gpt-4o-mini',
      temperature: 0.1,
    },
    aws: {
      region: 'us-east-1',
      accessKeyId: '',
      secretAccessKey: '',
    },
    doNotTranslateFields: DEFAULT_DO_NOT_TRANSLATE_FIELDS,
    doNotTranslateFieldPatterns: [],
  } satisfies AutoTranslatorConfig,
  validator(config: AutoTranslatorConfig) {
    const provider = config.translationProvider;
    if (provider !== 'openai' && provider !== 'aws') {
      throw new Error(
        `[auto-translator] translationProvider must be "openai" or "aws", got "${provider}"`
      );
    }
  },
};
