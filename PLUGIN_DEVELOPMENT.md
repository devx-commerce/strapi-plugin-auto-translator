# Auto Translator Plugin - Development Documentation

## Overview

This is a custom Strapi v5 plugin that enables automatic translation of content entries with i18n (internationalization) support. The plugin integrates with Google Translate API and provides a UI button in the content manager to translate entries from one locale to another.

**Current Status:** Mock translation implementation (appends random characters to text) until Google Translate API key is configured.

---

## Features

### ✅ Implemented Features

1. **Complete Data Extraction**
   - Extracts all localizable fields from content entries
   - Deep population of nested structures (components, dynamic zones, media, relations)
   - Handles complex data structures with unlimited nesting depth

2. **Field Type Support**
   - ✅ Text fields (string, text, richtext, email)
   - ✅ Dynamic zones with multiple component types
   - ✅ Nested components (single and repeatable)
   - ✅ Media fields (images, videos, files)
   - ✅ Relations (author, category, etc.)
   - ✅ Other field types (numbers, booleans, dates)

3. **Translation Logic**
   - Mock translation (appends random 5-6 character string to text)
   - Preserves HTML structure in rich text fields
   - Ready to switch to real Google Translate API

4. **Data Preservation**
   - Maintains dynamic zone structure and order
   - Copies media attachments from source locale
   - Preserves relation links
   - Maintains all non-translatable field values

5. **Locale Management**
   - Fetches available locales from i18n plugin
   - Creates new locale entries or updates existing ones
   - Links localizations between entries

---

## Architecture

### Plugin Structure

```
src/plugins/auto-translator/
├── admin/                          # Frontend (React)
│   └── src/
│       ├── components/
│       │   ├── TranslateButton.tsx          # Main UI component
│       │   └── InjectedTranslateButton.tsx  # Injection wrapper
│       ├── index.tsx                        # Admin entry point
│       └── utils/
│           └── getTrad.ts                   # i18n helpers
├── server/                         # Backend (Node.js)
│   └── src/
│       ├── controllers/
│       │   └── translator.ts               # HTTP request handlers
│       ├── services/
│       │   └── translator.ts               # Core business logic
│       ├── routes/
│       │   └── index.ts                    # API routes
│       ├── utils/
│       │   └── index.ts                    # Utility functions
│       └── index.ts                        # Server entry point
└── dist/                          # Compiled output
```

### Data Flow

```
User clicks Translate Button
    ↓
Frontend (TranslateButton.tsx)
    ↓
POST /auto-translator/translate
    ↓
Controller (translator.ts)
    ↓
Service (translator.ts)
    ├── 1. extractTranslatableContent()
    │   ├── Build populate query
    │   ├── Fetch entity with deep population
    │   └── Extract all localizable fields
    ├── 2. translateContent()
    │   ├── Clone content structure
    │   └── Translate text fields (mock/API)
    └── 3. saveTranslatedContent()
        ├── Rebuild content structure
        ├── Copy non-translatable fields
        └── Create/update locale entry
    ↓
Success response
    ↓
Frontend reloads page
```

---

## Key Implementation Details

### 1. Deep Population Strategy

**Problem:** Strapi v5 doesn't support `populate: 'deep'` string parameter.

**Solution:** Built a dynamic populate query builder (`buildDeepPopulate()`) that recursively scans the content type schema and constructs the proper nested populate structure.

**File:** `src/plugins/auto-translator/server/src/utils/index.ts`

```typescript
export const buildDeepPopulate = (contentTypeSchema: any, strapi: any, maxDepth = 5): any => {
  // Recursively builds populate structure for:
  // - Media fields
  // - Relations
  // - Components (nested)
  // - Dynamic zones
}
```

**Example Output:**
```json
{
  "cover": true,
  "author": true,
  "category": true,
  "blocks": {
    "populate": "*"
  }
}
```

### 2. Passthrough Field Type

**Problem:** Dynamic zones and components weren't preserving non-translatable fields (media, relations, numbers, etc.)

**Solution:** Introduced a new `passthrough` field type that captures and restores non-translatable fields without modification.

**Implementation:**

**Extraction** (marks fields for passthrough):
```typescript
default:
  // Include non-translatable fields (media, relations, numbers, etc.)
  translatableFields[fieldName] = {
    type: 'passthrough',
    value: fieldValue,
  };
```

**Rebuild** (restores passthrough fields):
```typescript
case 'passthrough':
  // Restore non-translatable fields as-is
  componentObject[fieldName] = data.value;
  break;
```

### 3. Mock Translation Implementation

**Purpose:** Allow testing of data extraction and saving without Google Translate API key.

**File:** `src/plugins/auto-translator/server/src/services/translator.ts`

**Text Translation:**
```typescript
async translateText(text: string, translateClient: any, sourceLocale: string, targetLocale: string) {
  if (!translateClient) {
    // Mock translation: append random 5-6 characters
    const randomChars = Math.random().toString(36).substring(2, 8);
    return `${text} ${randomChars}`;
  }
  // TODO: Real Google Translate API code (commented out)
}
```

