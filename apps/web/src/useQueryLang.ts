/**
 * Effective language for standalone (non-session) pages: a ?lang= query
 * override wins, otherwise the saved UI preference applies. Switching clears
 * the query override so the toggle is never stuck.
 */
import { useLocation, useNavigate } from 'react-router-dom';
import { dict, type Language } from '@2027strategy/shared';
import { useI18n } from './i18n';

export function useQueryLang(): Language {
  const { lang } = useI18n();
  const location = useLocation();
  const query = new URLSearchParams(location.search).get('lang');
  if (query === 'zh-CN' || query === 'en') return query;
  return lang;
}

export function useUiLanguage() {
  const { lang, setLang } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const effective = useQueryLang();

  const switchLang = (next: Language): void => {
    const params = new URLSearchParams(location.search);
    const hadOverride = params.get('lang') !== null;
    setLang(next);
    if (hadOverride) {
      params.delete('lang');
      const search = params.toString();
      navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true });
    }
  };

  return { lang: effective, setLang: switchLang, t: dict(effective) };
}
