// Sistema de traducción Zenythic
// Uso: const t = useTranslations(Astro.url); t('hero.title')

import es from './es.json';
import en from './en.json';

export const languages = {
  es: 'Español',
  en: 'English',
} as const;

export const defaultLang = 'es';

export const dictionaries = { es, en } as const;

// Devuelve el código de idioma a partir de la URL
export function getLangFromUrl(url: URL): Lang {
  const [, lang] = url.pathname.split('/');
  if (lang in languages) return lang as Lang;
  return defaultLang;
}

// Construye el path equivalente en el otro idioma
export function getLocalisedPath(url: URL, target: Lang): string {
  const segments = url.pathname.split('/').filter(Boolean);
  // quita el segmento de idioma si existe
  if (segments[0] && segments[0] in languages) segments.shift();
  const rest = segments.length ? '/' + segments.join('/') : '';
  return target === defaultLang ? rest || '/' : `/${target}${rest}`;
}

export type Lang = keyof typeof languages;

export function useTranslations(lang: Lang) {
  const dict = dictionaries[lang] ?? dictionaries[defaultLang];
  return function t(key: string): string {
    const value = key.split('.').reduce((acc: any, k) => acc?.[k], dict);
    return value ?? key;
  };
}
