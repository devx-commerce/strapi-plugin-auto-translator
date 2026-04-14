/** Default field names that should not be translated (e.g. handles, slugs, URLs). */
const DEFAULT_DO_NOT_TRANSLATE_FIELDS = [
  'handle',
  'slug',
  'url',
  'href',
];

export default {
  default: {
    /** Translation provider to use: 'openai' | 'aws' */
    translationProvider: process.env.TRANSLATION_PROVIDER || 'openai',

    /** OpenAI provider configuration */
    openai: {
      /** OpenAI API key */
      apiKey: process.env.OPENAI_API_KEY || '',
      /** Model to use for translations (e.g. 'gpt-4o-mini', 'gpt-4o') */
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      /** Temperature for translation (lower = more consistent) */
      temperature: 0.1,
      /**
       * Custom system prompt for plain text translation.
       * Use {sourceLang} and {targetLang} as placeholders.
       * Leave empty to use the built-in default.
       */
      systemPromptText: '',
      /**
       * Custom system prompt for HTML translation.
       * Use {sourceLang} and {targetLang} as placeholders.
       * Leave empty to use the built-in default.
       */
      systemPromptHtml: '',
    },

    /** AWS Translate provider configuration */
    aws: {
      /** AWS region for the Translate service */
      region: process.env.AWS_REGION || 'us-east-1',
      /**
       * AWS access key ID. If not provided, the AWS SDK will use its
       * default credential chain (env vars, instance profile, ECS task role, etc.)
       */
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      /** AWS secret access key */
      secretAccessKey: process.env.AWS_ACCESS_SECRET || '',
    },

    /**
     * Field names that should never be translated.
     * Their values are copied as-is from the source locale.
     * Additionally, any field whose name contains "url" (case-insensitive) is auto-excluded.
     */
    doNotTranslateFields: DEFAULT_DO_NOT_TRANSLATE_FIELDS,

    /** Automatically publish the translated locale after saving */
    autoPublish: true,

    /**
     * Enable media snapshot/restore workaround for Strapi v5.
     * Strapi v5's update()/publish() may delete and recreate DB rows,
     * losing files_related_mph entries. This option preserves media
     * relations by snapshotting before and restoring after translation.
     */
    mediaSnapshotRestore: true,
  },

  validator(config: any) {
    if (config.translationProvider && !['openai', 'aws'].includes(config.translationProvider)) {
      throw new Error(
        `[auto-translator] Invalid translationProvider "${config.translationProvider}". ` +
        `Must be "openai" or "aws".`
      );
    }

    if (config.doNotTranslateFields && !Array.isArray(config.doNotTranslateFields)) {
      throw new Error(
        `[auto-translator] doNotTranslateFields must be an array of strings.`
      );
    }

    if (config.openai?.temperature !== undefined) {
      const temp = config.openai.temperature;
      if (typeof temp !== 'number' || temp < 0 || temp > 2) {
        throw new Error(
          `[auto-translator] openai.temperature must be a number between 0 and 2.`
        );
      }
    }
  },
};
