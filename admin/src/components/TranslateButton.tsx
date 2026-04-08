import { useFetchClient, useNotification } from "@strapi/admin/strapi-admin";
import { Button, Combobox, ComboboxOption } from "@strapi/design-system";
import { Globe } from "@strapi/icons";
import React, { useState } from "react";
import { useIntl } from "react-intl";
import { getTrad } from "../utils/getTrad";

interface Locale {
  code: string;
  name: string;
  isDefault: boolean;
}

interface TranslateButtonProps {
  contentType: string;
  documentId?: string;
  currentLocale: string;
  isSingleType?: boolean;
}

export const TranslateButton: React.FC<TranslateButtonProps> = ({
  contentType,
  documentId,
  currentLocale,
  isSingleType = false,
}) => {
  const { formatMessage } = useIntl();
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [locales, setLocales] = useState<Locale[]>([]);
  const [selectedLocale, setSelectedLocale] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [showLocaleSelector, setShowLocaleSelector] = useState(false);
  const [translationProgress, setTranslationProgress] = useState<string>("");

  // Fetch available locales
  const fetchLocales = async () => {
    try {
      const { data } = await get("/auto-translator/locales");

      // Filter out:
      // 1. Current locale (source locale - always English)
      // 2. English locale (en) as base locale
      // 3. Default locale
      const availableLocales = data.data.filter(
        (locale: Locale) =>
          locale.code !== currentLocale &&
          locale.code !== "en" &&
          !locale.isDefault
      );

      if (availableLocales.length === 0) {
        toggleNotification({
          type: "warning",
          message: formatMessage({ id: getTrad("message.noLocales") }),
        });
        return;
      }

      setLocales(availableLocales);
      setShowLocaleSelector(true);
    } catch (error) {
      console.error("Failed to fetch locales:", error);
      toggleNotification({
        type: "danger",
        message: formatMessage({ id: getTrad("message.error") }),
      });
    }
  };

  // Handle translation
  const handleTranslate = async () => {
    if (!selectedLocale) {
      return;
    }

    setIsLoading(true);

    try {
      // Check if "All locales" is selected
      if (selectedLocale === "all") {
        // Translate to all available locales sequentially
        let successCount = 0;
        let failedLocales: string[] = [];

        for (let i = 0; i < locales.length; i++) {
          const locale = locales[i];
          setTranslationProgress(
            `Translating to ${locale.name} (${i + 1}/${locales.length})...`
          );

          try {
            await post("/auto-translator/translate", {
              data: {
                contentType,
                documentId: isSingleType ? undefined : documentId,
                sourceLocale: currentLocale,
                targetLocale: locale.code,
                isSingleType,
              },
            });
            successCount++;
          } catch (error) {
            console.error(`Translation to ${locale.code} failed:`, error);
            failedLocales.push(locale.name);
          }
        }

        setTranslationProgress("");

        // Show summary notification
        if (successCount === locales.length) {
          toggleNotification({
            type: "success",
            message: `Successfully translated to all ${successCount} locales`,
          });
        } else if (successCount > 0) {
          toggleNotification({
            type: "warning",
            message: `Translated to ${successCount}/${locales.length} locales. Failed: ${failedLocales.join(", ")}`,
          });
        } else {
          toggleNotification({
            type: "danger",
            message: "All translations failed",
          });
        }

        // Reload page after a short delay
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        // Single locale translation
        const response = await post("/auto-translator/translate", {
          data: {
            contentType,
            documentId: isSingleType ? undefined : documentId,
            sourceLocale: currentLocale,
            targetLocale: selectedLocale,
            isSingleType,
          },
        });

        if (response.data) {
          toggleNotification({
            type: "success",
            message: formatMessage({ id: getTrad("message.success") }),
          });

          // Reload page after a short delay to show the success message
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
      }
    } catch (error: any) {
      console.error("Translation failed:", error);

      const errorMessage =
        error?.response?.data?.error?.message ||
        error?.message ||
        formatMessage({ id: getTrad("message.error") });

      toggleNotification({
        type: "danger",
        message: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!showLocaleSelector) {
    return (
      <Button
        startIcon={<Globe />}
        onClick={fetchLocales}
        variant="secondary"
        size="S"
        style={{ width: "100%" }}
      >
        {formatMessage({ id: getTrad("button.translate") })}
      </Button>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        alignItems: "center",
        flexDirection: "column",
        width: "100%",
      }}
    >
      <Combobox
        placeholder={formatMessage({ id: getTrad("label.selectLocale") })}
        value={selectedLocale}
        onChange={(value: string | number) => setSelectedLocale(String(value))}
        size="S"
        style={{ width: "100%" }}
      >
        {/* Add "All locales" option */}
        <ComboboxOption key="all" value="all">
          🌐 All locales ({locales.length})
        </ComboboxOption>
        {locales.map((locale) => (
          <ComboboxOption key={locale.code} value={locale.code}>
            {locale.name}
          </ComboboxOption>
        ))}
      </Combobox>

      {/* Show translation progress */}
      {translationProgress && (
        <div style={{ fontSize: "12px", color: "#666", width: "100%" }}>
          {translationProgress}
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          width: "100%",
        }}
      >
        <Button
          onClick={handleTranslate}
          disabled={!selectedLocale || isLoading}
          loading={isLoading}
          size="S"
          style={{ width: "100%" }}
        >
          {isLoading
            ? formatMessage({ id: getTrad("button.translating") })
            : formatMessage({ id: getTrad("button.translate") })}
        </Button>
        <Button
          variant="tertiary"
          onClick={() => {
            setShowLocaleSelector(false);
            setSelectedLocale("");
          }}
          style={{ width: "100%" }}
          size="S"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
};
