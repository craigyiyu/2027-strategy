/**
 * Preview — strategy thesis, pivotal challenge, ≤3 priorities, stop/defer,
 * unresolved tension + readiness snapshot; then choose on-screen full report
 * (anonymous) or email delivery with 4 separate consent choices.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PreviewResponse } from '@2027strategy/shared';
import { useSession, useSessionLang } from '../session';
import {
  ApiError,
  getPreview,
  newIdempotencyKey,
  submitDelivery,
} from '../api';
import { Button, FocusableH1, PageShell, TextInput, useFieldId } from '../components/ui';
import { TopBar } from '../components/TopBar';
import { ErrorNotice } from '../components/ErrorNotice';
import { ConsentPanel, type ConsentState } from '../components/ConsentPanel';
import { ReadinessSnapshot } from '../components/ReadinessSnapshot';
import { IconArrowRight, IconMail } from '../components/icons';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type PreviewLoad = 'idle' | 'loading' | 'ready' | 'error';

export default function Preview() {
  const { session, token, load, error, reload } = useSession();
  const navigate = useNavigate();
  const sessionLang = useSessionLang();
  const lang = session?.language ?? sessionLang.lang;
  const t = useSessionLang().t;

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewState, setPreviewState] = useState<PreviewLoad>('idle');
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [consents, setConsents] = useState<ConsentState>({
    reportDelivery: false,
    newsletter: false,
    pulse: false,
    followup: false,
  });
  const [deliverError, setDeliverError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fetchInFlight = useRef(false);

  const emailId = useFieldId('delivery-email');
  const firstId = useFieldId('delivery-first');

  const fetchPreview = async (): Promise<void> => {
    if (!token || fetchInFlight.current) return;
    fetchInFlight.current = true;
    setPreviewState('loading');
    setPreviewError(null);
    try {
      const res = await getPreview(token);
      setPreview(res.preview);
      setPreviewState('ready');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // reflection not confirmed yet — route to review
        setPreviewState('error');
        setPreviewError('review');
      } else if (err instanceof ApiError && err.code === 'ai_failed') {
        setPreviewState('error');
        setPreviewError('ai_failed');
      } else if (err instanceof ApiError && err.status === 0) {
        setPreviewState('error');
        setPreviewError('network');
      } else {
        setPreviewState('error');
        setPreviewError('generic');
      }
    } finally {
      fetchInFlight.current = false;
    }
  };

  useEffect(() => {
    document.title = t.meta.title;
  }, [t]);

  const canPreview =
    session !== null &&
    (session.status === 'preview_ready' ||
      session.status === 'report_ready' ||
      session.status === 'delivery_choice' ||
      session.status === 'completed');

  useEffect(() => {
    if (session && canPreview && previewState === 'idle') {
      void fetchPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status, token]);

  const openReportPath = (): string => {
    // The session token also works for /report/:token (report-capability
    // lookup accepts either token), and it keeps "Edit my inputs" usable.
    return `/report/${encodeURIComponent(token)}`;
  };

  const deliver = async (): Promise<void> => {
    if (busy) return;
    const trimmedEmail = email.trim().toLowerCase();
    setDeliverError(null);
    if (!EMAIL_RE.test(trimmedEmail)) {
      setDeliverError(t.delivery.validationEmail);
      return;
    }
    if (!consents.reportDelivery) {
      setDeliverError(t.delivery.validationConsentDelivery);
      return;
    }
    setBusy(true);
    try {
      await submitDelivery(token, {
        email: trimmedEmail,
        firstName: firstName.trim() || undefined,
        consents,
        reportToken: token,
        idempotencyKey: newIdempotencyKey(),
      });
      navigate(openReportPath());
    } catch (err) {
      if (err instanceof ApiError) {
        setDeliverError(
          err.status === 429 ? t.errors.rateLimited : err.status === 0 ? t.errors.network : t.errors.emailFailed,
        );
      } else {
        setDeliverError(t.errors.emailFailed);
      }
      setBusy(false);
    }
  };

  // ---- pre-preview states ----
  if (load.phase === 'loading' || !session) {
    return (
      <div className="app-shell session-busy">
        <TopBar lang={sessionLang.lang} />
        <p className="page-subtitle">{t.common.loading}</p>
      </div>
    );
  }
  if (load.phase === 'error') {
    return (
      <div className="app-shell">
        <TopBar lang={sessionLang.lang} />
        <div className="container session-end">
          <h1 tabIndex={-1} className="page-title">
            {error?.status === 404 ? t.errors.sessionNeutral : t.errors.generic}
          </h1>
          {error?.status !== 404 ? (
            <div className="session-end-actions">
              <Button onClick={() => void reload()}>{t.errors.safeRetry}</Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (session.status === 'created' || session.status === 'in_progress') {
    return (
      <PageShell topBar={<TopBar lang={lang} />}>
        <FocusableH1>{t.preview.title}</FocusableH1>
        <p className="page-subtitle">{t.reflection.insufficientTitle}</p>
        <div className="session-end-actions">
          <Link to={`/session/${encodeURIComponent(token)}`} className="btn btn-primary">
            {t.reflection.backAction}
          </Link>
        </div>
      </PageShell>
    );
  }

  if (session.status === 'reflection_ready' || session.status === 'reflection_confirmed') {
    return (
      <PageShell topBar={<TopBar lang={lang} />}>
        <FocusableH1>{t.preview.title}</FocusableH1>
        <p className="page-subtitle">{t.interview.needConfirmBody}</p>
        <div className="session-end-actions">
          <Link
            to={`/session/${encodeURIComponent(token)}/review`}
            className="btn btn-primary"
          >
            {t.interview.resumeReview}
          </Link>
        </div>
      </PageShell>
    );
  }

  if (!canPreview) {
    return (
      <PageShell topBar={<TopBar lang={lang} />}>
        <FocusableH1>{t.preview.title}</FocusableH1>
        <ErrorNotice lang={lang} message={t.errors.generic} onRetry={() => void reload()} />
      </PageShell>
    );
  }

  return (
    <PageShell topBar={<TopBar lang={lang} />}>
      <FocusableH1>{t.preview.title}</FocusableH1>
      <p className="page-subtitle">{t.preview.subtitle}</p>

      {previewState === 'loading' ? (
        <p className="page-subtitle" role="status">
          {t.common.loading}
        </p>
      ) : null}

      {previewState === 'error' ? (
        <ErrorNotice
          lang={lang}
          message={
            previewError === 'network'
              ? t.errors.network
              : previewError === 'ai_failed'
                ? t.errors.aiFailed
                : t.errors.generic
          }
          onRetry={() => void fetchPreview()}
        />
      ) : null}

      {preview && previewState === 'ready' ? (
        <div className="preview-body">
          <div className="preview-grid">
            <div className="preview-main">
              <section className="report-section preview-section">
                <h2 className="preview-label">{t.preview.thesisLabel}</h2>
                <p className="serif-lead preview-thesis">{preview.strategyThesis}</p>
              </section>

              <section className="report-section preview-section">
                <h2 className="preview-label">{t.preview.challengeLabel}</h2>
                <p className="preview-challenge">{preview.pivotalChallenge}</p>
              </section>

              <section className="report-section preview-section">
                <h2 className="preview-label">{t.preview.prioritiesLabel}</h2>
                <ol className="priority-list">
                  {preview.proposedPriorities.map((p, i) => (
                    <li key={`${i}-${p.slice(0, 24)}`} className="priority-item">
                      <span className="priority-index" aria-hidden="true">
                        {i + 1}
                      </span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ol>
              </section>

              <section className="report-section preview-section">
                <h2 className="preview-label">{t.preview.stopDeferLabel}</h2>
                <p className="preview-challenge">{preview.stopDefer}</p>
              </section>

              <section className="report-section preview-section">
                <h2 className="preview-label">{t.preview.tensionLabel}</h2>
                <p className="preview-challenge">{preview.unresolvedTension}</p>
              </section>

              <ReadinessSnapshot items={preview.readinessSnapshot} lang={lang} />
            </div>

            <aside className="preview-side">
              <section className="delivery-panel">
                <h2 className="preview-label">{t.preview.deliveryHeading}</h2>
                <p className="field-hint">{t.preview.deliverySub}</p>

                <div className="preview-path">
                  <Link to={openReportPath()} className="btn btn-primary btn-lg btn-block">
                    {t.preview.viewFullReport}
                    <IconArrowRight size={18} />
                  </Link>
                  <p className="preview-path-note">{t.preview.anonymousPathNote}</p>
                </div>

                <div className="delivery-divider" role="separator">
                  <span>{t.preview.emailMeReport}</span>
                </div>

                {deliverError ? <ErrorNotice lang={lang} message={deliverError} /> : null}

                <div className="field">
                  <label className="field-label" htmlFor={emailId}>
                    {t.delivery.emailLabel}
                    <span className="req" aria-hidden="true">
                      {' '}
                      *
                    </span>
                  </label>
                  <TextInput
                    id={emailId}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t.delivery.emailPlaceholder}
                  />
                </div>

                <div className="field">
                  <label className="field-label" htmlFor={firstId}>
                    {t.delivery.firstNameLabel}
                  </label>
                  <TextInput
                    id={firstId}
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>

                <ConsentPanel
                  lang={lang}
                  consents={consents}
                  onChange={(key, value) => setConsents((prev) => ({ ...prev, [key]: value }))}
                />

                <Button variant="primary" block onClick={() => void deliver()} disabled={busy}>
                  {busy ? t.common.saving : t.delivery.submitDelivery}
                  <IconMail size={16} />
                </Button>

                <p className="privacy-mode-note">
                  {t.preview.refineAnswer}{' '}
                  <Link to={`/session/${encodeURIComponent(token)}`} className="text-link">
                    {t.interview.editLink}
                  </Link>
                </p>
              </section>
            </aside>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
