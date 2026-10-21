import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en from './locales/en.json';
import ha from './locales/ha.json';
import yo from './locales/yo.json';
import ig from './locales/ig.json';
import pcm from './locales/pcm.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ha', label: 'Hausa' },
  { code: 'yo', label: 'Yoruba' },
  { code: 'ig', label: 'Igbo' },
  { code: 'pcm', label: 'Pidgin' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

// Resolve the best supported language from the device locale list
function detectLanguage(): LanguageCode {
  const locales = Localization.getLocales();
  for (const locale of locales) {
    const tag = locale.languageTag.split('-')[0].toLowerCase();
    if (SUPPORTED_LANGUAGES.some((l) => l.code === tag)) {
      return tag as LanguageCode;
    }
  }
  return 'en';
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ha: { translation: ha }, yo: { translation: yo }, ig: { translation: ig }, pcm: { translation: pcm } },
  lng: detectLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
