import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { LOCALES, Locale, DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from '../lib/i18n';

const Header: React.FC = () => {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = (typeof window !== 'undefined'
      ? (window.localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null)
      : null) || DEFAULT_LOCALE;
    setLocale(stored);
    if (i18n.language !== stored) {
      i18n.changeLanguage(stored);
    }
  }, [i18n]);

  const handleLocaleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value as Locale;
    setLocale(next);
    i18n.changeLanguage(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    }
    router.push(router.pathname, router.asPath, { locale: next });
  };

  return (
    <header className="header">
      <nav className="header__nav">
        <Link href="/" className="header__logo">
          {t('common.appName')}
        </Link>
        <Link href="/marketplace">{t('nav.marketplace')}</Link>
        <Link href="/trades/create">{t('nav.createTrade')}</Link>
        <Link href="/disputes">{t('nav.disputes')}</Link>
      </nav>
      <div className="header__actions">
        <label className="header__locale" htmlFor="locale-switcher">
          <span className="sr-only">{t('common.language')}</span>
          <select
            id="locale-switcher"
            value={locale}
            onChange={handleLocaleChange}
            aria-label={t('common.language')}
          >
            {LOCALES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
};

export default Header;
