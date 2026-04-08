import type { Core } from "@strapi/strapi";
import {
  getLocalizableFields,
  getFieldType,
  buildDeepPopulate,
} from "../utils";
import type { AutoTranslatorConfig } from "../config";

/**
 * Generic translation provider interface.
 * Both AWS and OpenAI adapters implement this.
 */
interface TranslationProvider {
  translateText: (text: string, sourceLang: string, targetLang: string) => Promise<string>;
  translateHtml: (html: string, sourceLang: string, targetLang: string) => Promise<string>;
}

function createOpenAIProvider(apiKey: string, model: string, temperature: number): TranslationProvider {
  const { OpenAI } = require('openai');
  const client = new OpenAI({ apiKey });

  const translate = async (
    text: string,
    sourceLang: string,
    targetLang: string,
    isHtml = false,
  ): Promise<string> => {
    if (!text || text.trim() === '') return text;
    const systemPrompt = isHtml
      ? `You are a professional translator. Translate the HTML content from ${sourceLang} to ${targetLang}. Preserve all HTML tags exactly as-is. Return only the translated HTML, no explanations.`
      : `You are a professional translator. Translate the following text from ${sourceLang} to ${targetLang}. Return only the translated text, no explanations.`;

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature,
    });
    return response.choices[0]?.message?.content?.trim() ?? text;
  };

  return {
    translateText: (text, src, tgt) => translate(text, src, tgt, false),
    translateHtml: (html, src, tgt) => translate(html, src, tgt, true),
  };
}

function createAWSProvider(region: string, accessKeyId: string, secretAccessKey: string): TranslationProvider {
  const { TranslateClient, TranslateTextCommand } = require('@aws-sdk/client-translate');
  const client = new TranslateClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return {
    translateText: async (text, src, tgt) => {
      const cmd = new TranslateTextCommand({ Text: text, SourceLanguageCode: src, TargetLanguageCode: tgt });
      const res = await client.send(cmd);
      return res.TranslatedText;
    },
    translateHtml: async (html, src, tgt) => {
      const cmd = new TranslateTextCommand({ Text: html, SourceLanguageCode: src, TargetLanguageCode: tgt, TextType: 'HTML' });
      const res = await client.send(cmd);
      return res.TranslatedText;
    },
  };
}

/** Returns true if the field should be excluded from translation. */
function isExcludedField(fieldName: string, excludedSet: Set<string>, patterns: RegExp[]): boolean {
  return excludedSet.has(fieldName) || patterns.some(p => p.test(fieldName));
}

