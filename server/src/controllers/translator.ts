import type { Core } from '@strapi/strapi';
import { isI18nEnabled, getContentTypeUid } from '../utils';

const translatorController = ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Get available locales from i18n plugin
   */
  async getLocales(ctx: any) {
    try {
      const translatorService = strapi.plugin('auto-translator').service('translator');
      const locales = await translatorService.getAvailableLocales();

      ctx.body = {
        data: locales,
      };
    } catch (error) {
      strapi.log.error('Auto Translator: Error in getLocales controller', error);
      ctx.throw(500, error);
    }
  },

  /**
   * Check if content type has i18n enabled
   */
  async checkI18n(ctx: any) {
    try {
      const { contentType } = ctx.query;

      if (!contentType) {
        return ctx.badRequest('Content type is required');
      }

      const uid = getContentTypeUid(contentType);
      const contentTypeSchema = strapi.contentTypes[uid as keyof typeof strapi.contentTypes];

      if (!contentTypeSchema) {
        return ctx.notFound('Content type not found');
      }

      const enabled = isI18nEnabled(contentTypeSchema);

      ctx.body = {
        data: {
          contentType: uid,
          i18nEnabled: enabled,
        },
      };
    } catch (error) {
      strapi.log.error('Auto Translator: Error in checkI18n controller', error);
      ctx.throw(500, error);
    }
  },

  /**
   * Get translatable content from an entry (for testing)
   */
  async getTranslatableContent(ctx: any) {
    try {
      const { contentType, documentId, locale } = ctx.query;

      if (!contentType || !documentId || !locale) {
        return ctx.badRequest('contentType, documentId, and locale are required');
      }

      const translatorService = strapi.plugin('auto-translator').service('translator');
      const content = await translatorService.extractTranslatableContent(
        contentType,
        documentId,
        locale
      );

      ctx.body = {
        data: content,
      };
    } catch (error) {
      strapi.log.error('Auto Translator: Error in getTranslatableContent controller', error);
      ctx.throw(500, error);
    }
  },

  /**
   * Translate content to target locale
   */
  async translate(ctx: any) {
    try {
      const { contentType, documentId, sourceLocale, targetLocale, isSingleType } = ctx.request.body.data || {};

      // For single types, documentId is not required
      if (!contentType || !sourceLocale || !targetLocale) {
        return ctx.badRequest('contentType, sourceLocale, and targetLocale are required');
      }

      // For collection types, documentId is required
      if (!isSingleType && !documentId) {
        return ctx.badRequest('documentId is required for collection types');
      }

      const translatorService = strapi.plugin('auto-translator').service('translator');

      // Step 1: Extract content
      const translatableContent = await translatorService.extractTranslatableContent(
        contentType,
        documentId,
        sourceLocale,
        isSingleType
      );

      // Step 2: Ensure target locale entry exists (create blank if needed)
      await translatorService.ensureTargetLocaleExists(contentType, documentId, targetLocale, isSingleType);

      // Step 3: Translate content
      const translatedContent = await translatorService.translateContent(
        translatableContent,
        sourceLocale,
        targetLocale
      );

      // Step 4: Save translated content
      const savedEntity = await translatorService.saveTranslatedContent(
        contentType,
        documentId,
        translatedContent,
        targetLocale,
        isSingleType
      );

      // Step 5: Auto-publish the translated locale
      // For collection types use the documentId from the request (always present).
      // For single types look it up from the saved entity or do a fresh findFirst.
      let publishDocumentId: string | undefined = isSingleType
        ? savedEntity?.documentId
        : documentId;

      if (!publishDocumentId && isSingleType) {
        const entry = await strapi.documents(contentType as any).findFirst({});
        publishDocumentId = entry?.documentId;
      }

      if (publishDocumentId) {
        await strapi.documents(contentType as any).publish({
          documentId: publishDocumentId,
          locale: targetLocale,
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
        message: 'Translation completed successfully',
      };
    } catch (error) {
      strapi.log.error('Auto Translator: Error in translate controller', error);
      ctx.throw(500, error);
    }
  },
});

export default translatorController;
