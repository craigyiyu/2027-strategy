/**
 * ErrorNotice — a localized alert banner. `message` must already be resolved
 * dictionary copy for the active language; raw server strings are never shown.
 */
import type { ReactNode } from 'react';
import { dict, type Language } from '@2027strategy/shared';
import { Button } from './ui';

export function ErrorNotice({
  lang,
  message,
  onRetry,
  children,
}: {
  lang: Language;
  message: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  const t = dict(lang);
  return (
    <div className="error-notice" role="alert">
      <p className="error-notice-msg">{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {t.errors.safeRetry}
        </Button>
      ) : null}
      {children}
    </div>
  );
}
