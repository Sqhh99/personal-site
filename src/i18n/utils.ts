import { DEFAULT_LANG, LANGUAGES, UI_STRINGS, type Language } from './ui';

export function getLangFromUrl(url: URL): Language {
  const [, lang] = url.pathname.split('/');
  if (lang in LANGUAGES) return lang as Language;
  return DEFAULT_LANG;
}

export function useTranslations(lang: Language) {
  return function t<K extends keyof typeof UI_STRINGS['en']>(key: K): (typeof UI_STRINGS['en'])[K] {
    return (UI_STRINGS[lang][key] ?? UI_STRINGS[DEFAULT_LANG][key]) as (typeof UI_STRINGS['en'])[K];
  };
}

export function listLanguages(): Language[] {
  return Object.keys(LANGUAGES) as Language[];
}

/** Empty for the default locale; `"/zh"` / `"/ja"` otherwise. */
export function langPrefix(lang: Language): string {
  return lang === DEFAULT_LANG ? '' : `/${lang}`;
}

export function stripLangPrefix(pathname: string): string {
  const segments = pathname.split('/');
  const maybeLang = segments[1];
  if (maybeLang && maybeLang in LANGUAGES && maybeLang !== DEFAULT_LANG) {
    const rest = segments.slice(2).join('/');
    return rest ? `/${rest}` : '/';
  }
  return pathname || '/';
}

function withTrailingSlash(path: string): string {
  if (path === '/') return '/';
  return path.endsWith('/') ? path : `${path}/`;
}

/**
 * Given a URL pathname (e.g. "/" or "/zh/blog/foo") and a target language,
 * returns the corresponding localized pathname.
 */
export function getLocalizedPath(pathname: string, targetLang: Language): string {
  const clean = withTrailingSlash(stripLangPrefix(pathname));
  if (targetLang === DEFAULT_LANG) return clean;
  if (clean === '/') return `${langPrefix(targetLang)}/`;
  return `${langPrefix(targetLang)}${clean}`;
}
