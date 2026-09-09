/** Compact editorial top bar (wordmark + privacy/method links + language). */
import { Link } from 'react-router-dom';
import { dict, type Language } from '@2027strategy/shared';
import { LangSwitch } from './ui';

export function TopBar({
  lang,
  langSwitch = false,
}: {
  lang: Language;
  langSwitch?: boolean;
}) {
  const t = dict(lang);
  return (
    <header className="topbar no-print">
      <div className="container topbar-inner">
        <Link to="/" className="topbar-brand">
          <span className="wordmark">{t.common.productName}</span>
        </Link>
        <nav className="topbar-nav" aria-label="Primary">
          <Link to="/method" className="topbar-link">
            {t.common.methodLink}
          </Link>
          <Link to="/privacy" className="topbar-link">
            {t.common.privacyLink}
          </Link>
          {langSwitch ? <LangSwitch className="topbar-lang" /> : null}
        </nav>
      </div>
    </header>
  );
}
