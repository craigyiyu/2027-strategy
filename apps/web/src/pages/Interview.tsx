/**
 * Interview — one question per screen (Q1..Q8 by session language + lens
 * hint), targeted follow-ups as their own cards, autosave indicator,
 * sensitive-input pre-scan, and status-driven exit cards.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CORE_STAGES,
  dict,
  scanSensitive,
  STAGE_CONTENT,
  type CoreStageId,
  type Dict,
  type Language,
  type SensitivityCategory,
} from '@2027strategy/shared';
import { useSession, useSessionLang } from '../session';
import { fmt } from '../format';
import {
  ApiError,
  newIdempotencyKey,
  skipStage,
  submitAnswer,
  submitFollowup,
} from '../api';
import { Button, LiveRegion, useHeadingFocus } from '../components/ui';
import { TopBar } from '../components/TopBar';
import { ProgressRail } from '../components/ProgressRail';
import { SensitiveWarning } from '../components/SensitiveWarning';
import { ErrorNotice } from '../components/ErrorNotice';
import { ConfirmDialog } from '../components/Modal';
import { IconArrowRight, IconChevronDown, IconLightbulb, IconShield } from '../components/icons';

const ANSWER_MIN_LENGTH = 20;
const MAX_ANSWER_LENGTH = 6000;
const FU_STORAGE_PREFIX = '2027:fuq:';

type AutosaveState = 'idle' | 'saving' | 'saved' | 'error';

interface FuRecord {
  stage: CoreStageId;
  question: string;
}

function readStoredFollowup(token: string): FuRecord | null {
  try {
    const raw = window.sessionStorage.getItem(`${FU_STORAGE_PREFIX}${token}`);
    return raw ? (JSON.parse(raw) as FuRecord) : null;
  } catch {
    return null;
  }
}

function writeStoredFollowup(token: string, stage: CoreStageId, question: string): void {
  try {
    window.sessionStorage.setItem(`${FU_STORAGE_PREFIX}${token}`, JSON.stringify({ stage, question }));
  } catch {
    /* ignore */
  }
}

function clearStoredFollowup(token: string): void {
  try {
    window.sessionStorage.removeItem(`${FU_STORAGE_PREFIX}${token}`);
  } catch {
    /* ignore */
  }
}

function coreIndex(stageId: CoreStageId | null): number {
  if (!stageId) return 0;
  const idx = CORE_STAGES.indexOf(stageId);
  return idx === -1 ? 0 : idx;
}

