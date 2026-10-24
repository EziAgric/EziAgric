import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import ha from './locales/ha.json';
import yo from './locales/yo.json';
import ig from './locales/ig.json';
import sw from './locales/sw.json';

const resources = {
  en: { translation: en },
  ha: { translation: ha },
  yo: { translation: yo },
  ig: { translation: ig },
  sw: { translation: sw },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    compatibilityJSON: 'v4',
  });

export default i18n;