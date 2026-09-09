/**
 * Language provider. Pre-session pages use the URL ?lang= override or a saved
 * UI preference; session pages are driven by the session's own language
 * (session.language fetched from the server). Every user-visible string comes
 * from dict(lang) in packages/shared/src/i18n.ts — never hardcoded copy.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { dict, type Dict } from '@2027strategy/shared';
import type { Language } from '@2027strategy/shared';

export type { Dict, Language };

const STORAGE_KEY = '2027:uiLang';
const QUERY_KEY = 'lang';

function normalizeLang(value: string | null | undefined): Language {
  return value === 'zh-CN' ? 'zh-CN' : 'en';
}

function readInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  const query = new URLSearchParams(window.location.search).get(QUERY_KEY);
  if (query) return normalizeLang(query);
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeLang(saved);
  } catch {
    /* storage unavailable */
  }
  return 'en';
}

export interface I18nValue {
  lang: Language;
  /** dict() result for the current language */
  t: Dict;
  setLang: (lang: Language) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }): JSX.Element {
  const [lang, setLangState] = useState<Language>(readInitialLanguage);

  const setLang = (next: Language): void => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = dict(lang).meta.title;
  }, [lang]);

  const value = useMemo<I18nValue>(() => ({ lang, t: dict(lang), setLang }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <LanguageProvider>');
  return ctx;
}

/** Language used for a *session* page: always the session's language. */
export function sessionLanguage(sessionLang: Language): Language {
  return sessionLang === 'zh-CN' ? 'zh-CN' : 'en';
}