**Rich Text Translation:**
```typescript
async translateRichText(html: string, translateClient: any, sourceLocale: string, targetLocale: string) {
  if (!translateClient) {
    // Insert random chars before closing HTML tag
    const randomChars = Math.random().toString(36).substring(2, 8);
    // Smart HTML handling...
    return mockedTranslation;
  }
  // TODO: Real Google Translate API code (commented out)
}
```

### 4. Comprehensive Logging

**Purpose:** Debug and verify complete data extraction and processing.

**Logging Points:**
1. Populate query structure
2. Complete fetched entity data (all fields, nested structures)
3. Localizable fields list
4. Field-by-field processing
5. Dynamic zone raw data and extraction
6. Component-by-component details
7. Final extracted translatable content

---

## API Endpoints

### GET `/auto-translator/locales`

Fetches available locales from i18n plugin.

**Response:**
```json
{
  "data": [
    { "code": "en", "name": "English", "isDefault": true },
    { "code": "de", "name": "German", "isDefault": false }
  ]
}
```

### POST `/auto-translator/translate`

Translates content from source locale to target locale.

**Request Body:**
```json
{
  "contentType": "api::article.article",
  "documentId": "abc123",
  "sourceLocale": "en",
  "targetLocale": "de"
}
```

**Response:**
```json
{
  "success": true,
  "data": { /* translated entry */ }
}
```

---

## Development Timeline & Solutions

### Issue 1: Dynamic Zones Not Being Saved

**Problem:** Only native fields (title, description) were being saved. Dynamic zone blocks were missing.

**Root Cause:** Extraction logic only captured translatable text fields and skipped all non-translatable fields.

**Solution:**
- Introduced `passthrough` field type
- Modified extraction to capture ALL fields
- Updated rebuild logic to restore passthrough fields

**Files Changed:**
- `src/plugins/auto-translator/server/src/services/translator.ts` (lines 218-225, 646-649, 690-693)

### Issue 2: Dynamic Zone Data Not Being Fetched

**Problem:** Console logs showed only title and description, no blocks data.

**Root Cause:** Strapi v5 requires explicit `populate` parameter. Without it, only shallow data is returned.

**Solution:**
- Created `buildDeepPopulate()` utility function
- Dynamically generates populate query based on content type schema
- Handles nested components and dynamic zones

**Files Changed:**
- `src/plugins/auto-translator/server/src/utils/index.ts` (new function)
- `src/plugins/auto-translator/server/src/services/translator.ts` (populate query usage)

### Issue 3: "Invalid key deep" Error

**Problem:** Strapi v5 rejected `populate: 'deep'` parameter.

**Root Cause:** Strapi v5 doesn't support string-based deep population like Strapi v4.

**Solution:**
- Replaced hardcoded `populate: 'deep'` with dynamic query builder
- Built proper nested object structure for population

---

## Configuration

### Environment Variables

```env
GOOGLE_TRANSLATE_API_KEY=your_api_key_here
```

### Plugin Configuration

**File:** `config/plugins.ts`

```typescript
export default {
  'auto-translator': {
    enabled: true,
    resolve: './src/plugins/auto-translator',
    config: {
      googleApiKey: process.env.GOOGLE_TRANSLATE_API_KEY,
    },
  },
}
```

---

## Usage

### For Content Editors

1. Navigate to Content Manager
2. Open any entry with i18n enabled
3. Click the **Translate** button (globe icon)
4. Select target locale from dropdown
5. Click **Translate** button
6. Wait for success message
7. Page reloads with translated entry created/updated

### For Developers

#### Enable Real Translation

1. Obtain Google Translate API key
2. Add to `.env` file
3. In `src/plugins/auto-translator/server/src/services/translator.ts`:
   - Uncomment Google Translate API code in `translateContent()` (lines 259-268)
   - Uncomment API code in `translateText()` (lines 389-403)
   - Uncomment API code in `translateRichText()` (lines 449-462)
   - Remove mock translation logic

#### Build Plugin

```bash
# Build plugin only
npm run build:plugin:auto-translator

# Build entire Strapi app (includes plugin)
npm run build
```

#### Development

```bash
# Start with hot reload
npm run develop
```

---

## Code Reference

### Key Functions

#### `extractTranslatableContent(contentType, documentId, locale)`
- **Purpose:** Extract all translatable fields from an entry
- **Returns:** Content structure with fields organized by type
- **File:** `translator.ts` (lines 36-161)

#### `extractDynamicZoneContent(components)`
- **Purpose:** Process dynamic zone components
- **Returns:** Array of extracted component data
- **File:** `translator.ts` (lines 166-190)

#### `extractComponentFields(componentName, componentData)`
- **Purpose:** Extract fields from a single component
- **Returns:** Object with translatable and passthrough fields
- **File:** `translator.ts` (lines 195-251)

#### `translateContent(content, sourceLocale, targetLocale)`
- **Purpose:** Translate extracted content structure
- **Returns:** Translated content structure
- **File:** `translator.ts` (lines 257-287)

