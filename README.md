# Auto Translator Plugin for Strapi

A custom Strapi v5 plugin that provides automated content translation using Google Translate API.

## 🚀 Current Status

**Version:** 0.1.0 (Mock Translation Mode)

Currently in **mock translation mode** - appends random characters to text fields for testing. Ready to switch to real Google Translate API when key is provided.

## ✨ Features

- **Automatic Locale Detection**: Dynamically fetches available locales from Strapi's i18n configuration
- **Deep Data Extraction**: Extracts ALL fields including nested structures with custom populate query builder
- **Complete Field Support**:
  - ✅ Simple text fields (string, text, email)
  - ✅ Rich text fields (with HTML preservation)
  - ✅ Dynamic zones with structure preservation
  - ✅ Components (single and repeatable)
  - ✅ Nested components (unlimited depth)
  - ✅ Media fields (automatically copied)
  - ✅ Relations (automatically copied)
  - ✅ All other field types (numbers, booleans, dates, etc.)
- **Google Translate Integration**: Ready for Google Translate API v2 (currently mocked)
- **Admin Panel Integration**: Adds a translate button directly in the content edit view
- **Smart Content Saving**: Creates or updates locale entries with all data preserved
- **Comprehensive Logging**: Detailed console logs for debugging and verification

## Installation

The plugin is already installed as a local plugin.

### Quick Start (Mock Mode - No API Key Needed)

1. Build and start Strapi:
   ```bash
   npm run build
   npm run develop
   ```

2. The plugin works immediately with mock translations (appends random characters)

### Enable Real Translation (Google Translate API)

1. Add your Google Translate API key to `.env`:
   ```
   GOOGLE_TRANSLATE_API_KEY=your_api_key_here
   ```

2. Uncomment Google Translate API code in `server/src/services/translator.ts`:
   - Lines 259-268 in `translateContent()`
   - Lines 389-403 in `translateText()`
   - Lines 449-462 in `translateRichText()`
   - Remove/comment mock translation logic

3. Rebuild and restart:
   ```bash
   npm run build
   npm run develop
   ```

## Usage

### In the Admin Panel

1. Navigate to any content entry that has i18n enabled (e.g., Article, Author, Category, About, Global)
2. Click on an existing entry to edit it
3. You'll see a "Translate" button in the top-right area of the edit view
4. Click the "Translate" button
5. Select the target locale from the dropdown
6. Click "Translate" again to start the translation
7. The page will reload automatically when translation is complete

### API Endpoints

The plugin exposes the following endpoints:

#### Get Available Locales
```
GET /api/auto-translator/locales
```

Response:
```json
{
  "data": [
    {
      "code": "en",
      "name": "English (en)",
      "isDefault": true
    },
    {
      "code": "de",
      "name": "German (de)",
      "isDefault": false
    }
  ]
}
```

#### Check if Content Type has i18n Enabled
```
GET /api/auto-translator/check-i18n?contentType=api::article.article
```

Response:
```json
{
  "data": {
    "contentType": "api::article.article",
    "i18nEnabled": true
  }
}
```

#### Get Translatable Content (for testing)
```
GET /api/auto-translator/translatable-content?contentType=api::article.article&entityId=1&locale=en
```

Response: A structured representation of all translatable fields

#### Translate Content
```
POST /api/auto-translator/translate
```

Body:
```json
{
  "data": {
    "contentType": "api::article.article",
    "entityId": 1,
    "sourceLocale": "en",
    "targetLocale": "de"
  }
}
```

Response:
```json
{
  "data": {
    "id": 2,
    "documentId": "abc123",
    "locale": "de",
    "title": "Translated title",
    // ... other translated fields
  },
  "message": "Translation completed successfully"
}
```

## How It Works

### Step 1: Content Extraction
The plugin analyzes the content type schema to identify fields marked as localizable (`pluginOptions.i18n.localized: true`). It then extracts the content from these fields, handling:
- Simple text fields
- Rich text with HTML
- Dynamic zones with multiple component types
- Nested and repeatable components

### Step 2: Translation
The extracted content is sent to Google Translate API. The plugin:
- Converts Strapi locale codes to Google Translate language codes (e.g., `en-US` → `en`)
- Preserves HTML formatting in rich text fields
- Handles translation errors gracefully

### Step 3: Content Reconstruction
The translated content is reconstructed into the exact structure required by Strapi:
- Maintains component relationships
- Preserves dynamic zone structure
- Copies non-translatable fields from the source entry

### Step 4: Saving
The plugin:
- Checks if a locale entry already exists for the target locale
- Creates a new entry or updates the existing one
- Links the new locale entry to the source document

## Configuration

### Plugin Configuration

You can configure the plugin in `config/plugins.ts`:

```typescript
export default {
  'auto-translator': {
    enabled: true,
    resolve: './src/plugins/auto-translator',
    config: {
      googleApiKey: process.env.GOOGLE_TRANSLATE_API_KEY,
      enabled: true,
    },
  },
};
```

