import type { Core } from "@strapi/strapi";
import {
  getLocalizableFields,
  getFieldType,
  buildDeepPopulate,
} from "../utils";
import { createProvider } from "../providers";
import type { TranslationProvider } from "../providers";

/** Regex to detect field names that contain the word "url" (case-insensitive). */
const URL_FIELD_REGEX = /url/i;

/** Returns true if the field should be excluded from translation. */
function isExcludedField(fieldName: string, excludedSet: Set<string>): boolean {
  return excludedSet.has(fieldName) || URL_FIELD_REGEX.test(fieldName);
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
   * Switch providers via TRANSLATION_PROVIDER env var: 'openai' | 'aws'
   */
  async translateContent(
    content: any,
    sourceLocale: string,
    targetLocale: string,
  ) {
    try {
      const config = strapi.config.get('plugin::auto-translator') as any;

      strapi.log.info(`Auto Translator: Using provider: ${config?.translationProvider || 'openai'}`);

      const translateClient: TranslationProvider = createProvider({
        translationProvider: config?.translationProvider || 'openai',
        openai: config?.openai || {},
        aws: config?.aws || {},
      });

      // Clone the content structure
      const translatedContent = JSON.parse(JSON.stringify(content));

      // Fields to skip (handles, slugs, URLs stay as-is)
      const doNotTranslateFields =
        config?.doNotTranslateFields ?? ['handle', 'slug', 'url', 'href'];
      const excludedFieldNames = new Set(
        Array.isArray(doNotTranslateFields) ? doNotTranslateFields : [],
      );

      // Translate all fields
      await this.translateFields(
        translatedContent.fields,
        translateClient,
        sourceLocale,
        targetLocale,
        excludedFieldNames,
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
   */
  async translateFields(
    fields: any,
    translateClient: any,
    sourceLocale: string,
    targetLocale: string,
    excludedFieldNames: Set<string> = new Set(),
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
          if (isExcludedField(fieldName, excludedFieldNames)) {
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
          if (isExcludedField(fieldName, excludedFieldNames)) {
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
          const fieldSchema = contentTypeSchema.attributes[fieldName] as any;
          if (fieldSchema?.type === 'media') {
            // Skip media fields in data payload — Strapi v5 update() can't handle
            // media IDs and will disconnect existing relations on other locales.
            // Media is copied via copyMediaRelations() after save instead.
            continue;
          } else {
            dataToSave[fieldName] = sourceEntity[fieldName];
          }
        }
      }

      // Ensure "do not translate" fields (handle, slug, url, href) are always
      // populated from the source locale — same value as source, not translated
      const config = strapi.config.get("plugin::auto-translator") as any;
      const doNotTranslateFields =
        config?.doNotTranslateFields ?? ["handle", "slug", "url", "href"];
      const excludedNames = Array.isArray(doNotTranslateFields)
        ? doNotTranslateFields
        : [];
      for (const fieldName of excludedNames) {
        if (
          sourceEntity[fieldName] !== undefined &&
          contentTypeSchema.attributes?.[fieldName]
        ) {
          dataToSave[fieldName] = sourceEntity[fieldName];
        }
      }

      // Also copy any field whose name contains "url" from source (not already handled above)
      for (const fieldName of Object.keys(contentTypeSchema.attributes || {})) {
        if (!excludedNames.includes(fieldName) && URL_FIELD_REGEX.test(fieldName)) {
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

      // Media is handled by restoreMediaForAllRows() in the controller after publish.
      // We skip draft media here to avoid marking entries as "Modified".

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
   * Snapshot media file_ids for a document BEFORE translation starts.
   * Returns a map of { fieldName: file_id[] } so we can restore after Strapi
   * deletes/recreates rows and loses files_related_mph entries.
   */
  async snapshotMediaFileIds(contentType: string, documentId: string): Promise<Record<string, number[]>> {
    const snapshot: Record<string, number[]> = {};
    try {
      const contentTypeSchema = strapi.contentType(contentType as any);
      if (!contentTypeSchema) return snapshot;

      const collectionName = (contentTypeSchema as Record<string, unknown>).collectionName as string;
      if (!collectionName) return snapshot;

      const knex = strapi.db.connection;
      const relatedType = contentType;
      const localizableFields = getLocalizableFields(contentTypeSchema);

      // Get all row IDs for this document
      const rows = await knex.raw(
        `SELECT id FROM "${collectionName}" WHERE document_id = ?`,
        [documentId]
      );
      if (!rows?.rows?.length) return snapshot;

      for (const [fieldName, fieldDef] of Object.entries(contentTypeSchema.attributes as Record<string, Record<string, unknown>>)) {
        if ((fieldDef as Record<string, unknown>).type !== 'media') continue;
        if (localizableFields.includes(fieldName)) continue;

        for (const row of rows.rows) {
          const rels = await knex.raw(
            `SELECT file_id FROM files_related_mph WHERE related_id = ? AND related_type = ? AND field = ?`,
            [row.id, relatedType, fieldName]
          );
          if (rels?.rows?.length > 0) {
            snapshot[fieldName] = rels.rows.map((r: Record<string, unknown>) => r.file_id as number);
            break; // one source is enough
          }
        }
      }

      if (Object.keys(snapshot).length > 0) {
        strapi.log.info(`Auto Translator: Snapshot media for ${contentType} doc ${documentId}: ${JSON.stringify(snapshot)}`);
      }
    } catch (err) {
      strapi.log.warn(`Auto Translator: snapshotMediaFileIds error: ${(err as Error).message}`);
    }
    return snapshot;
  },

  /**
   * Restore media relations on PUBLISHED rows for a document.
   * Uses the pre-translation snapshot as source if no existing row has media.
   * Only targets published rows to avoid marking drafts as "Modified".
   */
  async restoreMediaForAllRows(
    contentType: string, documentId: string, _sourceLocale: string,
    mediaSnapshot?: Record<string, number[]>,
  ) {
    try {
      const contentTypeSchema = strapi.contentType(contentType as any);
      if (!contentTypeSchema) return;

      const collectionName = (contentTypeSchema as Record<string, unknown>).collectionName as string;
      if (!collectionName) return;

      const knex = strapi.db.connection;
      const relatedType = contentType;

      const localizableFields = getLocalizableFields(contentTypeSchema);
      const mediaFields: string[] = [];
      for (const [fieldName, fieldDef] of Object.entries(contentTypeSchema.attributes as Record<string, Record<string, unknown>>)) {
        if ((fieldDef as Record<string, unknown>).type === 'media' && !localizableFields.includes(fieldName)) {
          mediaFields.push(fieldName);
        }
      }
      if (mediaFields.length === 0) return;

      // Only restore on published rows to keep draft state clean
      const allRows = await knex.raw(
        `SELECT id FROM "${collectionName}" WHERE document_id = ? AND published_at IS NOT NULL`,
        [documentId]
      );
      if (!allRows?.rows?.length) return;

      for (const field of mediaFields) {
        // Try to find file_ids from existing rows first
        let fileIds: number[] = [];
        for (const row of allRows.rows) {
          const rels = await knex.raw(
            `SELECT file_id FROM files_related_mph WHERE related_id = ? AND related_type = ? AND field = ?`,
            [row.id, relatedType, field]
          );
          if (rels?.rows?.length > 0) {
            fileIds = rels.rows.map((r: Record<string, unknown>) => r.file_id as number);
            break;
          }
        }

        // Fall back to snapshot if no row has media (all were lost)
        if (fileIds.length === 0 && mediaSnapshot?.[field]?.length) {
          fileIds = mediaSnapshot[field];
          strapi.log.info(`Auto Translator: Using snapshot for "${field}" — file_ids: ${JSON.stringify(fileIds)}`);
        }

        if (fileIds.length === 0) continue;

        for (const row of allRows.rows) {
          const existing = await knex.raw(
            `SELECT id FROM files_related_mph WHERE related_id = ? AND related_type = ? AND field = ?`,
            [row.id, relatedType, field]
          );
          if (existing?.rows?.length > 0) continue;

          const maxOrder = await knex.raw(`SELECT COALESCE(MAX("order"), 0) as max_order FROM files_related_mph`);
          let nextOrder = ((maxOrder?.rows?.[0]?.max_order as number) || 0) + 1;

          for (const fileId of fileIds) {
            await knex.raw(
              `INSERT INTO files_related_mph (file_id, related_id, related_type, field, "order") VALUES (?, ?, ?, ?, ?)`,
              [fileId, row.id, relatedType, field, nextOrder++]
            );
          }
        }
        strapi.log.info(`Auto Translator: Restored media "${field}" on published rows for ${contentType} document ${documentId}`);
      }
    } catch (err) {
      strapi.log.warn(`Auto Translator: restoreMediaForAllRows error: ${(err as Error).message}`);
    }
  },

  /**
   * Copy media file relations from source entity to target entity via raw DB.
   * Strapi v5 Document Service update() silently ignores media IDs in data,
   * so we insert files_related_mph rows directly.
   *
   * We look for media on the PUBLISHED source row first (draft rows may not
   * have the relation), then fall back to the draft row.
   */
  async copyMediaRelations(
    contentType: string,
    sourceEntity: Record<string, unknown>,
    targetEntity: Record<string, unknown>,
  ) {
    try {
      const contentTypeSchema = strapi.contentType(contentType as any);
      if (!contentTypeSchema) return;

      const collectionName = (contentTypeSchema as Record<string, unknown>).collectionName as string;
      if (!collectionName) return;

      const localizableFields = getLocalizableFields(contentTypeSchema);
      const relatedType = contentType; // e.g. "api::application.application"

      for (const [fieldName, fieldDef] of Object.entries(contentTypeSchema.attributes as Record<string, Record<string, unknown>>)) {
        if ((fieldDef as Record<string, unknown>).type !== 'media') continue;
        if (localizableFields.includes(fieldName)) continue; // only copy non-localized media

        const targetId = targetEntity.id;
        if (!targetId) continue;

        // Check if target already has this media relation
        const existingTarget = await strapi.db.connection.raw(
          `SELECT id FROM files_related_mph WHERE related_id = ? AND related_type = ? AND field = ?`,
          [targetId, relatedType, fieldName]
        );

        if (existingTarget?.rows?.length > 0) continue; // already has media

        // Find the published source row for this document+locale to get the media relation
        // (draft rows often don't have the files_related_mph entry)
        const sourceDocId = sourceEntity.documentId as string;
        const sourceLocale = sourceEntity.locale as string || 'en';

        // Get published row ID for source locale
        const publishedSource = await strapi.db.connection.raw(
          `SELECT id FROM "${collectionName}" WHERE document_id = ? AND locale = ? AND published_at IS NOT NULL LIMIT 1`,
          [sourceDocId, sourceLocale]
        );

        // Also try draft row as fallback
        const draftSource = await strapi.db.connection.raw(
          `SELECT id FROM "${collectionName}" WHERE document_id = ? AND locale = ? AND published_at IS NULL LIMIT 1`,
          [sourceDocId, sourceLocale]
        );

        // Try published first, then draft
        const sourceIds: number[] = [];
        if (publishedSource?.rows?.[0]?.id) sourceIds.push(publishedSource.rows[0].id);
        if (draftSource?.rows?.[0]?.id) sourceIds.push(draftSource.rows[0].id);

        let sourceRelations: { rows: Array<{ file_id: number; order: number }> } | null = null;
        for (const srcId of sourceIds) {
          const rels = await strapi.db.connection.raw(
            `SELECT file_id, "order" FROM files_related_mph WHERE related_id = ? AND related_type = ? AND field = ?`,
            [srcId, relatedType, fieldName]
          );
          if (rels?.rows?.length > 0) {
            sourceRelations = rels;
            break;
          }
        }

        if (!sourceRelations?.rows?.length) continue;

        // Get next sort order
        const maxOrder = await strapi.db.connection.raw(
          `SELECT COALESCE(MAX("order"), 0) as max_order FROM files_related_mph`
        );
        let nextOrder = ((maxOrder?.rows?.[0]?.max_order as number) || 0) + 1;

        // Insert relations for target
        for (const row of sourceRelations.rows) {
          await strapi.db.connection.raw(
            `INSERT INTO files_related_mph (file_id, related_id, related_type, field, "order") VALUES (?, ?, ?, ?, ?)`,
            [row.file_id, targetId, relatedType, fieldName, nextOrder++]
          );
        }

        strapi.log.info(
          `Auto Translator: Copied media relation "${fieldName}" from source to entry ${targetId} (${contentType})`
        );
      }
    } catch (error) {
      strapi.log.warn(
        `Auto Translator: Failed to copy media relations: ${(error as Error).message}`
      );
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
