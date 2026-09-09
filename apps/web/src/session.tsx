/**
 * Session context — fetches the session safe state for /session/:token pages
 * and drives interview language/status guards shared by Interview, Reflection
 * and Preview routes.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useParams } from 'react-router-dom';
import { dict } from '@2027strategy/shared';
import type { Language } from '@2027strategy/shared';
import { ApiError, getSession, type SessionState } from './api';
import { useI18n } from './i18n';

export type SessionLoad =
  | { phase: 'loading'; token: string }
  | { phase: 'ready'; token: string; session: SessionState }
  | { phase: 'error'; token: string; error: ApiError };

interface SessionValue {
  load: SessionLoad;
  session: SessionState | null;
  token: string;
  error: ApiError | null;
  reload: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const params = useParams<{ token: string }>();
  const token = params.token ?? '';
  const [load, setLoad] = useState<SessionLoad>({ phase: 'loading', token });
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    setLoad({ phase: 'loading', token });
    try {
      const res = await getSession(token);
      setLoad({ phase: 'ready', token, session: res.session });
    } catch (err) {
      setLoad({
        phase: 'error',
        token,
        error: err instanceof ApiError ? err : new ApiError(0, 'network', 'Network request failed.'),
      });
    } finally {
      inFlight.current = false;
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void reload();
  }, [reload, token]);

  const value = useMemo<SessionValue>(
    () => ({
      load,
      session: load.phase === 'ready' ? load.session : null,
      token,
      error: load.phase === 'error' ? load.error : null,
      reload,
    }),
    [load, token, reload],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

/**
 * Language for a session-backed page: the session's own language, falling
 * back to the UI preference while the session is still loading.
 */
export function useSessionLang(): { lang: Language; t: ReturnType<typeof dict> } {
  const { session, load } = useSession();
  const { lang: uiLang } = useI18n();
  const lang = load.phase === 'ready' && session ? session.language : uiLang;
  return useMemo(() => ({ lang, t: dict(lang) }), [lang]);
}