### Environment Variables

- `GOOGLE_TRANSLATE_API_KEY`: Your Google Translate API key (required)

## Content Types Support

The plugin automatically works with any content type that has:
1. i18n plugin enabled (`pluginOptions.i18n.localized: true` at the content type level)
2. Individual fields marked as localizable

### Supported Field Types

**Translated:**
- ✅ String
- ✅ Text
- ✅ Rich text (HTML preserved)
- ✅ Email

**Preserved (Copied from Source):**
- ✅ Dynamic zones (structure and order maintained)
- ✅ Components (single and repeatable)
- ✅ Nested components (unlimited depth)
- ✅ Relations (automatically copied)
- ✅ Media (automatically copied)
- ✅ Numbers, Booleans, Dates, JSON (all preserved)

**Not Processed:**
- ⚠️ UID fields (auto-generated per locale by Strapi)

## Development

### File Structure

```
auto-translator/
├── admin/
│   └── src/
│       ├── components/
│       │   ├── InjectedTranslateButton.tsx
│       │   ├── Initializer.tsx
│       │   ├── PluginIcon.tsx
│       │   └── TranslateButton.tsx
│       ├── translations/
│       │   └── en.json
│       ├── utils/
│       │   └── getTrad.ts
│       ├── index.tsx
│       └── pluginId.ts
├── server/
│   └── src/
│       ├── config/
│       │   └── index.ts
│       ├── controllers/
│       │   ├── index.ts
│       │   └── translator.ts
│       ├── routes/
│       │   └── index.ts
│       ├── services/
│       │   ├── index.ts
│       │   └── translator.ts
│       ├── utils/
│       │   └── index.ts
│       ├── bootstrap.ts
│       ├── destroy.ts
│       ├── index.ts
│       └── register.ts
├── package.json
└── README.md
```

### Testing

1. **Test Locale Detection**:
   ```bash
   curl http://localhost:1337/api/auto-translator/locales
   ```

2. **Test i18n Check**:
   ```bash
   curl "http://localhost:1337/api/auto-translator/check-i18n?contentType=api::article.article"
   ```

3. **Test Content Extraction**:
   ```bash
   curl "http://localhost:1337/api/auto-translator/translatable-content?contentType=api::article.article&entityId=1&locale=en"
   ```

4. **Test Translation** (requires valid API key):
   ```bash
   curl -X POST http://localhost:1337/api/auto-translator/translate \
     -H "Content-Type: application/json" \
     -d '{
       "data": {
         "contentType": "api::article.article",
         "entityId": 1,
         "sourceLocale": "en",
         "targetLocale": "de"
       }
     }'
   ```

## Recent Improvements

### v0.1.0 - Major Updates

**✅ Fixed Dynamic Zone Issues:**
- Dynamic zones now properly extracted and saved
- All blocks maintain structure and order
- Media within dynamic zones preserved

**✅ Deep Population System:**
- Custom `buildDeepPopulate()` function for Strapi v5
- Recursively populates all nested components
- Handles unlimited nesting depth

**✅ Passthrough Field Type:**
- New field type for non-translatable data
- Preserves media, relations, numbers, booleans, etc.
- Automatic copying to translated locale

**✅ Comprehensive Logging:**
- Complete entity data logging
- Field-by-field processing logs
- Dynamic zone extraction details
- Debug-friendly console output

**See `PLUGIN_DEVELOPMENT.md` for detailed documentation.**

## Troubleshooting

### Dynamic Zones Not Appearing in Translated Entry

**Check console logs** - they show the complete data extraction process:
1. Populate query structure
2. Fetched entity data (should include `blocks` field)
3. Extracted translatable content

**Solution:** Ensure `npm run build` has been run after latest updates.

### Translation Button Not Appearing

- Verify the content type has i18n enabled
- Check that you're editing an existing entry (not creating a new one)
- Ensure the plugin is properly built and registered

### "Invalid key deep" Error

**Fixed in v0.1.0.** The plugin now uses a custom populate query builder instead of `populate: 'deep'`.

**Solution:** Run `npm run build` to rebuild with latest fixes.

### Translation Fails

- Check console logs for detailed error messages
- Verify your Google Translate API key is valid (if using real API)
- Review the Strapi server logs
- Ensure you have billing enabled on your Google Cloud account (for real API)

### Content Not Saving

- Check the Strapi logs for errors
- Verify the target locale exists in i18n configuration
- Ensure proper permissions are set
- Review console logs for extraction/saving details

## Documentation

- **`README.md`** (this file) - Quick reference and usage guide
- **`PLUGIN_DEVELOPMENT.md`** - Comprehensive development documentation including:
  - Architecture details
  - Implementation solutions
  - Code reference
  - Development timeline
  - Future improvements

## License

MIT
