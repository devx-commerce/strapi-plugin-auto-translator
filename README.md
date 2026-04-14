# @devx-commerce/strapi-plugin-auto-translator

Automated translation plugin for Strapi v5. Translates content across locales using **OpenAI** or **AWS Translate**.

## Features

- Translate any i18n-enabled content type (collection types and single types)
- Supports **OpenAI** (GPT-4o-mini, GPT-4o, etc.) and **AWS Translate** providers
- Admin panel button injected into the Content Manager edit view
- Translate to a single locale or all locales at once
- Configurable field exclusions (handles, slugs, URLs stay untranslated)
- Auto-publish after translation (configurable)
- Media snapshot/restore for Strapi v5 compatibility
- Handles nested components, dynamic zones, and Blocks editor content
- Content API routes for programmatic/batch translation

## Installation

```bash
# Install the plugin
npm install @devx-commerce/strapi-plugin-auto-translator

# Install your chosen translation provider SDK:
npm install openai                      # for OpenAI
# OR
npm install @aws-sdk/client-translate   # for AWS Translate
```

> **Note:** You need a `.npmrc` in your project root (or globally) with:
> ```
> @devx-commerce:registry=https://npm.pkg.github.com
> ```

## Configuration

### `config/plugins.ts`

```typescript
export default ({ env }) => ({
  'auto-translator': {
    enabled: true,
    config: {
      // Provider: 'openai' | 'aws'
      translationProvider: env('TRANSLATION_PROVIDER', 'openai'),

      // OpenAI settings (only needed if using OpenAI)
      openai: {
        apiKey: env('OPENAI_API_KEY'),
        model: env('OPENAI_MODEL', 'gpt-4o-mini'),
        temperature: 0.1,
        // Custom prompts (optional — use {sourceLang} and {targetLang} placeholders)
        // systemPromptText: 'Your custom text translation prompt...',
        // systemPromptHtml: 'Your custom HTML translation prompt...',
      },

      // AWS settings (only needed if using AWS Translate)
      aws: {
        region: env('AWS_REGION', 'us-east-1'),
        accessKeyId: env('AWS_ACCESS_KEY_ID'),
        secretAccessKey: env('AWS_ACCESS_SECRET'),
      },

      // Fields that should never be translated (copied as-is from source)
      // Any field containing "url" (case-insensitive) is also auto-excluded
      doNotTranslateFields: [
        'handle', 'slug', 'url', 'href',
        // Add your project-specific fields:
        // 'product_code', 'medusa_id', 'canonical_url',
      ],

      // Auto-publish translated content (default: true)
      autoPublish: true,

      // Strapi v5 media workaround — preserves media relations during
      // translation when Strapi recreates DB rows (default: true)
      mediaSnapshotRestore: true,
    },
  },
});
```

### `.env`

```bash
# Translation provider
TRANSLATION_PROVIDER=openai

# OpenAI (if using OpenAI provider)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# AWS (if using AWS Translate provider)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_ACCESS_SECRET=...
```

## Usage

### Admin Panel

1. Open any i18n-enabled content entry in the Content Manager
2. Click the **Translate** button in the top-right area
3. Select a target locale (or "All locales")
4. Wait for translation to complete — the page will auto-reload

### Content API (Programmatic)

```bash
# Get available locales
GET /api/auto-translator/locales

# Check if content type has i18n
GET /api/auto-translator/check-i18n?contentType=api::article.article

# Translate content
POST /api/auto-translator/translate
Content-Type: application/json

{
  "data": {
    "contentType": "api::article.article",
    "documentId": "abc123",
    "sourceLocale": "en",
    "targetLocale": "de"
  }
}
```

## Field Support

| Field type | Behaviour |
|------------|-----------|
| `string`, `text`, `email` | Translated (unless excluded) |
| `richtext` | Translated with HTML tags preserved |
| `blocks` | Translated (Strapi v5 Blocks editor — text nodes only) |
| `component` | Recursively translated |
| `dynamiczone` | Each component translated recursively |
| `media`, `relation` | Copied as-is from source locale |
| `boolean`, `integer`, `date`, etc. | Copied as-is |

## Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `translationProvider` | `'openai' \| 'aws'` | `'openai'` | Which translation service to use |
| `openai.apiKey` | `string` | `env.OPENAI_API_KEY` | OpenAI API key |
| `openai.model` | `string` | `'gpt-4o-mini'` | OpenAI model name |
| `openai.temperature` | `number` | `0.1` | Sampling temperature (0-2) |
| `openai.systemPromptText` | `string` | built-in | Custom prompt for text translation |
| `openai.systemPromptHtml` | `string` | built-in | Custom prompt for HTML translation |
| `aws.region` | `string` | `'us-east-1'` | AWS region |
| `aws.accessKeyId` | `string` | `env.AWS_ACCESS_KEY_ID` | AWS access key (optional if using IAM roles) |
| `aws.secretAccessKey` | `string` | `env.AWS_ACCESS_SECRET` | AWS secret key |
| `doNotTranslateFields` | `string[]` | `['handle','slug','url','href']` | Fields to skip translation |
| `autoPublish` | `boolean` | `true` | Auto-publish after translation |
| `mediaSnapshotRestore` | `boolean` | `true` | Enable media relation preservation |

## Releasing

```bash
# 1. Build
npm run build

# 2. Bump version + tag
npm version patch   # or minor / major
git push --follow-tags
```

GitHub Actions will automatically publish to GitHub Packages when a `v*` tag is pushed.

Consumer projects update with:
```bash
npm update @devx-commerce/strapi-plugin-auto-translator
```

## Requirements

- Strapi v5.0.0+
- Node.js 18-22
- i18n plugin enabled with at least 2 locales configured

## License

MIT
