"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_CHANGE_EVENT,
  STORAGE_KEY,
  getStoredLocale,
  t as translateKey,
  type Locale,
  type MessageKey,
  type TranslateParams,
} from "./index";

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener(LOCALE_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(LOCALE_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * React binding for the message catalog. Re-renders when the stored locale
 * changes (in this tab via `setStoredLocale`, or in another tab via storage).
 *
 *   const { t } = useTranslation();
 *   <h2>{t("tradeDetail.partiesTitle")}</h2>
 */
export function useTranslation(): {
  t: (key: MessageKey, params?: TranslateParams) => string;
  locale: Locale;
} {
  const locale = useSyncExternalStore(
    subscribe,
    getStoredLocale,
    () => DEFAULT_LOCALE,
  );

  const t = useCallback(
    (key: MessageKey, params?: TranslateParams) =>
      translateKey(key, { ...params, locale }),
    [locale],
  );

  return { t, locale };
}