const translatorService = ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Get available locales from i18n plugin configuration
   */
  async getAvailableLocales() {
    try {
      // Check if i18n plugin is enabled
      const i18nPlugin = strapi.plugin("i18n");

      if (!i18nPlugin) {
        strapi.log.warn("Auto Translator: i18n plugin is not enabled");
        return [];
      }

      // Get locales from i18n plugin service
      const localesService = i18nPlugin.service("locales");
      const locales = await localesService.find();

      return locales.map((locale: any) => ({
        code: locale.code,
        name: locale.name,
        isDefault: locale.isDefault,
      }));
    } catch (error) {
      strapi.log.error("Auto Translator: Error fetching locales", error);
      return [];
    }
  },

  /**
   * Extract translatable content from an entry
   */
  async extractTranslatableContent(
    contentType: string,
    documentId: string | undefined,
    locale: string,
    isSingleType = false,
  ) {
    try {
      // Get the content type schema
      const contentTypeSchema = strapi.contentType(contentType as any);

      if (!contentTypeSchema) {
        throw new Error(`Content type ${contentType} not found`);
      }

      // Build deep populate query to fetch all nested data
      const populateQuery = buildDeepPopulate(contentTypeSchema, strapi);

      // Get the entity with all its fields populated
      let entity;

      if (isSingleType) {
        // For single types, find by locale only (no documentId)
        entity = await strapi.documents(contentType as any).findFirst({
          locale,
          populate: populateQuery,
        });
      } else {
        if (!documentId) {
          return null;
        }
        // For collection types, find by documentId
        entity = await strapi.documents(contentType as any).findOne({
          documentId,
          locale,
          populate: populateQuery,
        });
      }

      if (!entity) {
        const identifier = isSingleType
          ? `single type ${contentType}`
          : `document with ID ${documentId}`;
        throw new Error(`${identifier} not found for locale ${locale}`);
      }

      // Get all localizable fields
      const localizableFields = getLocalizableFields(contentTypeSchema);

      // Extract translatable content
      const translatableContent: any = {
        fields: {},
        meta: {
          contentType,
          documentId: documentId || entity.documentId,
          locale,
          isSingleType,
        },
      };

      for (const fieldName of localizableFields) {
        const fieldValue = entity[fieldName];
        const fieldSchema = contentTypeSchema.attributes[fieldName];
        const fieldType = getFieldType(fieldSchema);

        // Process different field types
        if (fieldValue !== null && fieldValue !== undefined) {
          switch (fieldType) {
            case "string":
            case "text":
            case "richtext":
            case "email":
              // Direct translatable text fields
              translatableContent.fields[fieldName] = {
                type: fieldType,
                value: fieldValue,
              };
              break;

            case "blocks":
              // Strapi v5 Blocks editor — stored as JSON array
              translatableContent.fields[fieldName] = {
                type: "blocks",
                value: fieldValue,
              };
              break;

            case "dynamiczone":
              // Process dynamic zone components
              if (Array.isArray(fieldValue)) {
                translatableContent.fields[fieldName] = {
                  type: "dynamiczone",
                  components: await this.extractDynamicZoneContent(
                    fieldValue,
                    20,
                    fieldName,
                  ),
                };
              }
              break;

            case "component":
              // Process component fields
              const componentSchema = fieldSchema as any;
              if (componentSchema.repeatable && Array.isArray(fieldValue)) {
                // Repeatable component

                translatableContent.fields[fieldName] = {
                  type: "component",
                  repeatable: true,
                  componentName: componentSchema.component,
                  items: await this.extractComponentContent(
                    componentSchema.component,
                    fieldValue,
                    1,
                    fieldName,
                  ),
                };
              } else if (fieldValue && typeof fieldValue === "object") {
                // Single component

                translatableContent.fields[fieldName] = {
                  type: "component",
                  repeatable: false,
                  componentName: componentSchema.component,
                  content: await this.extractComponentFields(
                    componentSchema.component,
                    fieldValue,
                    1,
                    fieldName,
                  ),
                };
              }
              break;

            case "media":
            case "relation":
              // Include media and relation fields as passthrough
              // These will be copied as-is to the translated locale
              translatableContent.fields[fieldName] = {
                type: "passthrough",
                value: fieldValue,
              };
              break;

            default:
              // Include all other field types as passthrough (numbers, booleans, dates, etc.)
              translatableContent.fields[fieldName] = {
                type: "passthrough",
                value: fieldValue,
              };
              break;
          }
        }
      }

      return translatableContent;
    } catch (error) {
      strapi.log.error(
        "Auto Translator: Error extracting translatable content",
        error,
      );
      throw error;
    }
  },

  /**
   * Extract content from dynamic zone components
   * @param components - Array of dynamic zone component data
   * @param depth - Current nesting depth for logging (default: 0)
   * @param path - Path to this dynamic zone for debugging (default: '')
   */
  async extractDynamicZoneContent(
    components: any[],
    depth: number = 0,
    path: string = "",
  ) {
    const depthPrefix = "  ".repeat(depth);
    const dzPath = path ? `${path}[]` : "dynamiczone[]";

    const extractedComponents: any[] = [];

    for (let i = 0; i < components.length; i++) {
      const component = components[i];
      const itemPath = `${dzPath}[${i}]`;

      if (component && component.__component) {
        const componentContent = await this.extractComponentFields(
          component.__component,
          component,
          depth,
          itemPath,
        );

        extractedComponents.push({
          __component: component.__component,
          id: component.id,
          content: componentContent,
        });
      } else {
      }
    }

    return extractedComponents;
  },

  /**
   * Extract translatable fields from a component
   * @param componentName - The component identifier (e.g., 'shared.action-button')
   * @param componentData - The actual data from the component
   * @param depth - Current nesting depth for logging (default: 0)
   * @param path - Path to this component for debugging (default: '')
   */
  async extractComponentFields(
    componentName: string,
    componentData: any,
    depth: number = 0,
    path: string = "",
  ) {
    const depthPrefix = "  ".repeat(depth);
    const componentPath = path ? `${path}.${componentName}` : componentName;

    const componentSchema = strapi.components[componentName];

    if (!componentSchema) {
      strapi.log.warn(`Component schema not found for ${componentName}`);
      return {};
    }

    const translatableFields: any = {};
    const attributes = componentSchema.attributes || {};

    for (const [fieldName, fieldSchema] of Object.entries(attributes)) {
      const fieldValue = componentData[fieldName];
      const fieldType = getFieldType(fieldSchema as any);
      const fieldPath = `${componentPath}.${fieldName}`;

      if (fieldValue !== null && fieldValue !== undefined) {
        switch (fieldType) {
          case "string":
          case "text":
          case "richtext":
          case "email":
            translatableFields[fieldName] = {
              type: fieldType,
              value: fieldValue,
            };

            break;

          case "blocks":
            // Strapi v5 Blocks editor — stored as JSON array
            translatableFields[fieldName] = {
              type: "blocks",
              value: fieldValue,
            };
            break;

          case "component":
            const typedFieldSchema = fieldSchema as any;

            if (typedFieldSchema.repeatable && Array.isArray(fieldValue)) {
              translatableFields[fieldName] = {
                type: "component",
                repeatable: true,
                componentName: typedFieldSchema.component,
                items: await this.extractComponentContent(
                  typedFieldSchema.component,
                  fieldValue,
                  depth + 1,
                  fieldPath,
                ),
              };
            } else if (fieldValue && typeof fieldValue === "object") {
              translatableFields[fieldName] = {
                type: "component",
                repeatable: false,
                componentName: typedFieldSchema.component,
                content: await this.extractComponentFields(
                  typedFieldSchema.component,
                  fieldValue,
                  depth + 1,
                  fieldPath,
                ),
              };
            } else {
            }
            break;

          default:
            // Include non-translatable fields (media, relations, numbers, etc.)
            // These will be copied as-is without translation
            translatableFields[fieldName] = {
              type: "passthrough",
              value: fieldValue,
            };

            break;
        }
      } else {
      }
    }

    const extractedFieldCount = Object.keys(translatableFields).length;

    return translatableFields;
  },

  /**
   * Extract content from repeatable components
   * @param componentName - The component identifier
   * @param components - Array of component data
   * @param depth - Current nesting depth for logging (default: 0)
   * @param path - Path to this component array for debugging (default: '')
   */
  async extractComponentContent(
    componentName: string,
    components: any[],
    depth: number = 0,
    path: string = "",
  ) {
    const depthPrefix = "  ".repeat(depth);
    const componentPath = path ? `${path}[]` : `${componentName}[]`;

    const extractedItems: any[] = [];

    for (let i = 0; i < components.length; i++) {
      const component = components[i];
      const itemPath = `${componentPath}[${i}]`;

      if (component) {
        const componentContent = await this.extractComponentFields(
          componentName,
          component,
          depth,
          itemPath,
        );

        extractedItems.push({
          id: component.id,
          content: componentContent,
        });
      } else {
      }
    }

    return extractedItems;
  },

  /**
   * Translate content using the configured provider (openai by default, aws as fallback).
   * Configure via config/plugins.ts under the "auto-translator" key.
   */
  async translateContent(
    content: any,
    sourceLocale: string,
    targetLocale: string,
  ) {
    try {
      const config = strapi.config.get('plugin::auto-translator') as AutoTranslatorConfig;
      const provider = config.translationProvider;

      strapi.log.info(`Auto Translator: Using provider: ${provider}`);

      let translateClient: TranslationProvider;
      if (provider === 'aws') {
        const region = config.aws?.region || process.env.AWS_REGION || 'us-east-1';
        const accessKeyId = config.aws?.accessKeyId || process.env.AWS_ACCESS_KEY_ID || '';
        const secretAccessKey = config.aws?.secretAccessKey || process.env.AWS_ACCESS_SECRET || '';
        translateClient = createAWSProvider(region, accessKeyId, secretAccessKey);
      } else {
        const apiKey = config.openai?.apiKey || process.env.OPENAI_API_KEY || '';
        const model = config.openai?.model || 'gpt-4o-mini';
        const temperature = config.openai?.temperature ?? 0.1;
        translateClient = createOpenAIProvider(apiKey, model, temperature);
      }

      // Clone the content structure
      const translatedContent = JSON.parse(JSON.stringify(content));

      // Fields to skip (handles, slugs, URLs stay as-is)
      const excludedFieldNames = new Set(
        Array.isArray(config.doNotTranslateFields) ? config.doNotTranslateFields : [],
      );
      const excludedPatterns = (config.doNotTranslateFieldPatterns ?? []).map(p => new RegExp(p));

      // Translate all fields
      await this.translateFields(
        translatedContent.fields,
        translateClient,
        sourceLocale,
        targetLocale,
        excludedFieldNames,
        excludedPatterns,
      );

      return translatedContent;
    } catch (error) {
      strapi.log.error("Auto Translator: Error translating content", error);
      throw error;
    }
  },

  /**
   * Recursively translate fields in the content structure.
   * @param excludedFieldNames - Set of field names to skip (e.g. handle, slug, url, href).
   * @param excludedPatterns - Compiled RegExp patterns; any matching field name is excluded.
   */
  async translateFields(
    fields: any,
    translateClient: any,
    sourceLocale: string,
    targetLocale: string,
    excludedFieldNames: Set<string> = new Set(),
    excludedPatterns: RegExp[] = [],
  ) {
    for (const [fieldName, fieldData] of Object.entries(fields)) {
      const data = fieldData as any;

      if (!data || !data.type) {
        continue;
      }

      switch (data.type) {
        case "string":
        case "text":
        case "email":
          // Skip excluded fields (handle, slug, url, href, etc.)
          if (isExcludedField(fieldName, excludedFieldNames, excludedPatterns)) {
            break;
          }
          // Translate simple text fields
          if (data.value && typeof data.value === "string") {
            data.value = await this.translateText(
              data.value,
              translateClient,
              sourceLocale,
              targetLocale,
            );
          }
          break;

        case "richtext":
          if (isExcludedField(fieldName, excludedFieldNames, excludedPatterns)) {
            break;
          }
          // Translate rich text (preserve HTML)
          if (data.value && typeof data.value === "string") {
            data.value = await this.translateRichText(
              data.value,
              translateClient,
              sourceLocale,
              targetLocale,
            );
          }
          break;

        case "blocks":
          // Translate Strapi v5 Blocks editor JSON
          if (data.value && Array.isArray(data.value)) {
            data.value = await this.translateBlocks(
              data.value,
              translateClient,
              sourceLocale,
              targetLocale,
            );
          }
          break;

        case "dynamiczone":
          // Translate dynamic zone components
          if (data.components && Array.isArray(data.components)) {
            for (const component of data.components) {
              if (component.content) {
                await this.translateFields(
                  component.content,
                  translateClient,
                  sourceLocale,
                  targetLocale,
                  excludedFieldNames,
                  excludedPatterns,
                );
              }
            }
          }
          break;

        case "component":
          if (data.repeatable && data.items && Array.isArray(data.items)) {
            // Translate repeatable component items
            for (const item of data.items) {
              if (item.content) {
                await this.translateFields(
                  item.content,
                  translateClient,
                  sourceLocale,
                  targetLocale,
                  excludedFieldNames,
                  excludedPatterns,
                );
              }
            }
          } else if (data.content) {
            // Translate single component
            await this.translateFields(
              data.content,
              translateClient,
              sourceLocale,
              targetLocale,
              excludedFieldNames,
              excludedPatterns,
            );
          }
          break;

        default:
          break;
      }
    }
  },

  /**
   * Translate plain text using the active translation provider.
   */
  async translateText(
    text: string,
    translateClient: TranslationProvider,
    sourceLocale: string,
    targetLocale: string,
  ): Promise<string> {
    try {
      if (!text || text.trim() === "") {
        return text;
      }

      const sourceLang = this.convertLocaleToLanguageCode(sourceLocale);
      const targetLang = this.convertLocaleToLanguageCode(targetLocale);

      return await translateClient.translateText(text, sourceLang, targetLang);
    } catch (error) {
      strapi.log.error(
        `Auto Translator: Error translating text: ${text.substring(0, 50)}...`,
        error,
      );
      // Return original text if translation fails
      return text;
    }
  },

  /**
   * Translate rich text content (HTML) using the active translation provider.
   */
  async translateRichText(
    html: string,
    translateClient: TranslationProvider,
    sourceLocale: string,
    targetLocale: string,
  ): Promise<string> {
    try {
      if (!html || html.trim() === "") {
        return html;
      }

      const sourceLang = this.convertLocaleToLanguageCode(sourceLocale);
      const targetLang = this.convertLocaleToLanguageCode(targetLocale);

      return await translateClient.translateHtml(html, sourceLang, targetLang);
    } catch (error) {
      strapi.log.error("Auto Translator: Error translating rich text", error);
      // Return original HTML if translation fails
      return html;
    }
  },

  /**
   * Translate a Strapi v5 Blocks editor JSON array, recursively translating all text leaves.
   */
  async translateBlocks(
    blocks: any[],
    translateClient: any,
    sourceLocale: string,
    targetLocale: string,
  ): Promise<any[]> {
    const cloned = JSON.parse(JSON.stringify(blocks));
    await this.translateBlockNodes(cloned, translateClient, sourceLocale, targetLocale);
    return cloned;
  },

  async translateBlockNodes(
    nodes: any[],
    translateClient: any,
    sourceLocale: string,
    targetLocale: string,
  ): Promise<void> {
    for (const node of nodes) {
      if (node.type === "text" && typeof node.text === "string" && node.text.trim()) {
        node.text = await this.translateText(node.text, translateClient, sourceLocale, targetLocale);
      }
      if (Array.isArray(node.children)) {
        await this.translateBlockNodes(node.children, translateClient, sourceLocale, targetLocale);
      }
    }
  },

  /**
   * Convert Strapi locale code to AWS Translate language code
   * Examples: 'en-US' -> 'en', 'de-DE' -> 'de', 'pt-BR' -> 'pt'
   */
  convertLocaleToLanguageCode(locale: string): string {
    // Extract the language part before the hyphen
    const parts = locale.split("-");
    return parts[0].toLowerCase();
  },

  /**
   * Build minimal/blank data from content-type schema for creating a locale entry.
   * Only includes required attributes with safe defaults so validation passes.
   */
  buildMinimalDataForContentType(
    contentTypeSchema: any,
  ): Record<string, unknown> {
    const minimalData: Record<string, unknown> = {};
    const attributes = contentTypeSchema?.attributes || {};
    const systemFields = [
      "id",
      "documentId",
      "createdAt",
      "updatedAt",
      "publishedAt",
      "createdBy",
      "updatedBy",
      "locale",
      "localizations",
    ];

    for (const [fieldName, fieldSchema] of Object.entries(attributes)) {
      if (systemFields.includes(fieldName)) {
        continue;
      }
      const field = fieldSchema as any;
      const isRequired = field?.required === true;

      if (!isRequired) {
        continue;
      }

      const fieldType = field?.type;
      switch (fieldType) {
        case "string":
        case "text":
        case "richtext":
        case "email":
          minimalData[fieldName] = "";
          break;
        case "uid":
          minimalData[fieldName] = "";
          break;
        case "boolean":
          minimalData[fieldName] = false;
          break;
        case "integer":
        case "biginteger":
        case "float":
        case "decimal":
          minimalData[fieldName] = 0;
          break;
        case "json":
          minimalData[fieldName] = {};
          break;
        case "enumeration":
          const enumValues = field?.enum;
          minimalData[fieldName] =
            field?.default !== undefined
              ? field.default
              : Array.isArray(enumValues) && enumValues.length > 0
                ? enumValues[0]
                : "";
          break;
        default:
          minimalData[fieldName] = null;
          break;
      }
    }

    return minimalData;
  },

  /**
   * Ensure the target locale entry exists for the document. If it does not exist,
   * create it (blank/minimal entry) using update() with the same documentId so
   * Strapi creates the locale for that document per REST API semantics.
   */
  async ensureTargetLocaleExists(
    contentType: string,
    sourceDocumentId: string | undefined,
    targetLocale: string,
    isSingleType = false,
  ): Promise<void> {
    const contentTypeSchema = strapi.contentType(contentType as any);
    if (!contentTypeSchema) {
      throw new Error(`Content type ${contentType} not found`);
    }

    let documentId: string | undefined = sourceDocumentId;

    if (isSingleType) {
      const anyLocaleEntry = await strapi
        .documents(contentType as any)
        .findFirst({});
      if (!anyLocaleEntry) {
        throw new Error(`Single type ${contentType} has no document`);
      }
      documentId = anyLocaleEntry.documentId;
    }

    const existingEntry = await strapi.documents(contentType as any).findOne({
      documentId: documentId!,
      locale: targetLocale,
    });

    if (existingEntry) {
      return;
    }

    const minimalData = this.buildMinimalDataForContentType(contentTypeSchema);
    strapi.log.info(
      `Auto Translator: Creating blank locale entry for ${contentType} in locale ${targetLocale}`,
    );

    await strapi.documents(contentType as any).update({
      documentId: documentId!,
      locale: targetLocale,
      data: minimalData as any,
    });
  },

  /**
   * Save translated content as a new locale entry
   */
  async saveTranslatedContent(
    contentType: string,
    sourceDocumentId: string | undefined,
    translatedContent: any,
    targetLocale: string,
    isSingleType = false,
  ) {
    try {
      await this.ensureTargetLocaleExists(
        contentType,
        sourceDocumentId,
        targetLocale,
        isSingleType,
      );

      // Get the content type schema
      const contentTypeSchema = strapi.contentType(contentType as any);

      if (!contentTypeSchema) {
        throw new Error(`Content type ${contentType} not found`);
      }

      // Build deep populate query to fetch all nested data
      const populateQuery = buildDeepPopulate(contentTypeSchema, strapi);

      // Get the source entity to copy non-translatable fields
      let sourceEntity;

      if (isSingleType) {
        // For single types, find by locale only
        sourceEntity = await strapi.documents(contentType as any).findFirst({
          locale: translatedContent.meta.locale,
          populate: populateQuery,
        });
      } else {
        // For collection types, find by documentId
        if (!sourceDocumentId) {
          return null;
        }
        sourceEntity = await strapi.documents(contentType as any).findOne({
          documentId: sourceDocumentId,
          locale: translatedContent.meta.locale,
          populate: populateQuery,
        });
      }

      if (!sourceEntity) {
        const identifier = isSingleType
          ? `single type ${contentType}`
          : `document with ID ${sourceDocumentId}`;
        throw new Error(`Source ${identifier} not found`);
      }

      // Build the data object for the new locale entry
      const dataToSave: any = {};

      // Rebuild the translated content from the fields structure
      await this.rebuildContentFromFields(
        dataToSave,
        translatedContent.fields,
        contentTypeSchema,
      );

      // Copy non-translatable fields from source entity
      const localizableFields = getLocalizableFields(contentTypeSchema);
      const allFieldNames = Object.keys(contentTypeSchema.attributes);

      for (const fieldName of allFieldNames) {
        // Skip system fields
        if (
          [
            "id",
            "documentId",
            "createdAt",
            "updatedAt",
            "publishedAt",
            "createdBy",
            "updatedBy",
            "locale",
            "localizations",
          ].includes(fieldName)
        ) {
          continue;
        }

        // If field is not localizable and exists in source, copy it
        if (
          !localizableFields.includes(fieldName) &&
          sourceEntity[fieldName] !== undefined
        ) {
          dataToSave[fieldName] = sourceEntity[fieldName];
        }
      }

      // Ensure "do not translate" fields (handle, slug, url, href, etc.) are always
      // populated from the source locale — same value as source, not translated
      const config = strapi.config.get("plugin::auto-translator") as AutoTranslatorConfig;
      const excludedNames: string[] = Array.isArray(config.doNotTranslateFields)
        ? config.doNotTranslateFields
        : [];
      const excludedPatterns: RegExp[] = (config.doNotTranslateFieldPatterns ?? []).map(
        p => new RegExp(p)
      );

      for (const fieldName of excludedNames) {
        if (
          sourceEntity[fieldName] !== undefined &&
          contentTypeSchema.attributes?.[fieldName]
        ) {
          dataToSave[fieldName] = sourceEntity[fieldName];
        }
      }

      // Also copy any field whose name matches an excluded pattern from source
      for (const fieldName of Object.keys(contentTypeSchema.attributes || {})) {
        if (!excludedNames.includes(fieldName) && excludedPatterns.some(p => p.test(fieldName))) {
          if (sourceEntity[fieldName] !== undefined) {
            dataToSave[fieldName] = sourceEntity[fieldName];
          }
        }
      }

      let savedEntity;

      if (isSingleType) {
        // Target locale entry exists after ensureTargetLocaleExists; update with full translated content
        strapi.log.info(
          `Auto Translator: Updating single type locale entry for ${contentType} in locale ${targetLocale}`,
        );

        savedEntity = await strapi.documents(contentType as any).update({
          documentId: sourceEntity.documentId,
          locale: targetLocale,
          data: dataToSave,
        });
      } else {
        // For collection types, check if locale entry already exists (findOne is the correct API for documentId + locale)
        const existingLocaleEntry = await strapi
          .documents(contentType as any)
          .findOne({
            documentId: sourceEntity.documentId,
            locale: targetLocale,
          });

        if (existingLocaleEntry) {
          strapi.log.info(
            `Auto Translator: Updating existing locale entry for ${contentType} documentId ${sourceEntity.documentId} in locale ${targetLocale}`,
          );
        } else {
          strapi.log.info(
            `Auto Translator: Saving translated content to locale entry for ${contentType} documentId ${sourceEntity.documentId} in locale ${targetLocale} (blank entry was created by ensureTargetLocaleExists)`,
          );
        }

        // Update the target locale with full translated content (locale entry exists after ensureTargetLocaleExists)
        savedEntity = await strapi.documents(contentType as any).update({
          documentId: sourceEntity.documentId,
          locale: targetLocale,
          data: dataToSave,
        });
      }

      return savedEntity;
    } catch (error) {
      strapi.log.error(
        "Auto Translator: Error saving translated content",
        error,
      );
      throw error;
    }
  },

  /**
   * Rebuild content data from the translated fields structure
   */
  async rebuildContentFromFields(
    dataObject: any,
    fields: any,
    contentTypeSchema: any,
  ) {
    for (const [fieldName, fieldData] of Object.entries(fields)) {
      const data = fieldData as any;

      if (!data || !data.type) {
        continue;
      }

      switch (data.type) {
        case "string":
        case "text":
        case "richtext":
        case "blocks":
        case "email":
          // Restore simple translated text
          dataObject[fieldName] = data.value;

          break;

        case "dynamiczone":
          // Rebuild dynamic zone components

          if (data.components && Array.isArray(data.components)) {
            dataObject[fieldName] = [];

            for (let i = 0; i < data.components.length; i++) {
              const component = data.components[i];

              const componentData: any = {
                __component: component.__component,
              };

              if (component.content) {
                await this.rebuildComponentData(
                  componentData,
                  component.content,
                  1,
                  `${fieldName}[${i}]`,
                );
              }

              dataObject[fieldName].push(componentData);
            }
          }
          break;

        case "component":
          if (data.repeatable && data.items && Array.isArray(data.items)) {
            // Rebuild repeatable component items

            dataObject[fieldName] = [];

            for (let i = 0; i < data.items.length; i++) {
              const item = data.items[i];

              const itemData: any = {};

              if (item.content) {
                await this.rebuildComponentData(
                  itemData,
                  item.content,
                  1,
                  `${fieldName}[${i}]`,
                );
              }

              dataObject[fieldName].push(itemData);
            }
          } else if (data.content) {
            // Rebuild single component

            dataObject[fieldName] = {};
            await this.rebuildComponentData(
              dataObject[fieldName],
              data.content,
              1,
              fieldName,
            );
          }
          break;

        case "passthrough":
          // Restore non-translatable fields as-is (media, relations, numbers, etc.)
          dataObject[fieldName] = data.value;

          break;

        default:
          break;
      }
    }
  },

  /**
   * Rebuild component data from translated content
   * @param componentObject - The object to build the component data into
   * @param contentFields - The translated content fields to rebuild from
   * @param depth - Current nesting depth for logging (default: 0)
   * @param path - Path to this component for debugging (default: '')
   */
  async rebuildComponentData(
    componentObject: any,
    contentFields: any,
    depth: number = 0,
    path: string = "",
  ) {
    const depthPrefix = "  ".repeat(depth);

    for (const [fieldName, fieldData] of Object.entries(contentFields)) {
      const data = fieldData as any;
      const fieldPath = path ? `${path}.${fieldName}` : fieldName;

      if (!data || !data.type) {
        continue;
      }

      switch (data.type) {
        case "string":
        case "text":
        case "richtext":
        case "blocks":
        case "email":
          componentObject[fieldName] = data.value;

          break;

        case "component":
          if (data.repeatable && data.items && Array.isArray(data.items)) {
            componentObject[fieldName] = [];

            for (let i = 0; i < data.items.length; i++) {
              const item = data.items[i];
              const itemPath = `${fieldPath}[${i}]`;

              const itemData: any = {};

              if (item.content) {
                await this.rebuildComponentData(
                  itemData,
                  item.content,
                  depth + 1,
                  itemPath,
                );
              }

              componentObject[fieldName].push(itemData);
            }
          } else if (data.content) {
            componentObject[fieldName] = {};
            await this.rebuildComponentData(
              componentObject[fieldName],
              data.content,
              depth + 1,
              fieldPath,
            );
          }
          break;

        case "passthrough":
          // Restore non-translatable fields as-is (media, relations, numbers, etc.)
          componentObject[fieldName] = data.value;

          break;

        default:
          break;
      }
    }
  },
});

export default translatorService;
