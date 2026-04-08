# @devx/strapi-plugin-auto-translator

A private Strapi v5 plugin for automated content translation across locales.
Supports **OpenAI** (GPT-4o-mini) and **AWS Translate** as providers, configurable per project via `config/plugins.ts`.

---

## Requirements

- Strapi v5
- i18n plugin enabled
- Node.js 18–22

---

## Installation

The repo is private to the devx-commerce GitHub org. Anyone with org access can install it directly — no npm registry or PAT setup needed beyond your existing GitHub credentials.

```bash
yarn add "auto-translator-strapi-plugin@https://github.com/devx-commerce/auto-translator-strapi-plugin.git"
```

To pin a specific version:

```bash
yarn add "auto-translator-strapi-plugin@https://github.com/devx-commerce/auto-translator-strapi-plugin.git#v1.0.0"
```

### Local authentication

If you are already authenticated with GitHub on your machine (via macOS Keychain, GitHub CLI, or SSH key), `yarn install` works with no extra steps.

If not, configure git to use your GitHub credentials:

```bash
git config --global credential.helper osxkeychain   # Mac
gh auth login                                         # or via GitHub CLI
```

### CI/CD authentication

In GitHub Actions (or any CI environment), add a `GH_PAT` secret with a personal access token that has `repo` scope, then add this step before `yarn install`:

```yaml
- name: Authenticate git for private packages
  run: git config --global url."https://${{ secrets.GH_PAT }}@github.com/".insteadOf "https://github.com/"
```

---

## Configuration

Register the plugin in `config/plugins.ts`. No `resolve:` needed — it loads from `node_modules`.

```typescript
export default ({ env }) => ({
  "auto-translator": {
    enabled: true,
    config: {
      // 'openai' (default) or 'aws'
      translationProvider: env("TRANSLATION_PROVIDER", "openai"),

      openai: {
        // apiKey: leave unset → falls back to OPENAI_API_KEY env var
        model: "gpt-4o-mini",
        temperature: 0.1,
      },

      aws: {
        // region: leave unset → falls back to AWS_REGION env var
        // accessKeyId / secretAccessKey: leave unset → falls back to AWS_ACCESS_KEY_ID / AWS_ACCESS_SECRET env vars
      },

      // Field names never translated — copied as-is from source locale
      doNotTranslateFields: [
        "handle",
        "slug",
        "url",
        "href",
        "cartUrl",
        "videoId",
        "youtubeVideoId",
      ],

      // Regex patterns (strings) — any field name matching at least one is excluded
      doNotTranslateFieldPatterns: ["url"],
    },
  },
});
```

### Config reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `translationProvider` | `'openai' \| 'aws'` | `'openai'` | Which provider to use |
| `openai.apiKey` | `string` | `OPENAI_API_KEY` env var | OpenAI API key |
| `openai.model` | `string` | `'gpt-4o-mini'` | OpenAI model |
| `openai.temperature` | `number` | `0.1` | Sampling temperature |
| `aws.region` | `string` | `AWS_REGION` env var | AWS region |
| `aws.accessKeyId` | `string` | `AWS_ACCESS_KEY_ID` env var | AWS access key |
| `aws.secretAccessKey` | `string` | `AWS_ACCESS_SECRET` env var | AWS secret |
| `doNotTranslateFields` | `string[]` | See above | Exact field names to skip |
| `doNotTranslateFieldPatterns` | `string[]` | `[]` | Regex patterns for field names to skip |

### Environment variables

Sensitive values are best kept in `.env` and left unset in `config/plugins.ts`:

```bash
# Choose provider
TRANSLATION_PROVIDER=openai   # or 'aws'

# OpenAI
OPENAI_API_KEY=sk-...

# AWS Translate
AWS_ACCESS_KEY_ID=...
AWS_ACCESS_SECRET=...
AWS_REGION=us-east-1
```

---

## Usage

1. Open any content entry with i18n enabled in the Strapi admin
2. Click the **Translate** button in the top-right of the edit view
3. Select the target locale (or "All locales")
4. Click **Translate** — the page reloads when complete

---

## Field support

| Field type | Behaviour |
|------------|-----------|
| `string`, `text`, `email` | Translated (unless excluded) |
| `richtext` | Translated with HTML tags preserved |
| `blocks` | Translated (Strapi v5 Blocks editor — text nodes only) |
| `component` | Recursively translated |
| `dynamiczone` | Each component translated recursively |
| `media`, `relation` | Copied as-is from source locale |
| `boolean`, `integer`, `date`, etc. | Copied as-is |

Fields in `doNotTranslateFields` or matching `doNotTranslateFieldPatterns` are always copied from the source locale unchanged.

---

## Releasing a new version

```bash
# 1. Make changes in the source files
# 2. Build
yarn build

# 3. Bump version (patch / minor / major)
npm version patch

# 4. Commit dist + tag
git add dist/ package.json
git commit -m "release: v1.x.x"
git tag v1.x.x
git push --follow-tags
```

Consumer projects update by running:

```bash
yarn upgrade auto-translator-strapi-plugin
```

---

## API endpoints

All endpoints are prefixed with `/auto-translator`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/locales` | List available locales |
| `GET` | `/check-i18n?contentType=` | Check if a content type has i18n enabled |
| `POST` | `/translate` | Translate a document to a target locale |

### POST `/translate` body

```json
{
  "data": {
    "contentType": "api::article.article",
    "documentId": "abc123",
    "sourceLocale": "en",
    "targetLocale": "de",
    "isSingleType": false
  }
}
```

---

## License

MIT
