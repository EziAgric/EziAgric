/**
 * Localized notification template catalog.
 *
 * Provides trade-lifecycle notification templates for the supported locales
 * (English, Hausa, Yoruba, Igbo, Nigerian Pidgin) with a safe fallback to
 * English whenever a locale or a specific template key is missing.
 */

export const SUPPORTED_LOCALES = ['en', 'ha', 'yo', 'ig', 'pcm'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

/**
 * Trade-lifecycle notification keys. Every key MUST have a translation in
 * every supported locale (enforced by the missing-key detection test).
 */
export const TRADE_LIFECYCLE_KEYS = [
  'trade.created',
  'trade.funded',
  'trade.shipped',
  'trade.delivered',
  'trade.completed',
  'trade.cancelled',
  'trade.disputed',
  'trade.refunded',
] as const;
export type TradeLifecycleKey = (typeof TRADE_LIFECYCLE_KEYS)[number];

export interface NotificationTemplate {
  title: string;
  body: string;
}

export type TemplateCatalog = Record<
  SupportedLocale,
  Record<TradeLifecycleKey, NotificationTemplate>
>;

/**
 * Template catalog keyed by locale. Placeholders use `{{name}}` syntax and are
 * interpolated by `renderTemplate`.
 */
export const NOTIFICATION_TEMPLATES: TemplateCatalog = {
  en: {
    'trade.created': {
      title: 'Trade created',
      body: 'Your trade {{tradeId}} has been created and is awaiting funding.',
    },
    'trade.funded': {
      title: 'Trade funded',
      body: 'Trade {{tradeId}} has been funded and is ready to ship.',
    },
    'trade.shipped': {
      title: 'Trade shipped',
      body: 'Trade {{tradeId}} has been shipped. Please confirm delivery.',
    },
    'trade.delivered': {
      title: 'Trade delivered',
      body: 'Trade {{tradeId}} has been marked as delivered.',
    },
    'trade.completed': {
      title: 'Trade completed',
      body: 'Trade {{tradeId}} is complete. Thank you for trading with us.',
    },
    'trade.cancelled': {
      title: 'Trade cancelled',
      body: 'Trade {{tradeId}} has been cancelled.',
    },
    'trade.disputed': {
      title: 'Trade disputed',
      body: 'A dispute has been opened for trade {{tradeId}}.',
    },
    'trade.refunded': {
      title: 'Trade refunded',
      body: 'Trade {{tradeId}} has been refunded.',
    },
  },
  ha: {
    'trade.created': {
      title: 'An ƙirƙiri ciniki',
      body: 'An ƙirƙiri cinikinka {{tradeId}} kuma ana jiran biyan kuɗi.',
    },
    'trade.funded': {
      title: 'An biya ciniki',
      body: 'An biya ciniki {{tradeId}} kuma a shirye yake a aika.',
    },
    'trade.shipped': {
      title: 'An aika ciniki',
      body: 'An aika ciniki {{tradeId}}. Da fatan za a tabbatar da isarwa.',
    },
    'trade.delivered': {
      title: 'An isar da ciniki',
      body: 'An yiwa ciniki {{tradeId}} alama an isar.',
    },
    'trade.completed': {
      title: 'An kammala ciniki',
      body: 'An kammala ciniki {{tradeId}}. Na gode da yin ciniki da mu.',
    },
    'trade.cancelled': {
      title: 'An soke ciniki',
      body: 'An soke ciniki {{tradeId}}.',
    },
    'trade.disputed': {
      title: 'Rikici kan ciniki',
      body: 'An buɗe rikici kan ciniki {{tradeId}}.',
    },
    'trade.refunded': {
      title: 'An mayar da kuɗin ciniki',
      body: 'An mayar da kuɗin ciniki {{tradeId}}.',
    },
  },
  yo: {
    'trade.created': {
      title: 'A ṣẹ̀dá òwò',
      body: 'A ti ṣẹ̀dá òwò rẹ {{tradeId}} ó sì ń dúró fún ìsanwó.',
    },
    'trade.funded': {
      title: 'A sanwó òwò',
      body: 'A ti sanwó òwò {{tradeId}} ó sì ṣetán láti ránṣẹ́.',
    },
    'trade.shipped': {
      title: 'A rán òwò',
      body: 'A ti rán òwò {{tradeId}}. Jọ̀wọ́ jẹ́rìí ìfijíṣẹ́.',
    },
    'trade.delivered': {
      title: 'A fijíṣẹ́ òwò',
      body: 'A ti sàmì sí òwò {{tradeId}} pé ó ti fijíṣẹ́.',
    },
    'trade.completed': {
      title: 'A parí òwò',
      body: 'Òwò {{tradeId}} ti parí. Ẹ ṣé fún ṣíṣe òwò pẹ̀lú wa.',
    },
    'trade.cancelled': {
      title: 'A fagilé òwò',
      body: 'A ti fagilé òwò {{tradeId}}.',
    },
    'trade.disputed': {
      title: 'Àríyànjiyàn lórí òwò',
      body: 'A ti ṣí àríyànjiyàn lórí òwò {{tradeId}}.',
    },
    'trade.refunded': {
      title: 'A dá owó òwò padà',
      body: 'A ti dá owó òwò {{tradeId}} padà.',
    },
  },
  ig: {
    'trade.created': {
      title: 'E mepụtara azụmahịa',
      body: 'E mepụtara azụmahịa gị {{tradeId}} ma na-eche ego.',
    },
    'trade.funded': {
      title: 'E kwụrụ ego azụmahịa',
      body: 'E kwụrụ ego azụmahịa {{tradeId}} ma dị njikere izipu.',
    },
    'trade.shipped': {
      title: 'E zipụrụ azụmahịa',
      body: 'E zipụrụ azụmahịa {{tradeId}}. Biko gosi na e nwetara ya.',
    },
    'trade.delivered': {
      title: 'E nyefere azụmahịa',
      body: 'E kara akara na e nyefere azụmahịa {{tradeId}}.',
    },
    'trade.completed': {
      title: 'E mechara azụmahịa',
      body: 'Azụmahịa {{tradeId}} agwụla. Daalụ maka ịzụ ahịa na anyị.',
    },
    'trade.cancelled': {
      title: 'E kagburu azụmahịa',
      body: 'E kagburu azụmahịa {{tradeId}}.',
    },
    'trade.disputed': {
      title: 'Esemokwu azụmahịa',
      body: 'E mepere esemokwu maka azụmahịa {{tradeId}}.',
    },
    'trade.refunded': {
      title: 'E weghachiri ego azụmahịa',
      body: 'E weghachiri ego azụmahịa {{tradeId}}.',
    },
  },
  pcm: {
    'trade.created': {
      title: 'Trade don start',
      body: 'Your trade {{tradeId}} don create, we dey wait for money.',
    },
    'trade.funded': {
      title: 'Money don enter trade',
      body: 'Money don enter trade {{tradeId}}, e ready to ship.',
    },
    'trade.shipped': {
      title: 'Trade don ship',
      body: 'Trade {{tradeId}} don ship. Abeg confirm say e land.',
    },
    'trade.delivered': {
      title: 'Trade don land',
      body: 'Trade {{tradeId}} don mark as delivered.',
    },
    'trade.completed': {
      title: 'Trade don finish',
      body: 'Trade {{tradeId}} don complete. Thank you for trading with us.',
    },
    'trade.cancelled': {
      title: 'Trade don cancel',
      body: 'Trade {{tradeId}} don cancel.',
    },
    'trade.disputed': {
      title: 'Dispute on trade',
      body: 'Dem don open dispute for trade {{tradeId}}.',
    },
    'trade.refunded': {
      title: 'Trade don refund',
      body: 'Dem don refund trade {{tradeId}}.',
    },
  },
};

/**
 * Normalize an arbitrary locale string to a supported locale, falling back to
 * English when the locale is unknown or unsupported.
 */
export function resolveLocale(locale?: string | null): SupportedLocale {
  if (!locale) return DEFAULT_LOCALE;
  const normalized = locale.toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED_LOCALES as readonly string[]).includes(normalized)
    ? (normalized as SupportedLocale)
    : DEFAULT_LOCALE;
}

