/**
 * Delete — explicit confirmation then a neutral receipt (no existence leak).
 * Expired/deleted tokens show the same neutral expired copy.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useUiLanguage } from '../useQueryLang';
import { ApiError, requestDelete } from '../api';
import { Footer } from '../components/Footer';
import { TopBar } from '../components/TopBar';
import { ErrorNotice } from '../components/ErrorNotice';
import { FocusableH1, PageShell } from '../components/ui';

type DeleteUi =
  | { phase: 'form' }
  | { phase: 'deleting' }
  | { phase: 'done' }
  | { phase: 'expired' }
  | { phase: 'error' };

export default function Delete() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? '';
  const { lang, t } = useUiLanguage();
  const [confirmed, setConfirmed] = useState(false);
  const [ui, setUi] = useState<DeleteUi>({ phase: 'form' });

  useEffect(() => {
    document.title = t.meta.title;
  }, [t]);

  const submit = async (): Promise<void> => {
    if (ui.phase === 'deleting') return;
    setUi({ phase: 'deleting' });
    try {
      const res = await requestDelete(token);
      if (res.neutral) {
        setUi({ phase: 'expired' });
      } else {
        setUi({ phase: 'done' });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setUi({ phase: 'expired' });
      } else {
        setUi({ phase: 'error' });
      }
    }
  };

  return (
    <PageShell topBar={<TopBar lang={lang} langSwitch />} footer={<Footer lang={lang} />}>
      <FocusableH1>{t.delete.title}</FocusableH1>

      {ui.phase === 'form' || ui.phase === 'deleting' ? (
        <div className="delete-form">
          <p className="page-subtitle">{t.delete.body}</p>
          <label className="checkbox-row" htmlFor="delete-confirm">
            <input
              id="delete-confirm"
              type="checkbox"
              checked={confirmed}
              disabled={ui.phase === 'deleting'}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span className="checkbox-copy">{t.delete.confirmLabel}</span>
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-danger btn-lg"
              disabled={!confirmed || ui.phase === 'deleting'}
              onClick={() => void submit()}
            >
              {ui.phase === 'deleting' ? t.common.saving : t.delete.action}
            </button>
          </div>
        </div>
      ) : null}

      {ui.phase === 'error' ? (
        <>
          <ErrorNotice lang={lang} message={t.errors.network} />
          <div className="session-end-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setUi({ phase: 'form' })}>
              {t.errors.safeRetry}
            </button>
          </div>
        </>
      ) : null}

      {ui.phase === 'done' ? (
        <div className="receipt" role="status">
          <h2 className="receipt-title">{t.delete.receiptTitle}</h2>
          <p className="page-subtitle">{t.delete.receiptBody}</p>
          <p className="receipt-neutral">{t.delete.neutralNote}</p>
        </div>
      ) : null}

      {ui.phase === 'expired' ? (
        <div className="receipt" role="status">
          <h2 className="receipt-title">{t.delete.expiredTitle}</h2>
          <p className="page-subtitle">{t.delete.expiredBody}</p>
          <p className="receipt-neutral">{t.delete.neutralNote}</p>
        </div>
      ) : null}

      {ui.phase === 'done' || ui.phase === 'expired' ? (
        <div className="session-end-actions">
          <Link to="/" className="btn btn-primary">
            {t.common.productName}
          </Link>
        </div>
      ) : null}
    </PageShell>
  );
}
