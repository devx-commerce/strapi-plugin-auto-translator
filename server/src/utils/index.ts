import type { Core } from "@strapi/strapi";

/**
 * Check if a content type has i18n enabled
 */
export const isI18nEnabled = (contentType: any): boolean => {
  return contentType?.pluginOptions?.i18n?.localized === true;
};

/**
 * Get all localizable fields from a content type schema
 */
export const getLocalizableFields = (contentType: any): string[] => {
  if (!isI18nEnabled(contentType)) {
    return [];
  }

  const localizableFields: string[] = [];
  const attributes = contentType.attributes || {};

  Object.keys(attributes).forEach((fieldName) => {
    const field = attributes[fieldName];

    // Check if field is explicitly set to localized
    const isLocalized = field?.pluginOptions?.i18n?.localized === true;

    // Exclude system fields and non-localizable fields
    const isSystemField = [
      "createdAt",
      "updatedAt",
      "publishedAt",
      "createdBy",
      "updatedBy",
      "locale",
      "localizations",
    ].includes(fieldName);

    if (isLocalized && !isSystemField) {
      localizableFields.push(fieldName);
    }
  });

  return localizableFields;
};

/**
 * Get the UID for a content type from its API name
 */
export const getContentTypeUid = (apiName: string): string => {
  if (apiName.startsWith("api::")) {
    return apiName;
  }

  // Convert api name like 'article' to 'api::article.article'
  return `api::${apiName}.${apiName}`;
};

/**
 * Extract field type information
 */
export const getFieldType = (field: any): string => {
  return field?.type || "string";
};

/**
 * Build deep populate query for a content type to fetch all nested data
 * This function recursively traverses the content type schema and builds a populate
 * query that includes ALL nested components, relations, and media at any depth level.
 */
export const buildDeepPopulate = (
  contentTypeSchema: any,
  strapi: any,
  maxDepth = 10,
): any => {
  const populate: any = {};

  if (!contentTypeSchema || !contentTypeSchema.attributes) {
    return populate;
  }

  const buildPopulateForAttributes = (
    attributes: any,
    currentDepth: number,
    path: string = "",
  ): any => {
    const depthPrefix = "  ".repeat(currentDepth);

    if (currentDepth >= maxDepth) {
      return true;
    }

    const result: any = {};

    for (const [fieldName, fieldSchema] of Object.entries(attributes)) {
      const field = fieldSchema as any;
      const fieldType = field?.type;
      const fieldPath = path ? `${path}.${fieldName}` : fieldName;

      switch (fieldType) {
        case "media":
          // Populate media fields
          result[fieldName] = true;

          break;

        case "relation":
          // Populate relations
          result[fieldName] = true;

          break;

        case "component":
          // Populate component fields recursively
          if (field.component) {
            const componentSchema = strapi?.components?.[field.component];
            if (componentSchema && componentSchema.attributes) {
              const nestedPopulate = buildPopulateForAttributes(
                componentSchema.attributes,
                currentDepth + 1,
                fieldPath,
              );

              // Always wrap in populate object for proper Strapi v5 format
              if (nestedPopulate === true) {
                result[fieldName] = { populate: "*" };
              } else if (Object.keys(nestedPopulate).length > 0) {
                result[fieldName] = { populate: nestedPopulate };
              } else {
                // Even if no nested fields, still populate the component
                result[fieldName] = { populate: "*" };
              }
            } else {
              result[fieldName] = { populate: "*" };
            }
          } else {
          }
          break;

        case "dynamiczone":
          // Populate dynamic zone components with deep nesting

          if (field.components && Array.isArray(field.components)) {
            // Build populate for each component in the dynamic zone using 'on' syntax
            const dzOn: any = {};

            for (const componentName of field.components) {
              const componentSchema = strapi?.components?.[componentName];
              if (componentSchema && componentSchema.attributes) {
                const componentPopulate = buildPopulateForAttributes(
                  componentSchema.attributes,
                  currentDepth + 1,
                  `${fieldPath}[${componentName}]`,
                );

                // Build the populate structure for this component
                if (
                  componentPopulate === true ||
                  Object.keys(componentPopulate).length === 0
                ) {
                  // If no specific nested fields, use wildcard
                  dzOn[componentName] = { populate: "*" };
                } else {
                  // Use the specific nested populate structure
                  dzOn[componentName] = { populate: componentPopulate };
                }
              } else {
                dzOn[componentName] = { populate: "*" };
              }
            }

            // Use the 'on' syntax for dynamic zones in Strapi v5
            if (Object.keys(dzOn).length > 0) {
              result[fieldName] = { on: dzOn };
            } else {
              // Fallback to wildcard
              result[fieldName] = { populate: "*" };
            }
          } else {
            // Fallback to deep wildcard if no components defined in schema

            result[fieldName] = { populate: "*" };
          }

          break;

        default:
          // Other field types don't need population

          break;
      }
    }

    const hasFields = Object.keys(result).length > 0;

    return hasFields ? result : {};
  };

  const finalPopulate = buildPopulateForAttributes(
    contentTypeSchema.attributes,
    0,
  );

  return finalPopulate;
};