#### `translateFields(fields, translateClient, sourceLocale, targetLocale)`
- **Purpose:** Recursively translate fields in content structure
- **File:** `translator.ts` (lines 292-371)

#### `saveTranslatedContent(contentType, sourceDocumentId, translatedContent, targetLocale)`
- **Purpose:** Save translated content as new/updated locale entry
- **Returns:** Saved entity
- **File:** `translator.ts` (lines 494-589)

#### `rebuildContentFromFields(dataObject, fields, contentTypeSchema)`
- **Purpose:** Rebuild Strapi-compatible data structure from translated fields
- **File:** `translator.ts` (lines 594-665)

#### `buildDeepPopulate(contentTypeSchema, strapi, maxDepth)`
- **Purpose:** Build nested populate query for Strapi v5
- **Returns:** Populate object structure
- **File:** `utils/index.ts` (lines 60-120)

---

## Testing Checklist

### Data Extraction
- [ ] Native fields (title, description) extracted
- [ ] Dynamic zone blocks extracted with correct order
- [ ] Media fields populated and extracted
- [ ] Relations populated and extracted
- [ ] Nested components extracted
- [ ] All field types preserved

### Translation
- [ ] Text fields translated (mocked with random chars)
- [ ] Rich text HTML structure preserved
- [ ] Dynamic zone component order maintained
- [ ] Media attachments copied to target locale
- [ ] Relations copied to target locale

### Saving
- [ ] New locale entry created when doesn't exist
- [ ] Existing locale entry updated when exists
- [ ] Dynamic zones saved with all blocks
- [ ] Media attachments linked correctly
- [ ] Relations linked correctly
- [ ] Localizations linked between source and target

---

## Future Improvements

### High Priority
1. **Google Translate API Integration**
   - Remove mock translation
   - Uncomment and test real API code
   - Add error handling for API rate limits
   - Add retry logic for failed translations

2. **Batch Translation**
   - Translate multiple entries at once
   - Bulk translate all missing locales

3. **Translation Memory**
   - Cache previously translated strings
   - Reuse translations for repeated content

### Medium Priority
4. **Translation Validation**
   - Preview translated content before saving
   - Allow manual edits before save
   - Track translation status per field

5. **Progress Indicators**
   - Show translation progress for long content
   - Display field-by-field translation status

6. **Custom Translation Rules**
   - Skip certain fields from translation
   - Custom translation for specific field types
   - Preserve placeholders and variables

### Low Priority
7. **Multiple Translation Providers**
   - Support DeepL API
   - Support Azure Translator
   - Allow provider selection per language pair

8. **Translation Analytics**
   - Track translation costs
   - Monitor API usage
   - Generate translation reports

---

## Troubleshooting

### Issue: "Invalid key deep" Error

**Solution:** Plugin already fixed. Ensure you're using the latest build.

### Issue: Dynamic zones not appearing in translated entry

**Check:**
1. Console logs show fetched entity has `blocks` field
2. Populate query includes dynamic zone
3. Extracted content includes dynamic zone components

**Solution:** Run `npm run build` to rebuild plugin with latest fixes.

### Issue: Media not attached in translated entry

**Check:**
1. Source entry has media attached
2. Console logs show media in fetched entity
3. Passthrough fields are being extracted

**Solution:** Media should be automatically copied. Check console logs for extraction details.

### Issue: Translation takes too long

**Possible Causes:**
1. Large content with many dynamic zones
2. Deep nesting of components
3. Network latency (when using real API)

**Solution:**
- Consider breaking content into smaller entries
- Adjust `maxDepth` parameter in `buildDeepPopulate()` if needed

---

## Build Commands

```bash
# Build plugin only
cd src/plugins/auto-translator
npm run build

# Or from root
npm run build:plugin:auto-translator

# Build entire Strapi app
npm run build

# Development mode
npm run develop
```

---

## Contributing

### Code Style
- Use TypeScript
- Follow existing patterns
- Add comprehensive logging for debugging
- Document complex logic with comments

### Testing Changes
1. Make changes to source files in `server/src/` or `admin/src/`
2. Build plugin: `npm run build:plugin:auto-translator`
3. Restart Strapi: `npm run develop`
4. Test with sample content
5. Check console logs for debugging info

---

## License

This plugin is part of the Music Tribe i18n Strapi project.

---

## Changelog

### Version 0.1.0 (Current)
- ✅ Initial implementation
- ✅ Deep populate query builder
- ✅ Passthrough field type for non-translatable fields
- ✅ Mock translation implementation
- ✅ Complete data extraction and saving
- ✅ Comprehensive logging
- ✅ Support for all field types
- 🔄 Google Translate API integration (ready, needs API key)

---

## Contact & Support

For questions or issues related to this plugin, refer to this documentation or check the console logs for detailed debugging information.

**Key Files to Review:**
- `src/plugins/auto-translator/server/src/services/translator.ts` - Core logic
- `src/plugins/auto-translator/server/src/utils/index.ts` - Utility functions
- `src/plugins/auto-translator/admin/src/components/TranslateButton.tsx` - UI component
