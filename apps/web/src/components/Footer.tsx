/** Site footer: method / privacy / optional feedback links + disclaimers. */
import { Link } from 'react-router-dom';
import { dict, type Language } from '@2027strategy/shared';

export function Footer({
  lang,
  feedbackHref,
  disclaimerOverride,
}: {
  lang: Language;
  /** optional anchor (e.g. "#feedback") shown when on the report page */
  feedbackHref?: string;
  /** e.g. the full independent-implementation disclaimer from constants */
  disclaimerOverride?: string;
}) {
  const t = dict(lang);
  return (
    <footer className="site-footer no-print">
      <div className="container">
        <nav className="footer-links" aria-label="Footer">
          <Link to="/method" className="footer-link">
            {t.common.methodLink}
          </Link>
          <Link to="/privacy" className="footer-link">
            {t.common.privacyLink}
          </Link>
          {feedbackHref ? (
            <a href={feedbackHref} className="footer-link">
              {t.report.shareFeedback}
            </a>
          ) : null}
        </nav>
        <p className="footer-disclaimer">{disclaimerOverride ?? t.common.footerDisclaimer}</p>
        <p className="footer-powered">{t.common.poweredNote}</p>
      </div>
    </footer>
  );
}
