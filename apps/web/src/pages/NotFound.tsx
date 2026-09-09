/** 404 — neutral, with a way back. */
import { Link } from 'react-router-dom';
import { useUiLanguage } from '../useQueryLang';
import { Footer } from '../components/Footer';
import { TopBar } from '../components/TopBar';
import { FocusableH1, PageShell } from '../components/ui';

export default function NotFound() {
  const { lang, t } = useUiLanguage();
  return (
    <PageShell topBar={<TopBar lang={lang} langSwitch />} footer={<Footer lang={lang} />}>
      <FocusableH1>{t.errors.notFound}</FocusableH1>
      <div className="session-end-actions">
        <Link to="/" className="btn btn-primary">
          {t.common.productName}
        </Link>
      </div>
    </PageShell>
  );
}
