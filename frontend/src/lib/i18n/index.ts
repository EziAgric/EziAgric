import en from './messages/en';
import ha from './messages/ha';
import yo from './messages/yo';
import ig from './messages/ig';
import pcm from './messages/pcm';

export const LOCALES = ['en', 'ha', 'yo', 'ig', 'pcm'] as const;

export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ha: 'Hausa',
  yo: 'Yorùbá',
  ig: 'Igbo',
  pcm: 'Pidgin',
};

export const DEFAULT_LOCALE: Locale = 'en';

export const STORAGE_KEY = 'app.locale';

export type Messages = typeof en;

export const messages: Record<Locale, Messages> = {
  en,
  ha,
  yo,
  ig,
  pcm,
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function setStoredLocale(locale: Locale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore storage failures (private mode, quota, etc.)
  }
}

/**
 * Resolve a dot-notation key (e.g. "marketplace.title") against a locale's
 * message catalog, falling back to the default locale and finally the key.
 */
export function translate(locale: Locale, key: string): string {
  const resolve = (catalog: Messages): string | undefined => {
    const parts = key.split('.');
    let current: unknown = catalog;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return typeof current === 'string' ? current : undefined;
  };

  return resolve(messages[locale]) ?? resolve(messages[DEFAULT_LOCALE]) ?? key;
}

/**
 * Collect every dot-notation key present in the default locale catalog.
 * Used by the missing-key check to keep locale files in sync.
 */
export function collectKeys(catalog: unknown, prefix = ''): string[] {
  if (!catalog || typeof catalog !== 'object') return [];
  const keys: string[] = [];
  for (const [k, v] of Object.entries(catalog as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') {
      keys.push(...collectKeys(v, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

export function findMissingKeys(locale: Locale): string[] {
  const base = new Set(collectKeys(messages[DEFAULT_LOCALE]));
  const target = new Set(collectKeys(messages[locale]));
  return [...base].filter((key) => !target.has(key));
}
