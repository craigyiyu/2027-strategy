/**
 * Reflection — the four evidence groups (facts, assumptions, candidate
 * diagnoses with support & counter-evidence, conflicts/missing evidence),
 * proposed crux + decision; corrections before confirm & preview generation.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CORE_STAGES,
  type ReflectionOutput,
} from '@2027strategy/shared';
import { useSession, useSessionLang } from '../session';
import { fmt } from '../format';
import {
  ApiError,
  confirmReflection,
  generateReflection,
  newIdempotencyKey,
} from '../api';
import { Button, FocusableH1, PageShell } from '../components/ui';
import { TopBar } from '../components/TopBar';
import { ErrorNotice } from '../components/ErrorNotice';
import { ConfirmDialog } from '../components/Modal';
import { IconCheck } from '../components/icons';

type GenState = 'idle' | 'loading' | 'ready' | 'failed';

export default function Reflection() {
  const { session, token, load, error, reload } = useSession();
  const { lang } = useSessionLang();

  const [reflection, setReflection] = useState<ReflectionOutput | null>(null);
  const [gen, setGen] = useState<GenState>('idle');
  const [genError, setGenError] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState<{ message: string; missing: string[] } | null>(null);
  const [corrections, setCorrections] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const t = useSessionLang().t;
  const genInFlight = useRef(false);

  const generate = async (): Promise<void> => {
    if (!token || genInFlight.current) return;
    genInFlight.current = true;
    setGen('loading');
    setGenError(null);
    setInsufficient(null);
    setReflection(null);
    try {
      const res = await generateReflection(token);
      setReflection(res.reflection);
      setGen('ready');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'insufficient_input') {
        const answered = new Set(session?.answeredStages ?? []);
        const missing = CORE_STAGES.filter((s) => !answered.has(s));
        setInsufficient({ message: err.message, missing });
        setGen('idle');
      } else if (err instanceof ApiError && err.status === 409) {
        // interview not complete — the page shows the correct CTA anyway
        setGen('idle');
      } else if (err instanceof ApiError && err.code === 'ai_failed') {
        setGenError(t.errors.aiFailed);
        setGen('failed');
      } else {
        setGenError(err instanceof ApiError && err.status === 0 ? t.errors.network : t.errors.generic);
        setGen('failed');
      }
    } finally {
      genInFlight.current = false;
    }
  };

  useEffect(() => {
    document.title = t.meta.title;
    if (session && session.status === 'reflection_ready') {
      void generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status, token]);

  const confirm = async (): Promise<void> => {
    setConfirmOpen(false);
    setBusy(true);
    setConfirmError(null);
    try {
      await confirmReflection(token, {
        corrections,
        confirmation: 'confirm',
        idempotencyKey: newIdempotencyKey(),
      });
      await reload();
    } catch (err) {
      setConfirmError(messageForConfirmError(err, t));
      setBusy(false);
    }
  };

  if (load.phase === 'loading' || !session) {
    return (
      <div className="app-shell session-busy">
        <TopBar lang={lang} />
        <p className="page-subtitle">{t.common.loading}</p>
      </div>
    );
  }

  if (load.phase === 'error') {
    return (
      <div className="app-shell">
        <TopBar lang={lang} />
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

  // ---- pre-completion: send the user back to the interview ----
  if (session.status === 'created' || session.status === 'in_progress') {
    return (
      <PageShell topBar={<TopBar lang={lang} />}>
        <FocusableH1>{t.reflection.title}</FocusableH1>
        <p className="page-subtitle">{t.reflection.subtitle}</p>
        <p className="field-hint">{t.reflection.insufficientBody.replace('{n}', '5')}</p>
        <div className="session-end-actions">
          <ButtonLinkInterview token={token} label={t.reflection.backAction} />
        </div>
      </PageShell>
    );
  }

  // ---- already confirmed: go to the preview ----
  if (
    session.status === 'preview_ready' ||
    session.status === 'reflection_confirmed' ||
    session.status === 'report_ready' ||
    session.status === 'delivery_choice' ||
    session.status === 'completed'
  ) {
    return (
      <PageShell topBar={<TopBar lang={lang} />}>
        <FocusableH1>{t.reflection.title}</FocusableH1>
        <p className="page-subtitle">{t.interview.previewReadyBody}</p>
        <div className="session-end-actions">
          <Link
            to={`/session/${encodeURIComponent(token)}/preview`}
            className="btn btn-primary"
          >
            {t.interview.continuePreview}
          </Link>
        </div>
      </PageShell>
    );
  }

  const headerNote = gen === 'loading' ? t.common.loading : null;

  return (
    <PageShell topBar={<TopBar lang={lang} />}>
      <FocusableH1>{t.reflection.title}</FocusableH1>
      <p className="page-subtitle">{t.reflection.subtitle}</p>

      {headerNote ? <p className="page-subtitle" role="status">{headerNote}</p> : null}

      {confirmError ? <ErrorNotice lang={lang} message={confirmError} /> : null}

      {gen === 'failed' ? <ErrorNotice lang={lang} message={genError ?? t.errors.generic} onRetry={() => void generate()} /> : null}

      {insufficient ? (
        <div className="insufficient" role="alert">
          <h2 className="insufficient-title">{t.reflection.insufficientTitle}</h2>
          <p className="page-subtitle">
            {fmt(t.reflection.insufficientBody, { n: '5' })}
          </p>
          {insufficient.missing.length > 0 ? (
            <p>
              {fmt(t.reflection.missingStages, {
                stages: insufficient.missing.join(', '),
              })}
            </p>
          ) : null}
          <div className="session-end-actions">
            <ButtonLinkInterview token={token} label={t.reflection.backAction} />
          </div>
        </div>
      ) : null}

      {reflection && gen === 'ready' ? (
        <>
          <div className="reflection-groups">
            <section className="reflection-group" aria-labelledby="ref-decision">
              <h2 id="ref-decision" className="reflection-group-title">
                {t.reflection.decisionLabel}
              </h2>
              <p className="reflection-lead">{reflection.decision}</p>
            </section>

            <section className="reflection-group" aria-labelledby="ref-facts">
              <h2 id="ref-facts" className="reflection-group-title">
                {t.reflection.factsLabel}
              </h2>
              <BulletList items={reflection.facts} />
            </section>

            <section className="reflection-group" aria-labelledby="ref-assumptions">
              <h2 id="ref-assumptions" className="reflection-group-title">
                {t.reflection.assumptionsLabel}
              </h2>
              <BulletList items={reflection.assumptions} />
            </section>

            <section className="reflection-group" aria-labelledby="ref-diagnoses">
              <h2 id="ref-diagnoses" className="reflection-group-title">
                {t.reflection.interpretationLabel}
              </h2>
              <ul className="diagnosis-list">
                {reflection.candidate_diagnoses.map((d, idx) => (
                  <li key={`${d.diagnosis.slice(0, 24)}-${idx}`} className="diagnosis-card">
                    <h3 className="diagnosis-heading">{d.diagnosis}</h3>
                    {d.support.length > 0 ? (
                      <div className="diagnosis-block">
                        <span className="diagnosis-block-label">{t.reflection.supportLabel}</span>
                        <BulletList items={d.support} />
                      </div>
                    ) : null}
                    {d.counter_evidence.length > 0 ? (
                      <div className="diagnosis-block">
                        <span className="diagnosis-block-label diagnosis-block-counter">
                          {t.reflection.counterLabel}
                        </span>
                        <BulletList items={d.counter_evidence} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>

            <section className="reflection-group" aria-labelledby="ref-conflicts">
              <h2 id="ref-conflicts" className="reflection-group-title">
                {t.reflection.conflictsLabel}
              </h2>
              <BulletList items={[...reflection.conflicts, ...reflection.missing_evidence]} />
            </section>

            <section className="reflection-group reflection-crux" aria-labelledby="ref-crux">
              <h2 id="ref-crux" className="reflection-group-title">
                {t.reflection.cruxLabel}
              </h2>
              <p className="reflection-lead">{reflection.proposed_crux}</p>
            </section>
          </div>

          <section className="corrections-section">
            <h2 className="corrections-title">{t.reflection.correctionsLabel}</h2>
            <textarea
              id="reflection-corrections"
              className="textarea"
              rows={4}
              maxLength={4000}
              value={corrections}
              onChange={(e) => setCorrections(e.target.value)}
              placeholder={t.reflection.correctionsPlaceholder}
            />
          </section>

          <p className="method-version-line">
            {t.reflection.methodVersionLabel}: {session.methodVersion}
          </p>

          <div className="q-actions confirm-actions">
            <div>
              <ButtonLinkInterview token={token} label={t.reflection.editAnswerAction} />
            </div>
            <Button variant="primary" onClick={() => setConfirmOpen(true)}>
              {t.reflection.confirmAction}
              <IconCheck size={16} />
            </Button>
          </div>
        </>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void confirm()}
        title={t.reflection.confirmTitle}
        body={t.reflection.confirmBody}
        confirmLabel={t.reflection.confirmAction}
        busy={busy}
      />
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="bullet-list">
      {items.map((item, idx) => (
        <li key={`${idx}-${item.slice(0, 24)}`}>{item}</li>
      ))}
    </ul>
  );
}

function ButtonLinkInterview({ token, label }: { token: string; label: string }) {
  return (
    <Link to={`/session/${encodeURIComponent(token)}`} className="btn btn-secondary">
      {label}
    </Link>
  );
}

function messageForConfirmError(err: unknown, t: ReturnType<typeof useSessionLang>['t']): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return t.errors.rateLimited;
    if (err.status === 409) return t.errors.stageNotCurrent;
    if (err.status === 0) return t.errors.network;
    return t.errors.generic;
  }
  return t.errors.network;
}
