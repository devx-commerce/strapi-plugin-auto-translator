const register = ({ strapi }) => {
  strapi.log.info("Auto Translator plugin registered");
};
const bootstrap = ({ strapi }) => {
  const config2 = strapi.config.get("plugin::auto-translator");
  const provider = config2?.translationProvider || "openai";
  strapi.log.info(`Auto Translator plugin bootstrapped (provider: ${provider})`);
  if (provider === "openai") {
    try {
      require.resolve("openai");
    } catch {
      strapi.log.warn(
        'Auto Translator: Provider "openai" selected but "openai" package is not installed. Translation will fail at runtime. Install it with: npm install openai'
      );
    }
    if (!config2?.openai?.apiKey) {
      strapi.log.warn(
        'Auto Translator: Provider "openai" selected but no API key configured. Set OPENAI_API_KEY in your .env file or configure openai.apiKey in plugins.ts'
      );
    }
  } else if (provider === "aws") {
    try {
      require.resolve("@aws-sdk/client-translate");
    } catch {
      strapi.log.warn(
        'Auto Translator: Provider "aws" selected but "@aws-sdk/client-translate" package is not installed. Translation will fail at runtime. Install it with: npm install @aws-sdk/client-translate'
      );
    }
  }
};
const destroy = ({ strapi }) => {
  strapi.log.info("Auto Translator plugin destroyed");
};
const DEFAULT_DO_NOT_TRANSLATE_FIELDS = [
  "handle",
  "slug",
  "url",
  "href"
];
const config = {
  default: {
    /** Translation provider to use: 'openai' | 'aws' */
    translationProvider: process.env.TRANSLATION_PROVIDER || "openai",
    /** OpenAI provider configuration */
    openai: {
      /** OpenAI API key */
      apiKey: process.env.OPENAI_API_KEY || "",
      /** Model to use for translations (e.g. 'gpt-4o-mini', 'gpt-4o') */
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      /** Temperature for translation (lower = more consistent) */
      temperature: 0.1,
      /**
       * Custom system prompt for plain text translation.
       * Use {sourceLang} and {targetLang} as placeholders.
       * Leave empty to use the built-in default.
       */
      systemPromptText: "",
      /**
       * Custom system prompt for HTML translation.
       * Use {sourceLang} and {targetLang} as placeholders.
       * Leave empty to use the built-in default.
       */
      systemPromptHtml: ""
    },
    /** AWS Translate provider configuration */
    aws: {
      /** AWS region for the Translate service */
      region: process.env.AWS_REGION || "us-east-1",
      /**
       * AWS access key ID. If not provided, the AWS SDK will use its
       * default credential chain (env vars, instance profile, ECS task role, etc.)
       */
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      /** AWS secret access key */
      secretAccessKey: process.env.AWS_ACCESS_SECRET || ""
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
    mediaSnapshotRestore: true
  },
  validator(config2) {
    if (config2.translationProvider && !["openai", "aws"].includes(config2.translationProvider)) {
      throw new Error(
        `[auto-translator] Invalid translationProvider "${config2.translationProvider}". Must be "openai" or "aws".`
      );
    }
    if (config2.doNotTranslateFields && !Array.isArray(config2.doNotTranslateFields)) {
      throw new Error(
        `[auto-translator] doNotTranslateFields must be an array of strings.`
      );
    }
    if (config2.openai?.temperature !== void 0) {
      const temp = config2.openai.temperature;
      if (typeof temp !== "number" || temp < 0 || temp > 2) {
        throw new Error(
          `[auto-translator] openai.temperature must be a number between 0 and 2.`
        );
      }
    }
  }
};
const contentTypes = {};
const isI18nEnabled = (contentType) => {
  return contentType?.pluginOptions?.i18n?.localized === true;
};
const getLocalizableFields = (contentType) => {
  if (!isI18nEnabled(contentType)) {
    return [];
  }
  const localizableFields = [];
  const attributes = contentType.attributes || {};
  Object.keys(attributes).forEach((fieldName) => {
    const field = attributes[fieldName];
    const isLocalized = field?.pluginOptions?.i18n?.localized === true;
    const isSystemField = [
      "createdAt",
      "updatedAt",
      "publishedAt",
      "createdBy",
      "updatedBy",
      "locale",
      "localizations"
    ].includes(fieldName);
    if (isLocalized && !isSystemField) {
      localizableFields.push(fieldName);
    }
  });
  return localizableFields;
};
const getContentTypeUid = (apiName) => {
  if (apiName.startsWith("api::")) {
    return apiName;
  }
  return `api::${apiName}.${apiName}`;
};
const getFieldType = (field) => {
  return field?.type || "string";
};
const buildDeepPopulate = (contentTypeSchema, strapi, maxDepth = 10) => {
  const populate = {};
  if (!contentTypeSchema || !contentTypeSchema.attributes) {
    return populate;
  }
  const buildPopulateForAttributes = (attributes, currentDepth, path = "") => {
    if (currentDepth >= maxDepth) {
      return true;
    }
    const result = {};
    for (const [fieldName, fieldSchema] of Object.entries(attributes)) {
      const field = fieldSchema;
      const fieldType = field?.type;
      const fieldPath = path ? `${path}.${fieldName}` : fieldName;
      switch (fieldType) {
        case "media":
          result[fieldName] = true;
          break;
        case "relation":
          result[fieldName] = true;
          break;
        case "component":
          if (field.component) {
            const componentSchema = strapi?.components?.[field.component];
            if (componentSchema && componentSchema.attributes) {
              const nestedPopulate = buildPopulateForAttributes(
                componentSchema.attributes,
                currentDepth + 1,
                fieldPath
              );
              if (nestedPopulate === true) {
                result[fieldName] = { populate: "*" };
              } else if (Object.keys(nestedPopulate).length > 0) {
                result[fieldName] = { populate: nestedPopulate };
              } else {
                result[fieldName] = { populate: "*" };
              }
            } else {
              result[fieldName] = { populate: "*" };
            }
          }
          break;
        case "dynamiczone":
          if (field.components && Array.isArray(field.components)) {
            const dzOn = {};
            for (const componentName of field.components) {
              const componentSchema = strapi?.components?.[componentName];
              if (componentSchema && componentSchema.attributes) {
                const componentPopulate = buildPopulateForAttributes(
                  componentSchema.attributes,
                  currentDepth + 1,
                  `${fieldPath}[${componentName}]`
                );
                if (componentPopulate === true || Object.keys(componentPopulate).length === 0) {
                  dzOn[componentName] = { populate: "*" };
                } else {
                  dzOn[componentName] = { populate: componentPopulate };
                }
              } else {
                dzOn[componentName] = { populate: "*" };
              }
            }
            if (Object.keys(dzOn).length > 0) {
              result[fieldName] = { on: dzOn };
            } else {
              result[fieldName] = { populate: "*" };
            }
          } else {
            result[fieldName] = { populate: "*" };
          }
          break;
      }
    }
    const hasFields = Object.keys(result).length > 0;
    return hasFields ? result : {};
  };
  const finalPopulate = buildPopulateForAttributes(
    contentTypeSchema.attributes,
    0
  );
  return finalPopulate;
};
const translatorController = ({ strapi }) => ({
  /**
   * Get available locales from i18n plugin
   */
  async getLocales(ctx) {
    try {
      const translatorService2 = strapi.plugin("auto-translator").service("translator");
      const locales = await translatorService2.getAvailableLocales();
      ctx.body = {
        data: locales
      };
    } catch (error) {
      strapi.log.error("Auto Translator: Error in getLocales controller", error);
      ctx.throw(500, error);
    }
  },
  /**
   * Check if content type has i18n enabled
   */
  async checkI18n(ctx) {
    try {
      const { contentType } = ctx.query;
      if (!contentType) {
        return ctx.badRequest("Content type is required");
      }
      const uid = getContentTypeUid(contentType);
      const contentTypeSchema = strapi.contentTypes[uid];
      if (!contentTypeSchema) {
        return ctx.notFound("Content type not found");
      }
      const enabled = isI18nEnabled(contentTypeSchema);
      ctx.body = {
        data: {
          contentType: uid,
          i18nEnabled: enabled
        }
      };
    } catch (error) {
      strapi.log.error("Auto Translator: Error in checkI18n controller", error);
      ctx.throw(500, error);
    }
  },
  /**
   * Get translatable content from an entry (for testing)
   */
  async getTranslatableContent(ctx) {
    try {
      const { contentType, documentId, locale } = ctx.query;
      if (!contentType || !documentId || !locale) {
        return ctx.badRequest("contentType, documentId, and locale are required");
      }
      const translatorService2 = strapi.plugin("auto-translator").service("translator");
      const content = await translatorService2.extractTranslatableContent(
        contentType,
        documentId,
        locale
      );
      ctx.body = {
        data: content
      };
    } catch (error) {
      strapi.log.error("Auto Translator: Error in getTranslatableContent controller", error);
      ctx.throw(500, error);
    }
  },
  /**
   * Translate content to target locale
   */
  async translate(ctx) {
    try {
      const { contentType, documentId, sourceLocale, targetLocale, isSingleType } = ctx.request.body.data || {};
      if (!contentType || !sourceLocale || !targetLocale) {
        return ctx.badRequest("contentType, sourceLocale, and targetLocale are required");
      }
      if (!isSingleType && !documentId) {
        return ctx.badRequest("documentId is required for collection types");
      }
      const config2 = strapi.config.get("plugin::auto-translator");
      const translatorService2 = strapi.plugin("auto-translator").service("translator");
      const mediaSnapshotEnabled = config2?.mediaSnapshotRestore !== false;
      const mediaSnapshot = mediaSnapshotEnabled ? await translatorService2.snapshotMediaFileIds(contentType, documentId) : {};
      const translatableContent = await translatorService2.extractTranslatableContent(
        contentType,
        documentId,
        sourceLocale,
        isSingleType
      );
      await translatorService2.ensureTargetLocaleExists(contentType, documentId, targetLocale, isSingleType);
      const translatedContent = await translatorService2.translateContent(
        translatableContent,
        sourceLocale,
        targetLocale
      );
      const savedEntity = await translatorService2.saveTranslatedContent(
        contentType,
        documentId,
        translatedContent,
        targetLocale,
        isSingleType
      );
      const autoPublish = config2?.autoPublish !== false;
      let publishDocumentId;
      if (autoPublish) {
        publishDocumentId = isSingleType ? savedEntity?.documentId : documentId;
        if (!publishDocumentId && isSingleType) {
          const entry = await strapi.documents(contentType).findFirst({});
          publishDocumentId = entry?.documentId;
        }
        if (publishDocumentId) {
          await strapi.documents(contentType).publish({
            documentId: publishDocumentId,
            locale: targetLocale
          });
          strapi.log.info(
            `Auto Translator: Published ${contentType} documentId ${publishDocumentId} locale ${targetLocale}`
          );
          if (mediaSnapshotEnabled) {
            const publishedEntry = await strapi.documents(contentType).findOne({
              documentId: publishDocumentId,
              locale: targetLocale,
              status: "published"
            });
            if (publishedEntry) {
              const sourcePublished = await strapi.documents(contentType).findOne({
                documentId: publishDocumentId,
                locale: sourceLocale,
                status: "published"
              });
              if (sourcePublished) {
                await translatorService2.copyMediaRelations(
                  contentType,
                  sourcePublished,
                  publishedEntry
                );
              }
            }
          }
        } else {
          strapi.log.warn(
            `Auto Translator: Could not publish – no documentId resolved (savedEntity: ${JSON.stringify(savedEntity)})`
          );
        }
      }
      if (mediaSnapshotEnabled && publishDocumentId) {
        await translatorService2.restoreMediaForAllRows(contentType, publishDocumentId, sourceLocale, mediaSnapshot);
      }
      ctx.body = {
        data: savedEntity,
        message: "Translation completed successfully"
      };
    } catch (error) {
      strapi.log.error("Auto Translator: Error in translate controller", error);
      ctx.throw(500, error);
    }
  }
});
const controllers = {
  translator: translatorController
};
const adminRoutes = [
  {
    method: "GET",
    path: "/locales",
    handler: "translator.getLocales",
    config: {
      policies: []
    }
  },
  {
    method: "GET",
    path: "/check-i18n",
    handler: "translator.checkI18n",
    config: {
      policies: []
    }
  },
  {
    method: "GET",
    path: "/translatable-content",
    handler: "translator.getTranslatableContent",
    config: {
      policies: []
    }
  },
  {
    method: "POST",
    path: "/translate",
    handler: "translator.translate",
    config: {
      policies: []
    }
  }
];
const contentApiRoutes = [
  {
    method: "GET",
    path: "/locales",
    handler: "translator.getLocales",
    config: {
      policies: [],
      auth: false
    }
  },
  {
    method: "GET",
    path: "/check-i18n",
    handler: "translator.checkI18n",
    config: {
      policies: [],
      auth: false
    }
  },
  {
    method: "GET",
    path: "/translatable-content",
    handler: "translator.getTranslatableContent",
    config: {
      policies: [],
      auth: false
    }
  },
  {
    method: "POST",
    path: "/translate",
    handler: "translator.translate",
    config: {
      policies: [],
      auth: false
    }
  }
];
const routes = {
  admin: {
    type: "admin",
    routes: adminRoutes
  },
  "content-api": {
    type: "content-api",
    routes: contentApiRoutes
  }
};
const middlewares = {};
const policies = {};
function createProvider(config2) {
  const provider = config2.translationProvider || "openai";
  switch (provider) {
    case "aws": {
      try {
        const { createAWSProvider } = require("./aws");
        return createAWSProvider(config2.aws);
      } catch (err) {
        if (err.code === "MODULE_NOT_FOUND") {
          throw new Error(
            `Auto Translator: Provider "aws" requires the "@aws-sdk/client-translate" package. Install it with: npm install @aws-sdk/client-translate`
          );
        }
        throw err;
      }
    }
    case "openai": {
      try {
        const { createOpenAIProvider } = require("./openai");
        return createOpenAIProvider(config2.openai);
      } catch (err) {
        if (err.code === "MODULE_NOT_FOUND") {
          throw new Error(
            `Auto Translator: Provider "openai" requires the "openai" package. Install it with: npm install openai`
          );
        }
        throw err;
      }
    }
    default:
      throw new Error(
        `Auto Translator: Unknown translation provider "${provider}". Supported providers: "openai", "aws".`
      );
  }
}
const URL_FIELD_REGEX = /url/i;
function isExcludedField(fieldName, excludedSet) {
  return excludedSet.has(fieldName) || URL_FIELD_REGEX.test(fieldName);
}
const translatorService = ({ strapi }) => ({
  /**
   * Get available locales from i18n plugin configuration
   */
  async getAvailableLocales() {
    try {
      const i18nPlugin = strapi.plugin("i18n");
      if (!i18nPlugin) {
        strapi.log.warn("Auto Translator: i18n plugin is not enabled");
        return [];
      }
      const localesService = i18nPlugin.service("locales");
      const locales = await localesService.find();
      return locales.map((locale) => ({
        code: locale.code,
        name: locale.name,
        isDefault: locale.isDefault
      }));
    } catch (error) {
      strapi.log.error("Auto Translator: Error fetching locales", error);
      return [];
    }
  },
  /**
   * Extract translatable content from an entry
   */
  async extractTranslatableContent(contentType, documentId, locale, isSingleType = false) {
    try {
      const contentTypeSchema = strapi.contentType(contentType);
      if (!contentTypeSchema) {
        throw new Error(`Content type ${contentType} not found`);
      }
      const populateQuery = buildDeepPopulate(contentTypeSchema, strapi);
      let entity;
      if (isSingleType) {
        entity = await strapi.documents(contentType).findFirst({
          locale,
          populate: populateQuery
        });
      } else {
        if (!documentId) {
          return null;
        }
        entity = await strapi.documents(contentType).findOne({
          documentId,
          locale,
          populate: populateQuery
        });
      }
      if (!entity) {
        const identifier = isSingleType ? `single type ${contentType}` : `document with ID ${documentId}`;
        throw new Error(`${identifier} not found for locale ${locale}`);
      }
      const localizableFields = getLocalizableFields(contentTypeSchema);
      const translatableContent = {
        fields: {},
        meta: {
          contentType,
          documentId: documentId || entity.documentId,
          locale,
          isSingleType
        }
      };
      for (const fieldName of localizableFields) {
        const fieldValue = entity[fieldName];
        const fieldSchema = contentTypeSchema.attributes[fieldName];
        const fieldType = getFieldType(fieldSchema);
        if (fieldValue !== null && fieldValue !== void 0) {
          switch (fieldType) {
            case "string":
            case "text":
            case "richtext":
            case "email":
              translatableContent.fields[fieldName] = {
                type: fieldType,
                value: fieldValue
              };
              break;
            case "blocks":
              translatableContent.fields[fieldName] = {
                type: "blocks",
                value: fieldValue
              };
              break;
            case "dynamiczone":
              if (Array.isArray(fieldValue)) {
                translatableContent.fields[fieldName] = {
                  type: "dynamiczone",
                  components: await this.extractDynamicZoneContent(
                    fieldValue,
                    20,
                    fieldName
                  )
                };
              }
              break;
            case "component":
              const componentSchema = fieldSchema;
              if (componentSchema.repeatable && Array.isArray(fieldValue)) {
                translatableContent.fields[fieldName] = {
                  type: "component",
                  repeatable: true,
                  componentName: componentSchema.component,
                  items: await this.extractComponentContent(
                    componentSchema.component,
                    fieldValue,
                    1,
                    fieldName
                  )
                };
              } else if (fieldValue && typeof fieldValue === "object") {
                translatableContent.fields[fieldName] = {
                  type: "component",
                  repeatable: false,
                  componentName: componentSchema.component,
                  content: await this.extractComponentFields(
                    componentSchema.component,
                    fieldValue,
                    1,
                    fieldName
                  )
                };
              }
              break;
            case "media":
            case "relation":
              translatableContent.fields[fieldName] = {
                type: "passthrough",
                value: fieldValue
              };
              break;
            default:
              translatableContent.fields[fieldName] = {
                type: "passthrough",
                value: fieldValue
              };
              break;
          }
        }
      }
      return translatableContent;
    } catch (error) {
      strapi.log.error(
        "Auto Translator: Error extracting translatable content",
        error
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
  async extractDynamicZoneContent(components, depth = 0, path = "") {
    const dzPath = path ? `${path}[]` : "dynamiczone[]";
    const extractedComponents = [];
    for (let i = 0; i < components.length; i++) {
      const component = components[i];
      const itemPath = `${dzPath}[${i}]`;
      if (component && component.__component) {
        const componentContent = await this.extractComponentFields(
          component.__component,
          component,
          depth,
          itemPath
        );
        extractedComponents.push({
          __component: component.__component,
          id: component.id,
          content: componentContent
        });
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
  async extractComponentFields(componentName, componentData, depth = 0, path = "") {
    const componentPath = path ? `${path}.${componentName}` : componentName;
    const componentSchema = strapi.components[componentName];
    if (!componentSchema) {
      strapi.log.warn(`Component schema not found for ${componentName}`);
      return {};
    }
    const translatableFields = {};
    const attributes = componentSchema.attributes || {};
    for (const [fieldName, fieldSchema] of Object.entries(attributes)) {
      const fieldValue = componentData[fieldName];
      const fieldType = getFieldType(fieldSchema);
      const fieldPath = `${componentPath}.${fieldName}`;
      if (fieldValue !== null && fieldValue !== void 0) {
        switch (fieldType) {
          case "string":
          case "text":
          case "richtext":
          case "email":
            translatableFields[fieldName] = {
              type: fieldType,
              value: fieldValue
            };
            break;
          case "blocks":
            translatableFields[fieldName] = {
              type: "blocks",
              value: fieldValue
            };
            break;
          case "component":
            const typedFieldSchema = fieldSchema;
            if (typedFieldSchema.repeatable && Array.isArray(fieldValue)) {
              translatableFields[fieldName] = {
                type: "component",
                repeatable: true,
                componentName: typedFieldSchema.component,
                items: await this.extractComponentContent(
                  typedFieldSchema.component,
                  fieldValue,
                  depth + 1,
                  fieldPath
                )
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
                  fieldPath
                )
              };
            } else ;
            break;
          default:
            translatableFields[fieldName] = {
              type: "passthrough",
              value: fieldValue
            };
            break;
        }
      }
    }
    Object.keys(translatableFields).length;
    return translatableFields;
  },
  /**
   * Extract content from repeatable components
   * @param componentName - The component identifier
   * @param components - Array of component data
   * @param depth - Current nesting depth for logging (default: 0)
   * @param path - Path to this component array for debugging (default: '')
   */
  async extractComponentContent(componentName, components, depth = 0, path = "") {
    const componentPath = path ? `${path}[]` : `${componentName}[]`;
    const extractedItems = [];
    for (let i = 0; i < components.length; i++) {
      const component = components[i];
      const itemPath = `${componentPath}[${i}]`;
      if (component) {
        const componentContent = await this.extractComponentFields(
          componentName,
          component,
          depth,
          itemPath
        );
        extractedItems.push({
          id: component.id,
          content: componentContent
        });
      }
    }
    return extractedItems;
  },
  /**
   * Translate content using the configured provider (openai by default, aws as fallback).
   * Switch providers via TRANSLATION_PROVIDER env var: 'openai' | 'aws'
   */
  async translateContent(content, sourceLocale, targetLocale) {
    try {
      const config2 = strapi.config.get("plugin::auto-translator");
      strapi.log.info(`Auto Translator: Using provider: ${config2?.translationProvider || "openai"}`);
      const translateClient = createProvider({
        translationProvider: config2?.translationProvider || "openai",
        openai: config2?.openai || {},
        aws: config2?.aws || {}
      });
      const translatedContent = JSON.parse(JSON.stringify(content));
      const doNotTranslateFields = config2?.doNotTranslateFields ?? ["handle", "slug", "url", "href"];
      const excludedFieldNames = new Set(
        Array.isArray(doNotTranslateFields) ? doNotTranslateFields : []
      );
      await this.translateFields(
        translatedContent.fields,
        translateClient,
        sourceLocale,
        targetLocale,
        excludedFieldNames
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
  async translateFields(fields, translateClient, sourceLocale, targetLocale, excludedFieldNames = /* @__PURE__ */ new Set()) {
    for (const [fieldName, fieldData] of Object.entries(fields)) {
      const data = fieldData;
      if (!data || !data.type) {
        continue;
      }
      switch (data.type) {
        case "string":
        case "text":
        case "email":
          if (isExcludedField(fieldName, excludedFieldNames)) {
            break;
          }
          if (data.value && typeof data.value === "string") {
            data.value = await this.translateText(
              data.value,
              translateClient,
              sourceLocale,
              targetLocale
            );
          }
          break;
        case "richtext":
          if (isExcludedField(fieldName, excludedFieldNames)) {
            break;
          }
          if (data.value && typeof data.value === "string") {
            data.value = await this.translateRichText(
              data.value,
              translateClient,
              sourceLocale,
              targetLocale
            );
          }
          break;
        case "blocks":
          if (data.value && Array.isArray(data.value)) {
            data.value = await this.translateBlocks(
              data.value,
              translateClient,
              sourceLocale,
              targetLocale
            );
          }
          break;
        case "dynamiczone":
          if (data.components && Array.isArray(data.components)) {
            for (const component of data.components) {
              if (component.content) {
                await this.translateFields(
                  component.content,
                  translateClient,
                  sourceLocale,
                  targetLocale,
                  excludedFieldNames
                );
              }
            }
          }
          break;
        case "component":
          if (data.repeatable && data.items && Array.isArray(data.items)) {
            for (const item of data.items) {
              if (item.content) {
                await this.translateFields(
                  item.content,
                  translateClient,
                  sourceLocale,
                  targetLocale,
                  excludedFieldNames
                );
              }
            }
          } else if (data.content) {
            await this.translateFields(
              data.content,
              translateClient,
              sourceLocale,
              targetLocale,
              excludedFieldNames
            );
          }
          break;
      }
    }
  },
  /**
   * Translate plain text using the active translation provider.
   */
  async translateText(text, translateClient, sourceLocale, targetLocale) {
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
        error
      );
      return text;
    }
  },
  /**
   * Translate rich text content (HTML) using the active translation provider.
   */
  async translateRichText(html, translateClient, sourceLocale, targetLocale) {
    try {
      if (!html || html.trim() === "") {
        return html;
      }
      const sourceLang = this.convertLocaleToLanguageCode(sourceLocale);
      const targetLang = this.convertLocaleToLanguageCode(targetLocale);
      return await translateClient.translateHtml(html, sourceLang, targetLang);
    } catch (error) {
      strapi.log.error("Auto Translator: Error translating rich text", error);
      return html;
    }
  },
  /**
   * Translate a Strapi v5 Blocks editor JSON array, recursively translating all text leaves.
   */
  async translateBlocks(blocks, translateClient, sourceLocale, targetLocale) {
    const cloned = JSON.parse(JSON.stringify(blocks));
    await this.translateBlockNodes(cloned, translateClient, sourceLocale, targetLocale);
    return cloned;
  },
  async translateBlockNodes(nodes, translateClient, sourceLocale, targetLocale) {
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
  convertLocaleToLanguageCode(locale) {
    const parts = locale.split("-");
    return parts[0].toLowerCase();
  },
  /**
   * Build minimal/blank data from content-type schema for creating a locale entry.
   * Only includes required attributes with safe defaults so validation passes.
   */
  buildMinimalDataForContentType(contentTypeSchema) {
    const minimalData = {};
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
      "localizations"
    ];
    for (const [fieldName, fieldSchema] of Object.entries(attributes)) {
      if (systemFields.includes(fieldName)) {
        continue;
      }
      const field = fieldSchema;
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
          minimalData[fieldName] = field?.default !== void 0 ? field.default : Array.isArray(enumValues) && enumValues.length > 0 ? enumValues[0] : "";
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
  async ensureTargetLocaleExists(contentType, sourceDocumentId, targetLocale, isSingleType = false) {
    const contentTypeSchema = strapi.contentType(contentType);
    if (!contentTypeSchema) {
      throw new Error(`Content type ${contentType} not found`);
    }
    let documentId = sourceDocumentId;
    if (isSingleType) {
      const anyLocaleEntry = await strapi.documents(contentType).findFirst({});
      if (!anyLocaleEntry) {
        throw new Error(`Single type ${contentType} has no document`);
      }
      documentId = anyLocaleEntry.documentId;
    }
    const existingEntry = await strapi.documents(contentType).findOne({
      documentId,
      locale: targetLocale
    });
    if (existingEntry) {
      return;
    }
    const minimalData = this.buildMinimalDataForContentType(contentTypeSchema);
    strapi.log.info(
      `Auto Translator: Creating blank locale entry for ${contentType} in locale ${targetLocale}`
    );
    await strapi.documents(contentType).update({
      documentId,
      locale: targetLocale,
      data: minimalData
    });
  },
  /**
   * Save translated content as a new locale entry
   */
  async saveTranslatedContent(contentType, sourceDocumentId, translatedContent, targetLocale, isSingleType = false) {
    try {
      await this.ensureTargetLocaleExists(
        contentType,
        sourceDocumentId,
        targetLocale,
        isSingleType
      );
      const contentTypeSchema = strapi.contentType(contentType);
      if (!contentTypeSchema) {
        throw new Error(`Content type ${contentType} not found`);
      }
      const populateQuery = buildDeepPopulate(contentTypeSchema, strapi);
      let sourceEntity;
      if (isSingleType) {
        sourceEntity = await strapi.documents(contentType).findFirst({
          locale: translatedContent.meta.locale,
          populate: populateQuery
        });
      } else {
        if (!sourceDocumentId) {
          return null;
        }
        sourceEntity = await strapi.documents(contentType).findOne({
          documentId: sourceDocumentId,
          locale: translatedContent.meta.locale,
          populate: populateQuery
        });
      }
      if (!sourceEntity) {
        const identifier = isSingleType ? `single type ${contentType}` : `document with ID ${sourceDocumentId}`;
        throw new Error(`Source ${identifier} not found`);
      }
      const dataToSave = {};
      await this.rebuildContentFromFields(
        dataToSave,
        translatedContent.fields,
        contentTypeSchema
      );
      const localizableFields = getLocalizableFields(contentTypeSchema);
      const allFieldNames = Object.keys(contentTypeSchema.attributes);
      for (const fieldName of allFieldNames) {
        if ([
          "id",
          "documentId",
          "createdAt",
          "updatedAt",
          "publishedAt",
          "createdBy",
          "updatedBy",
          "locale",
          "localizations"
        ].includes(fieldName)) {
          continue;
        }
        if (!localizableFields.includes(fieldName) && sourceEntity[fieldName] !== void 0) {
          const fieldSchema = contentTypeSchema.attributes[fieldName];
          if (fieldSchema?.type === "media") {
            continue;
          } else {
            dataToSave[fieldName] = sourceEntity[fieldName];
          }
        }
      }
      const config2 = strapi.config.get("plugin::auto-translator");
      const doNotTranslateFields = config2?.doNotTranslateFields ?? ["handle", "slug", "url", "href"];
      const excludedNames = Array.isArray(doNotTranslateFields) ? doNotTranslateFields : [];
      for (const fieldName of excludedNames) {
        if (sourceEntity[fieldName] !== void 0 && contentTypeSchema.attributes?.[fieldName]) {
          dataToSave[fieldName] = sourceEntity[fieldName];
        }
      }
      for (const fieldName of Object.keys(contentTypeSchema.attributes || {})) {
        if (!excludedNames.includes(fieldName) && URL_FIELD_REGEX.test(fieldName)) {
          if (sourceEntity[fieldName] !== void 0) {
            dataToSave[fieldName] = sourceEntity[fieldName];
          }
        }
      }
      let savedEntity;
      if (isSingleType) {
        strapi.log.info(
          `Auto Translator: Updating single type locale entry for ${contentType} in locale ${targetLocale}`
        );
        savedEntity = await strapi.documents(contentType).update({
          documentId: sourceEntity.documentId,
          locale: targetLocale,
          data: dataToSave
        });
      } else {
        const existingLocaleEntry = await strapi.documents(contentType).findOne({
          documentId: sourceEntity.documentId,
          locale: targetLocale
        });
        if (existingLocaleEntry) {
          strapi.log.info(
            `Auto Translator: Updating existing locale entry for ${contentType} documentId ${sourceEntity.documentId} in locale ${targetLocale}`
          );
        } else {
          strapi.log.info(
            `Auto Translator: Saving translated content to locale entry for ${contentType} documentId ${sourceEntity.documentId} in locale ${targetLocale} (blank entry was created by ensureTargetLocaleExists)`
          );
        }
        savedEntity = await strapi.documents(contentType).update({
          documentId: sourceEntity.documentId,
          locale: targetLocale,
          data: dataToSave
        });
      }
      return savedEntity;
    } catch (error) {
      strapi.log.error(
        "Auto Translator: Error saving translated content",
        error
      );
      throw error;
    }
  },
  /**
   * Snapshot media file_ids for a document BEFORE translation starts.
   * Returns a map of { fieldName: file_id[] } so we can restore after Strapi
   * deletes/recreates rows and loses files_related_mph entries.
   */
  async snapshotMediaFileIds(contentType, documentId) {
    const snapshot = {};
    try {
      const contentTypeSchema = strapi.contentType(contentType);
      if (!contentTypeSchema) return snapshot;
      const collectionName = contentTypeSchema.collectionName;
      if (!collectionName) return snapshot;
      const knex = strapi.db.connection;
      const relatedType = contentType;
      const localizableFields = getLocalizableFields(contentTypeSchema);
      const rows = await knex.raw(
        `SELECT id FROM "${collectionName}" WHERE document_id = ?`,
        [documentId]
      );
      if (!rows?.rows?.length) return snapshot;
      for (const [fieldName, fieldDef] of Object.entries(contentTypeSchema.attributes)) {
        if (fieldDef.type !== "media") continue;
        if (localizableFields.includes(fieldName)) continue;
        for (const row of rows.rows) {
          const rels = await knex.raw(
            `SELECT file_id FROM files_related_mph WHERE related_id = ? AND related_type = ? AND field = ?`,
            [row.id, relatedType, fieldName]
          );
          if (rels?.rows?.length > 0) {
            snapshot[fieldName] = rels.rows.map((r) => r.file_id);
            break;
          }
        }
      }
      if (Object.keys(snapshot).length > 0) {
        strapi.log.info(`Auto Translator: Snapshot media for ${contentType} doc ${documentId}: ${JSON.stringify(snapshot)}`);
      }
    } catch (err) {
      strapi.log.warn(`Auto Translator: snapshotMediaFileIds error: ${err.message}`);
    }
    return snapshot;
  },
  /**
   * Restore media relations on PUBLISHED rows for a document.
   * Uses the pre-translation snapshot as source if no existing row has media.
   * Only targets published rows to avoid marking drafts as "Modified".
   */
  async restoreMediaForAllRows(contentType, documentId, _sourceLocale, mediaSnapshot) {
    try {
      const contentTypeSchema = strapi.contentType(contentType);
      if (!contentTypeSchema) return;
      const collectionName = contentTypeSchema.collectionName;
      if (!collectionName) return;
      const knex = strapi.db.connection;
      const relatedType = contentType;
      const localizableFields = getLocalizableFields(contentTypeSchema);
      const mediaFields = [];
      for (const [fieldName, fieldDef] of Object.entries(contentTypeSchema.attributes)) {
        if (fieldDef.type === "media" && !localizableFields.includes(fieldName)) {
          mediaFields.push(fieldName);
        }
      }
      if (mediaFields.length === 0) return;
      const allRows = await knex.raw(
        `SELECT id FROM "${collectionName}" WHERE document_id = ? AND published_at IS NOT NULL`,
        [documentId]
      );
      if (!allRows?.rows?.length) return;
      for (const field of mediaFields) {
        let fileIds = [];
        for (const row of allRows.rows) {
          const rels = await knex.raw(
            `SELECT file_id FROM files_related_mph WHERE related_id = ? AND related_type = ? AND field = ?`,
            [row.id, relatedType, field]
          );
          if (rels?.rows?.length > 0) {
            fileIds = rels.rows.map((r) => r.file_id);
            break;
          }
        }
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
          let nextOrder = (maxOrder?.rows?.[0]?.max_order || 0) + 1;
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
      strapi.log.warn(`Auto Translator: restoreMediaForAllRows error: ${err.message}`);
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
  async copyMediaRelations(contentType, sourceEntity, targetEntity) {
    try {
      const contentTypeSchema = strapi.contentType(contentType);
      if (!contentTypeSchema) return;
      const collectionName = contentTypeSchema.collectionName;
      if (!collectionName) return;
      const localizableFields = getLocalizableFields(contentTypeSchema);
      const relatedType = contentType;
      for (const [fieldName, fieldDef] of Object.entries(contentTypeSchema.attributes)) {
        if (fieldDef.type !== "media") continue;
        if (localizableFields.includes(fieldName)) continue;
        const targetId = targetEntity.id;
        if (!targetId) continue;
        const existingTarget = await strapi.db.connection.raw(
          `SELECT id FROM files_related_mph WHERE related_id = ? AND related_type = ? AND field = ?`,
          [targetId, relatedType, fieldName]
        );
        if (existingTarget?.rows?.length > 0) continue;
        const sourceDocId = sourceEntity.documentId;
        const sourceLocale = sourceEntity.locale || "en";
        const publishedSource = await strapi.db.connection.raw(
          `SELECT id FROM "${collectionName}" WHERE document_id = ? AND locale = ? AND published_at IS NOT NULL LIMIT 1`,
          [sourceDocId, sourceLocale]
        );
        const draftSource = await strapi.db.connection.raw(
          `SELECT id FROM "${collectionName}" WHERE document_id = ? AND locale = ? AND published_at IS NULL LIMIT 1`,
          [sourceDocId, sourceLocale]
        );
        const sourceIds = [];
        if (publishedSource?.rows?.[0]?.id) sourceIds.push(publishedSource.rows[0].id);
        if (draftSource?.rows?.[0]?.id) sourceIds.push(draftSource.rows[0].id);
        let sourceRelations = null;
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
        const maxOrder = await strapi.db.connection.raw(
          `SELECT COALESCE(MAX("order"), 0) as max_order FROM files_related_mph`
        );
        let nextOrder = (maxOrder?.rows?.[0]?.max_order || 0) + 1;
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
        `Auto Translator: Failed to copy media relations: ${error.message}`
      );
    }
  },
  /**
   * Rebuild content data from the translated fields structure
   */
  async rebuildContentFromFields(dataObject, fields, contentTypeSchema) {
    for (const [fieldName, fieldData] of Object.entries(fields)) {
      const data = fieldData;
      if (!data || !data.type) {
        continue;
      }
      switch (data.type) {
        case "string":
        case "text":
        case "richtext":
        case "blocks":
        case "email":
          dataObject[fieldName] = data.value;
          break;
        case "dynamiczone":
          if (data.components && Array.isArray(data.components)) {
            dataObject[fieldName] = [];
            for (let i = 0; i < data.components.length; i++) {
              const component = data.components[i];
              const componentData = {
                __component: component.__component
              };
              if (component.content) {
                await this.rebuildComponentData(
                  componentData,
                  component.content,
                  1,
                  `${fieldName}[${i}]`
                );
              }
              dataObject[fieldName].push(componentData);
            }
          }
          break;
        case "component":
          if (data.repeatable && data.items && Array.isArray(data.items)) {
            dataObject[fieldName] = [];
            for (let i = 0; i < data.items.length; i++) {
              const item = data.items[i];
              const itemData = {};
              if (item.content) {
                await this.rebuildComponentData(
                  itemData,
                  item.content,
                  1,
                  `${fieldName}[${i}]`
                );
              }
              dataObject[fieldName].push(itemData);
            }
          } else if (data.content) {
            dataObject[fieldName] = {};
            await this.rebuildComponentData(
              dataObject[fieldName],
              data.content,
              1,
              fieldName
            );
          }
          break;
        case "passthrough":
          dataObject[fieldName] = data.value;
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
  async rebuildComponentData(componentObject, contentFields, depth = 0, path = "") {
    for (const [fieldName, fieldData] of Object.entries(contentFields)) {
      const data = fieldData;
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
              const itemData = {};
              if (item.content) {
                await this.rebuildComponentData(
                  itemData,
                  item.content,
                  depth + 1,
                  itemPath
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
              fieldPath
            );
          }
          break;
        case "passthrough":
          componentObject[fieldName] = data.value;
          break;
      }
    }
  }
});
const services = {
  translator: translatorService
};
const index = {
  register,
  bootstrap,
  destroy,
  config,
  controllers,
  routes,
  services,
  contentTypes,
  policies,
  middlewares
};
export {
  index as default
};