export default function Interview() {
  const { session, token, load, error, reload } = useSession();
  const navigate = useNavigate();
  const headingRef = useHeadingFocus();
  const sessionLang = useSessionLang();
  const lang: Language = session?.language ?? sessionLang.lang;
  const t: Dict = useMemo(() => dict(lang), [lang]);

  const [draft, setDraft] = useState('');
  const [autosave, setAutosave] = useState<AutosaveState>('idle');
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [skipOpen, setSkipOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [sensitive, setSensitive] = useState<{
    category: SensitivityCategory;
    text: string;
  } | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [editNotice, setEditNotice] = useState<string | null>(null);
  const [showExample, setShowExample] = useState(false);
  const lastStageRef = useRef<CoreStageId | null>(null);

  const inProgress =
    session !== null && (session.status === 'created' || session.status === 'in_progress');
  const stageId: CoreStageId | null = inProgress ? (session?.currentStageId ?? null) : null;
  const stageContent = stageId ? STAGE_CONTENT[stageId] : null;

  const followupPending = useMemo(() => {
    if (!session || !stageId) return false;
    const answered = new Set(session.answeredStages);
    return answered.has(stageId) && !answered.has(`FU-${stageId}`);
  }, [session, stageId]);

  const fuQuestion = useMemo(() => {
    const stored = readStoredFollowup(token);
    if (followupPending && stored && stored.stage === stageId && stored.question) {
      return stored.question;
    }
    return null;
  }, [followupPending, stageId, token]);

  const currentIndex = stageId ? coreIndex(stageId) : null;

  // Announce + focus the new question when the presented stage changes.
  useEffect(() => {
    if (lastStageRef.current !== stageId) {
      lastStageRef.current = stageId;
      setDraft('');
      setAck(null);
      setAutosave('idle');
      setPageError(null);
      setEditNotice(null);
      setShowExample(false);
      const id = window.setTimeout(() => headingRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [stageId, headingRef]);

  useEffect(() => {
    document.title = t.meta.title;
  }, [t]);

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
            <>
              <p className="page-subtitle">
                {error?.status === 0 ? t.errors.network : t.errors.generic}
              </p>
              <div className="session-end-actions">
                <Button onClick={() => void reload()}>{t.errors.safeRetry}</Button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  // Post-interview statuses: show the right resume/exit card.
  if (!inProgress) {
    return <ResumeCard lang={lang} t={t} session={session} token={token} />;
  }

  if (!stageId || !stageContent) {
    return (
      <div className="app-shell">
        <TopBar lang={lang} />
        <div className="container session-end">
          <ErrorNotice lang={lang} message={t.errors.generic} onRetry={() => void reload()} />
        </div>
      </div>
    );
  }

  const question = stageContent.question[lang];
  const isFollowupView = followupPending;

  const confirmLeave = (): void => {
    setLeaveOpen(false);
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const confirmSkip = async (): Promise<void> => {
    setSkipOpen(false);
    setBusy(true);
    setAutosave('saving');
    setPageError(null);
    try {
      await skipStage(token);
      clearStoredFollowup(token);
      setAutosave('saved');
      await reload();
    } catch (err) {
      setAutosave('error');
      setPageError(messageForError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const submitText = async (text: string): Promise<void> => {
    if (busy) return;
    const trimmed = text.trim();
    if (!trimmed) {
      setPageError(t.interview.answerEmpty);
      return;
    }
    if (trimmed.length < ANSWER_MIN_LENGTH) {
      setPageError(t.interview.answerTooShort);
      return;
    }
    const scan = scanSensitive(trimmed);
    if (scan.state === 'blocked') {
      setSensitive({ category: scan.category, text: trimmed });
      return;
    }
    setBusy(true);
    setAutosave('saving');
    setPageError(null);
    setAck(null);
    try {
      const payload = {
        stageId: isFollowupView ? `FU-${stageId}` : stageId,
        answer: trimmed,
        idempotencyKey: newIdempotencyKey(),
      };
      const res = isFollowupView ? await submitFollowup(token, payload) : await submitAnswer(token, payload);
      setAutosave('saved');
      if (!res.duplicate) {
        if (res.assessment?.acknowledgment) setAck(res.assessment.acknowledgment);
        if (!isFollowupView && res.followupQuestion) {
          writeStoredFollowup(token, stageId, res.followupQuestion);
        }
      }
      if (isFollowupView) clearStoredFollowup(token);
      await reload();
    } catch (err) {
      setAutosave('error');
      setPageError(messageForError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const submitAbstract = async (abstractText: string): Promise<boolean> => {
    const scan = scanSensitive(abstractText);
    if (scan.state === 'blocked' || abstractText.trim().length < ANSWER_MIN_LENGTH) {
      return false;
    }
    setSensitive(null);
    await submitText(abstractText);
    return true;
  };

  const previousStages = session.answeredStages.filter(
    (s): s is CoreStageId => CORE_STAGES.includes(s as CoreStageId) && s !== stageId,
  );

  return (
    <div className="app-shell interview-app">
      <a className="skip-link" href="#question-main">
        {t.common.skipToContent}
      </a>
      <TopBar lang={lang} />
      <main id="question-main" className="interview-main">
        <div className="container interview-head">
          <ProgressRail
            currentIndex={currentIndex}
            completed={session.answeredStages}
            lang={lang}
          />
          <p className="interview-progress-text">
            {fmt(t.interview.progressLabel, {
              current: (currentIndex ?? 0) + 1,
              total: CORE_STAGES.length,
            })}
          </p>
        </div>

        <div className="container q-layout">
          <article className="question-card">
            {isFollowupView ? (
              <span className="pill pill-followup">{t.interview.followupLabel}</span>
            ) : (
              <span className="pill">{t.interview.coreQuestionPrefix}</span>
            )}

            <h1 ref={headingRef} tabIndex={-1} className="question-text">
              {isFollowupView ? (fuQuestion ?? t.interview.followupNote) : question}
            </h1>

            {isFollowupView ? (
              <p className="question-guidance">{t.interview.followupNote}</p>
            ) : (
              <>
                <p className="question-guidance">{stageContent.guidance[lang]}</p>
                <p className="question-lens">
                  <span className="question-lens-label">{t.interview.focusHintTitle}</span>
                  {stageContent.lensHint[session.lens][lang]}
                </p>
              </>
            )}

            {ack ? (
              <p className="ack-line">
                <span className="ack-label">{t.interview.ack}:</span> {ack}
              </p>
            ) : null}

            <div className="q-answer">
              <label htmlFor="interview-answer" className="sr-only">
                {isFollowupView ? (fuQuestion ?? question) : question}
              </label>
              <textarea
                id="interview-answer"
                className="textarea textarea-lg"
                rows={6}
                maxLength={MAX_ANSWER_LENGTH}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (autosave === 'saved') setAutosave('idle');
                }}
                placeholder={t.interview.textareaPlaceholder}
                aria-describedby="answer-count"
              />
              <p id="answer-count" className="char-count">
                {fmt(t.interview.charCount, { used: draft.length })}
              </p>
            </div>

            {!isFollowupView ? (
              <div className="example-toggle">
                <button
                  type="button"
                  className="text-link"
                  aria-expanded={showExample}
                  onClick={() => setShowExample((v) => !v)}
                >
                  {t.interview.exampleToggle}
                  <IconChevronDown size={14} className={showExample ? 'flip' : ''} />
                </button>
                {showExample ? <p className="example-text">{stageContent.example[lang]}</p> : null}
              </div>
            ) : null}

            {pageError ? <ErrorNotice lang={lang} message={pageError} /> : null}

            <div className="q-actions">
              <span className="q-actions-left">
                <Button variant="ghost" onClick={() => setLeaveOpen(true)} disabled={busy}>
                  {t.common.back}
                </Button>
              </span>
              <AutosaveIndicator state={autosave} t={t} />
              <span className="q-actions-right">
                <Button variant="ghost" onClick={() => setSkipOpen(true)} disabled={busy}>
                  {t.common.skip}
                </Button>
                <Button variant="secondary" onClick={() => setLeaveOpen(true)} disabled={busy}>
                  {t.common.saveAndExit}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void submitText(draft)}
                  disabled={busy || autosave === 'saving'}
                >
                  {busy ? t.common.saving : t.common.continue}
                  <IconArrowRight size={16} />
                </Button>
              </span>
            </div>

            {previousStages.length > 0 ? (
              <div className="edit-previous">
                <button
                  type="button"
                  className="text-link"
                  aria-expanded={editPanelOpen}
                  onClick={() => {
                    setEditPanelOpen((v) => !v);
                    setEditNotice(null);
                  }}
                >
                  {t.interview.editLink}
                </button>
                {editPanelOpen ? (
                  <div className="edit-previous-panel">
                    <ul className="stage-chip-list">
                      {previousStages.map((s) => (
                        <li key={s}>
                          <button
                            type="button"
                            className="stage-chip"
                            onClick={() =>
                              setEditNotice(
                                fmt(t.interview.editOnlyCurrentNote, {
                                  question: coreIndex(s) + 1,
                                }),
                              )
                            }
                          >
                            {s}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {editNotice ? (
                      <p className="field-hint" role="status">
                        {editNotice}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>

          <aside className="why-drawer">
            <details className="why-card">
              <summary>
                <IconLightbulb size={18} />
                <span>{t.interview.whyWeAskDrawerTitle}</span>
                <IconChevronDown size={16} className="why-chevron" />
              </summary>
              <div className="why-body">
                <p>
                  {isFollowupView ? t.interview.followupNote : stageContent.whyWeAsk[lang]}
                </p>
              </div>
            </details>
            <div className="save-exit-note">
              <IconShield size={16} />
              <p>{t.interview.saveExitNote}</p>
            </div>
          </aside>
        </div>

        <LiveRegion text={autosaveText(autosave, t)} />

        <ConfirmDialog
          open={skipOpen}
          onClose={() => setSkipOpen(false)}
          onConfirm={() => void confirmSkip()}
          title={t.interview.skipConfirmTitle}
          body={t.interview.skipConfirmBody}
          confirmLabel={t.interview.skipConfirmAction}
          busy={busy}
        />

        <ConfirmDialog
          open={leaveOpen}
          onClose={() => setLeaveOpen(false)}
          onConfirm={confirmLeave}
          title={t.interview.backConfirmTitle}
          body={t.interview.backConfirmBody}
          confirmLabel={t.common.saveAndExit}
        />

        {sensitive ? (
          <SensitiveWarning
            open
            onClose={() => setSensitive(null)}
            category={sensitive.category}
            lang={lang}
            onSubmitAbstract={(abstract) => submitAbstract(abstract)}
          />
        ) : null}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

function autosaveText(state: AutosaveState, t: Dict): string {
  switch (state) {
    case 'saving':
      return `${t.interview.autosaveLabel}: ${t.common.saving}`;
    case 'saved':
      return `${t.interview.autosaveLabel}: ${t.common.saved}`;
    case 'error':
      return `${t.interview.autosaveLabel}: ${t.common.notSaved}`;
    default:
      return '';
  }
}

function AutosaveIndicator({ state, t }: { state: AutosaveState; t: Dict }) {
  if (state === 'idle') return null;
  return (
    <span className={`autosave-chip autosave-${state}`} aria-hidden="true">
      {autosaveText(state, t)}
    </span>
  );
}

function messageForError(err: unknown, t: Dict): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return t.errors.rateLimited;
    if (err.code === 'ai_failed' || err.status === 502) return t.errors.aiFailed;
    if (err.status === 409) return t.errors.stageNotCurrent;
    if (err.status === 0) return t.errors.network;
    return t.errors.generic;
  }
  return t.errors.network;
}

function ResumeCard({
  lang,
  t,
  session,
  token,
}: {
  lang: Language;
  t: Dict;
  session: { status: string };
  token: string;
}) {
  const navigate = useNavigate();
  const status = session.status;
  const isConfirmed =
    status === 'preview_ready' || status === 'report_ready' || status === 'completed' || status === 'delivery_choice';

  const title = status === 'reflection_ready' ? t.interview.completeTitle : t.interview.resumeTitle;
  const body =
    status === 'reflection_ready' ? t.interview.completeBody : t.interview.previewReadyBody;
  const cta = isConfirmed ? t.interview.continuePreview : t.interview.resumeReview;
  const path = isConfirmed
    ? `/session/${encodeURIComponent(token)}/preview`
    : `/session/${encodeURIComponent(token)}/review`;

  return (
    <div className="app-shell">
      <TopBar lang={lang} />
      <main className="container session-end">
        <h1 tabIndex={-1} className="page-title">
          {title}
        </h1>
        <p className="page-subtitle">{body}</p>
        {status === 'reflection_ready' ? (
          <p className="post-edit-note">{t.interview.postCompleteEditNote}</p>
        ) : null}
        <div className="session-end-actions">
          <Button variant="primary" onClick={() => navigate(path)}>
            {cta}
          </Button>
        </div>
      </main>
    </div>
  );
}
