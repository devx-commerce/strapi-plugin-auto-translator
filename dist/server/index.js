"use strict";
const register = ({ strapi }) => {
  strapi.log.info("Auto Translator plugin registered");
};
const bootstrap = ({ strapi }) => {
  strapi.log.info("Auto Translator plugin bootstrapped");
};
const destroy = ({ strapi }) => {
  strapi.log.info("Auto Translator plugin destroyed");
};
const DEFAULT_DO_NOT_TRANSLATE_FIELDS = [
  "handle",
  "slug",
  "url",
  "href",
  "cartUrl",
  "videoId",
  "youtubeVideoId"
];
const config = {
  default: {
    translationProvider: "openai",
    openai: {
      apiKey: "",
      model: "gpt-4o-mini",
      temperature: 0.1
    },
    aws: {
      region: "us-east-1",
      accessKeyId: "",
      secretAccessKey: ""
    },
    doNotTranslateFields: DEFAULT_DO_NOT_TRANSLATE_FIELDS,
    doNotTranslateFieldPatterns: []
  },
  validator(config2) {
    const provider = config2.translationProvider;
    if (provider !== "openai" && provider !== "aws") {
      throw new Error(
        `[auto-translator] translationProvider must be "openai" or "aws", got "${provider}"`
      );
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
      const translatorService2 = strapi.plugin("auto-translator").service("translator");
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
      let publishDocumentId = isSingleType ? savedEntity?.documentId : documentId;
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
      } else {
        strapi.log.warn(
          `Auto Translator: Could not publish – no documentId resolved (savedEntity: ${JSON.stringify(savedEntity)})`
        );
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
const routes = [
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
const middlewares = {};
const policies = {};
function createOpenAIProvider(apiKey, model, temperature) {
  const { OpenAI } = require("openai");
  const client = new OpenAI({ apiKey });
  const translate = async (text, sourceLang, targetLang, isHtml = false) => {
    if (!text || text.trim() === "") return text;
    const systemPrompt = isHtml ? `You are a professional translator. Translate the HTML content from ${sourceLang} to ${targetLang}. Preserve all HTML tags exactly as-is. Return only the translated HTML, no explanations.` : `You are a professional translator. Translate the following text from ${sourceLang} to ${targetLang}. Return only the translated text, no explanations.`;
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      temperature
    });
    return response.choices[0]?.message?.content?.trim() ?? text;
  };
  return {
    translateText: (text, src, tgt) => translate(text, src, tgt, false),
    translateHtml: (html, src, tgt) => translate(html, src, tgt, true)
  };
}
function createAWSProvider(region, accessKeyId, secretAccessKey) {
  const { TranslateClient, TranslateTextCommand } = require("@aws-sdk/client-translate");
  const client = new TranslateClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
  return {
    translateText: async (text, src, tgt) => {
      const cmd = new TranslateTextCommand({ Text: text, SourceLanguageCode: src, TargetLanguageCode: tgt });
      const res = await client.send(cmd);
      return res.TranslatedText;
    },
    translateHtml: async (html, src, tgt) => {
      const cmd = new TranslateTextCommand({ Text: html, SourceLanguageCode: src, TargetLanguageCode: tgt, TextType: "HTML" });
      const res = await client.send(cmd);
      return res.TranslatedText;
    }
  };
}
function isExcludedField(fieldName, excludedSet, patterns) {
  return excludedSet.has(fieldName) || patterns.some((p) => p.test(fieldName));
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
   * Configure via config/plugins.ts under the "auto-translator" key.
   */
  async translateContent(content, sourceLocale, targetLocale) {
    try {
      const config2 = strapi.config.get("plugin::auto-translator");
      const provider = config2.translationProvider;
      strapi.log.info(`Auto Translator: Using provider: ${provider}`);
      let translateClient;
      if (provider === "aws") {
        const region = config2.aws?.region || process.env.AWS_REGION || "us-east-1";
        const accessKeyId = config2.aws?.accessKeyId || process.env.AWS_ACCESS_KEY_ID || "";
        const secretAccessKey = config2.aws?.secretAccessKey || process.env.AWS_ACCESS_SECRET || "";
        translateClient = createAWSProvider(region, accessKeyId, secretAccessKey);
      } else {
        const apiKey = config2.openai?.apiKey || process.env.OPENAI_API_KEY || "";
        const model = config2.openai?.model || "gpt-4o-mini";
        const temperature = config2.openai?.temperature ?? 0.1;
        translateClient = createOpenAIProvider(apiKey, model, temperature);
      }
      const translatedContent = JSON.parse(JSON.stringify(content));
      const excludedFieldNames = new Set(
        Array.isArray(config2.doNotTranslateFields) ? config2.doNotTranslateFields : []
      );
      const excludedPatterns = (config2.doNotTranslateFieldPatterns ?? []).map((p) => new RegExp(p));
      await this.translateFields(
        translatedContent.fields,
        translateClient,
        sourceLocale,
        targetLocale,
        excludedFieldNames,
        excludedPatterns
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
  async translateFields(fields, translateClient, sourceLocale, targetLocale, excludedFieldNames = /* @__PURE__ */ new Set(), excludedPatterns = []) {
    for (const [fieldName, fieldData] of Object.entries(fields)) {
      const data = fieldData;
      if (!data || !data.type) {
        continue;
      }
      switch (data.type) {
        case "string":
        case "text":
        case "email":
          if (isExcludedField(fieldName, excludedFieldNames, excludedPatterns)) {
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
          if (isExcludedField(fieldName, excludedFieldNames, excludedPatterns)) {
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
                  excludedFieldNames,
                  excludedPatterns
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
                  excludedFieldNames,
                  excludedPatterns
                );
              }
            }
          } else if (data.content) {
            await this.translateFields(
              data.content,
              translateClient,
              sourceLocale,
              targetLocale,
              excludedFieldNames,
              excludedPatterns
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
          dataToSave[fieldName] = sourceEntity[fieldName];
        }
      }
      const config2 = strapi.config.get("plugin::auto-translator");
      const excludedNames = Array.isArray(config2.doNotTranslateFields) ? config2.doNotTranslateFields : [];
      const excludedPatterns = (config2.doNotTranslateFieldPatterns ?? []).map(
        (p) => new RegExp(p)
      );
      for (const fieldName of excludedNames) {
        if (sourceEntity[fieldName] !== void 0 && contentTypeSchema.attributes?.[fieldName]) {
          dataToSave[fieldName] = sourceEntity[fieldName];
        }
      }
      for (const fieldName of Object.keys(contentTypeSchema.attributes || {})) {
        if (!excludedNames.includes(fieldName) && excludedPatterns.some((p) => p.test(fieldName))) {
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
module.exports = index;