/**
 * Look up a template for a locale, falling back to English when the locale or
 * the specific key is missing.
 */
export function getTemplate(
  key: TradeLifecycleKey,
  locale?: string | null,
): NotificationTemplate {
  const resolved = resolveLocale(locale);
  return (
    NOTIFICATION_TEMPLATES[resolved]?.[key] ??
    NOTIFICATION_TEMPLATES[DEFAULT_LOCALE][key]
  );
}

/**
 * Render a localized template, interpolating `{{placeholder}}` tokens from the
 * provided variables. Falls back to English for missing locales/keys.
 */
export function renderTemplate(
  key: TradeLifecycleKey,
  locale?: string | null,
  vars: Record<string, string | number> = {},
): NotificationTemplate {
  const template = getTemplate(key, locale);
  const interpolate = (text: string): string =>
    text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(vars, name)
        ? String(vars[name])
        : match,
    );
  return {
    title: interpolate(template.title),
    body: interpolate(template.body),
  };
}

/**
 * Detect template keys that are missing a translation in any supported locale.
 * Returns an array of `locale:key` identifiers; an empty array means the
 * catalog is complete.
 */
export function findMissingTemplateKeys(): string[] {
  const missing: string[] = [];
  for (const locale of SUPPORTED_LOCALES) {
    for (const key of TRADE_LIFECYCLE_KEYS) {
      const template = NOTIFICATION_TEMPLATES[locale]?.[key];
      if (!template || !template.title || !template.body) {
        missing.push(`${locale}:${key}`);
      }
    }
  }
  return missing;
}
