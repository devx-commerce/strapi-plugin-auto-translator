# Auto Translator Plugin - Quick Start Guide

## Setup (5 minutes)

### 1. Add Google Translate API Key

Add your Google Translate API key to the `.env` file in the project root:

```bash
GOOGLE_TRANSLATE_API_KEY=your_actual_api_key_here
```

To get a Google Translate API key:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the "Cloud Translation API"
4. Create credentials (API Key)
5. Copy the API key

### 2. Build and Start Strapi

```bash
npm run build
npm run develop
```

The plugin is already registered and will be loaded automatically.

## Usage

### Translating Content via Admin Panel

1. **Open Strapi Admin**: Navigate to `http://localhost:1337/admin`

2. **Select a Content Type**: Go to any i18n-enabled content type:
   - Article
   - Author
   - Category
   - About
   - Global

3. **Edit an Entry**: Click on an existing entry (the button only appears on edit, not create)

4. **Click Translate Button**:
   - Look for the "Translate" button in the top-right area
   - Click it to see available target locales

5. **Select Target Locale**:
   - Choose which language to translate to
   - Only locales different from the current one will be shown

6. **Translate**:
   - Click the "Translate" button again
   - Wait for the translation to complete (you'll see a success notification)
   - The page will reload automatically with the new locale entry

### Testing the API Endpoints

#### 1. Check Available Locales
```bash
curl http://localhost:1337/api/auto-translator/locales
```

#### 2. Verify i18n is Enabled for a Content Type
```bash
curl "http://localhost:1337/api/auto-translator/check-i18n?contentType=api::article.article"
```

#### 3. Extract Translatable Content (Testing)
```bash
curl "http://localhost:1337/api/auto-translator/translatable-content?contentType=api::article.article&entityId=1&locale=en"
```

#### 4. Translate Content
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

## How It Works

### Automatic Detection
- The plugin automatically detects which content types have i18n enabled
- It only shows the translate button for content types with `pluginOptions.i18n.localized: true`
- Only fields marked as localizable will be translated

### Smart Field Handling
The plugin intelligently handles different field types:

✅ **Translated Fields:**
- String fields
- Text fields
- Rich text (preserves HTML formatting)
- Email fields
- Dynamic zones
- Components (single and repeatable)
- Nested components

❌ **Not Translated (Copied from Source):**
- Relations
- Media files
- UID fields
- Numeric fields
- Boolean fields

### Translation Process

1. **Extract**: Get all localizable content from the source entry
2. **Translate**: Send content to Google Translate API
3. **Reconstruct**: Rebuild the content structure
4. **Save**: Create or update the locale entry in Strapi

## Example Workflow

Let's translate an article from English to German:

### Step 1: Create English Article
1. Go to Content Manager > Article
2. Create new article with:
   - Title: "Hello World"
   - Description: "This is a test article"
   - Blocks: Add some rich text content

### Step 2: Translate
1. Edit the article you just created
2. Click "Translate" button
3. Select "German (de)"
4. Click "Translate"
5. Wait for success notification

### Step 3: View Translation
1. Page reloads automatically
2. Switch to German locale using the locale switcher
3. You'll see the translated content:
   - Title: "Hallo Welt"
   - Description: "Dies ist ein Testartikel"
   - All blocks translated

## Troubleshooting

### "Translate button not appearing"
- Make sure you're editing an **existing** entry (not creating new)
- Verify the content type has i18n enabled
- Check browser console for errors

### "Translation failed"
- Verify your Google Translate API key is correct in `.env`
- Check that billing is enabled on your Google Cloud project
- Review Strapi server logs for detailed error messages

### "API key not configured"
- Make sure `GOOGLE_TRANSLATE_API_KEY` is set in `.env`
- Restart Strapi after adding the key
- Verify the key has proper permissions in Google Cloud Console

## Next Steps

1. **Configure Additional Locales**: Go to Settings > Internationalization to add more locales
2. **Test with Different Content Types**: Try translating Author, Category, About, and Global content
3. **Review Translations**: Always review automated translations for accuracy
4. **Customize**: Modify the plugin code in `src/plugins/auto-translator` as needed

## Support

For issues or questions:
1. Check the detailed README.md in the plugin directory
2. Review Strapi logs: Look for "Auto Translator:" prefixed messages
3. Check browser console for client-side errors
4. Verify Google Translate API quota and billing

## Performance Tips

- Translation time depends on content length and API response time
- Large articles with many blocks may take 10-30 seconds
- The plugin handles rate limiting gracefully
- Consider translating during off-peak hours for large content sets
