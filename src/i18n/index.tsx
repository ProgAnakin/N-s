import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { en, type Strings } from './en';

/**
 * i18n without a library.
 *
 * A locale is a module satisfying `Strings`. Components read strings off a
 * typed object (`s.home.nextUp`) rather than looking up dotted keys, so a
 * missing or renamed string is a compile error rather than a "home.nextUp"
 * appearing on screen.
 *
 * Adding a language: write `pt.ts` exporting `const pt: Strings = {...}`,
 * add it to `LOCALES`, and TypeScript will point at everything untranslated.
 */

export type LocaleCode = 'en' | 'pt' | 'it' | 'zh';

export const LOCALE_NAMES: Record<LocaleCode, string> = {
  en: 'English',
  pt: 'Português',
  it: 'Italiano',
  zh: '中文',
};

const LOCALES: Partial<Record<LocaleCode, Strings>> = {
  en,
};

/** Locales with a translation ready. The settings picker only offers these. */
export const AVAILABLE_LOCALES = Object.keys(LOCALES) as LocaleCode[];

/** BCP 47 tags for Intl — number, currency and date formatting. */
const INTL_LOCALES: Record<LocaleCode, string> = {
  en: 'en-GB',
  pt: 'pt-BR',
  it: 'it-IT',
  zh: 'zh-CN',
};

interface I18nValue {
  locale: LocaleCode;
  /** The strings themselves. Named `s` at the call site to keep JSX readable. */
  s: Strings;
  /** The tag to hand to Intl formatters. */
  intlLocale: string;
}

const I18nContext = createContext<I18nValue>({
  locale: 'en',
  s: en,
  intlLocale: INTL_LOCALES.en,
});

export function I18nProvider({
  locale = 'en',
  children,
}: {
  locale?: LocaleCode;
  children: ReactNode;
}) {
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      s: LOCALES[locale] ?? en,
      intlLocale: INTL_LOCALES[locale] ?? INTL_LOCALES.en,
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

/** Shorthand for the common case: `const s = useStrings()`. */
export function useStrings(): Strings {
  return useContext(I18nContext).s;
}

export type { Strings };
