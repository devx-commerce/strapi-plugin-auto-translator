import React, { useEffect, useState } from "react";
import { useFetchClient, useQueryParams } from "@strapi/admin/strapi-admin";
import { TranslateButton } from "./TranslateButton";

export const InjectedTranslateButton = () => {
  const { get } = useFetchClient();
  const [{ query }]: any = useQueryParams();
  const [isI18nEnabled, setIsI18nEnabled] = useState(false);

  // Extract content type from URL
  // URL format in Strapi v5:
  // Collection type: /content-manager/collection-types/api::article.article/:documentId
  // Single type: /content-manager/single-types/api::about.about
  const pathname = window.location.pathname;
  const pathParts = pathname.split("/");

  // Find the index of collection-types or single-types
  const collectionIndex = pathParts.indexOf("collection-types");
  const singleIndex = pathParts.indexOf("single-types");
  const typeIndex = collectionIndex !== -1 ? collectionIndex : singleIndex;
  const isSingleType = singleIndex !== -1;

  // Content type is right after collection-types/single-types
  const contentType = typeIndex !== -1 ? pathParts[typeIndex + 1] || "" : "";

  // Document ID (string) is after the content type
  // For single types, there's no documentId - it's undefined/empty
  const documentId = typeIndex !== -1 ? pathParts[typeIndex + 2] || "" : "";

  // Get current locale from query params
  const currentLocale = (query?.plugins?.i18n?.locale as string) || "en";



  useEffect(() => {
    // Check if content type has i18n enabled
    const checkI18n = async () => {
      if (!contentType) {
        console.log(
          "[Auto-Translator] No content type found, skipping i18n check",
        );
        return;
      }

      try {
        const { data } = await get(
          `/auto-translator/check-i18n?contentType=${contentType}`,
        );
        setIsI18nEnabled(data?.data?.i18nEnabled || false);
      } catch (error) {
        console.error("[Auto-Translator] Failed to check i18n status:", error);
        setIsI18nEnabled(false);
      }
    };

    checkI18n();
  }, [contentType, get]);

  // Only render button if:
  // 1. Content type has i18n enabled
  // 2. For collection types: We have a valid document ID (editing existing entry)
  // 3. For single types: No documentId needed (only one instance per locale)
  // 4. We have a current locale
  const shouldRender =
    isI18nEnabled &&
    currentLocale &&
    (isSingleType || documentId);

  if (!shouldRender) {
    return null;
  }

  return (
    <TranslateButton
      contentType={contentType}
      documentId={documentId || undefined}
      currentLocale={currentLocale}
      isSingleType={isSingleType}
    />
  );
};
