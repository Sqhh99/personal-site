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

/**
 * Given a URL pathname (e.g. "/" or "/zh/" or "/blog/foo" or "/zh/blog/foo")
 * and a target language ("en" or "zh"), returns the corresponding localized pathname.
 */
export function getLocalizedPath(pathname: string, targetLang: Language): string {
  // Normalize path by removing /zh prefix if present
  let cleanPath = pathname;
  if (cleanPath.startsWith('/zh/') || cleanPath === '/zh') {
    cleanPath = cleanPath.replace(/^\/zh/, '') || '/';
  }

  // Ensure trailing slash for non-anchor routes to match site conventions
  if (targetLang === 'zh') {
    if (cleanPath === '/') return '/zh/';
    return `/zh${cleanPath.endsWith('/') ? cleanPath : cleanPath + '/'}`;
  } else {
    if (cleanPath === '/') return '/';
    return cleanPath.endsWith('/') ? cleanPath : cleanPath + '/';
  }
}
