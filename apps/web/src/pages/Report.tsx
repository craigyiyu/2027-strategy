/**
 * Report — full 12-section 2027 Strategy Brief. Evidence-labelled statements
 * everywhere; toolbar: print, email link w/ cooldown, edit link, delete,
 * inline feedback. Renders from validated ReportOutput only.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  AssumptionEntry,
  EvidenceGate,
  ExecutionMeasure,
  ReportOutput,
  ReportStatement,
  RiskReview,
  StrategicAlternative,
  ActionItem,
  Language,
} from '@2027strategy/shared';
import { dict } from '@2027strategy/shared';
import { useUiLanguage } from '../useQueryLang';
import {
  ApiError,
  getReport,
  getSession,
  getPreview,
  resendReport,
  submitFeedback,
  newIdempotencyKey,
  type SessionState,
} from '../api';
import { Button, LiveRegion, PageShell, useHeadingFocus } from '../components/ui';
import { TopBar } from '../components/TopBar';
import { Footer } from '../components/Footer';
import { PrintHeader } from '../components/PrintHeader';
import { ErrorNotice } from '../components/ErrorNotice';
import { EvidenceLabel } from '../components/EvidenceLabel';
import { ReadinessSnapshot } from '../components/ReadinessSnapshot';
import { ConfirmDialog } from '../components/Modal';
import {
  IconCheck,
  IconMail,
  IconPen,
  IconPrinter,
  IconTrash,
} from '../components/icons';

type GateState =
  | { phase: 'loading' }
  | { phase: 'neutral' }
  | { phase: 'interview'; session: SessionState }
  | { phase: 'generate'; session: SessionState }
  | { phase: 'error' }
  | { phase: 'ready'; report: ReportOutput };

export default function Report() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? '';
  const { lang: uiLang } = useUiLanguage();
  const headingRef = useHeadingFocus();

  const [gate, setGate] = useState<GateState>({ phase: 'loading' });
  const [gateError, setGateError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const [resendMsg, setResendMsg] = useState<'none' | 'sent' | 'failed' | 'cooldown'>('none');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [resendBusy, setResendBusy] = useState(false);

  const [feedbackThanks, setFeedbackThanks] = useState(false);
  const feedbackFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const res = await getReport(token);
        if (!cancelled) setGate({ phase: 'ready', report: res.report });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          try {
            const sessionRes = await getSession(token);
            if (!cancelled) {
              const st = sessionRes.session;
              if (st.status === 'created' || st.status === 'in_progress') {
                setGate({ phase: 'interview', session: st });
              } else {
                setGate({ phase: 'generate', session: st });
              }
            }
          } catch {
            if (!cancelled) setGate({ phase: 'neutral' });
          }
        } else if (err instanceof ApiError && err.status === 0) {
          if (!cancelled) {
            setGateError('network');
            setGate({ phase: 'error' });
          }
        } else if (!cancelled) {
          setGateError('generic');
          setGate({ phase: 'error' });
        }
      }
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const reportLang: Language = gate.phase === 'ready' ? gate.report.language : uiLang;
  const t = useMemo(() => dict(reportLang), [reportLang]);

  useEffect(() => {
    document.title = t.meta.title;
  }, [t]);

  const generateNow = async (): Promise<void> => {
    setGenerating(true);
    try {
      await getPreview(token);
      const res = await getReport(token);
      setGate({ phase: 'ready', report: res.report });
    } catch (err) {
      setGateError(
        err instanceof ApiError && err.status === 0
          ? 'network'
          : err instanceof ApiError && err.code === 'ai_failed'
            ? 'ai_failed'
            : 'generic',
      );
      setGate({ phase: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  const doResend = async (): Promise<void> => {
    if (resendBusy) return;
    setResendBusy(true);
    setResendMsg('none');
    try {
      await resendReport(token);
      setResendMsg('sent');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const secs = err.detail.retryAfterSeconds ?? 60;
        setCooldownSeconds(secs);
        setResendMsg('cooldown');
      } else {
        setResendMsg('failed');
      }
    } finally {
      setResendBusy(false);
    }
  };

  // countdown ticker for resend cooldown
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const id = window.setInterval(() => {
      setCooldownSeconds((s) => {
        if (s <= 1) {
          window.clearInterval(id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldownSeconds > 0]);

  if (gate.phase === 'loading') {
    return (
      <div className="app-shell session-busy">
        <TopBar lang={uiLang} />
        <p className="page-subtitle">{t.common.loading}</p>
      </div>
    );
  }

  if (gate.phase === 'neutral' || gate.phase === 'error') {
    return (
      <PageShell topBar={<TopBar lang={uiLang} />}>
        <h1 ref={headingRef} tabIndex={-1} className="page-title">
          {gate.phase === 'neutral' ? t.errors.sessionNeutral : t.errors.generic}
        </h1>
        {gate.phase === 'error' ? (
          <ErrorNotice
            lang={uiLang}
            message={gateError === 'network' ? t.errors.network : t.errors.generic}
          />
        ) : null}
        <div className="session-end-actions">
          <Link to="/" className="btn btn-primary">
            {t.common.productName}
          </Link>
        </div>
      </PageShell>
    );
  }

  if (gate.phase === 'interview') {
    return (
      <PageShell topBar={<TopBar lang={uiLang} />}>
        <h1 ref={headingRef} tabIndex={-1} className="page-title">
          {t.report.title}
        </h1>
        <p className="page-subtitle">{t.interview.completeBody}</p>
        <div className="session-end-actions">
          <Link to={`/session/${encodeURIComponent(token)}`} className="btn btn-primary">
            {t.interview.continue}
          </Link>
        </div>
      </PageShell>
    );
  }

  if (gate.phase === 'generate') {
    return (
      <PageShell topBar={<TopBar lang={uiLang} />}>
        <h1 ref={headingRef} tabIndex={-1} className="page-title">
          {t.report.title}
        </h1>
        <p className="page-subtitle">{t.preview.subtitle}</p>
        <div className="session-end-actions">
          <Button variant="primary" onClick={() => void generateNow()} disabled={generating}>
            {generating ? t.common.saving : t.report.generateAction}
          </Button>
        </div>
      </PageShell>
    );
  }

  const report = gate.report;

  return (
    <PageShell
      topBar={<TopBar lang={reportLang} />}
      footer={<Footer lang={reportLang} feedbackHref="#feedback" />}
    >
      <PrintHeader
        title={t.report.title}
        meta={
          <>
            <p>{t.report.confidentiality}</p>
            <p>{t.report.methodBadge}</p>
          </>
        }
      />

      {/* on-screen toolbar (hidden in print) */}
      <div className="report-toolbar no-print">
        <Button variant="secondary" onClick={() => window.print()}>
          <IconPrinter size={16} />
          {t.report.print}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void doResend()}
          disabled={resendBusy || cooldownSeconds > 0}
        >
          <IconMail size={16} />
          {cooldownSeconds > 0
            ? t.report.resend
            : resendMsg === 'none'
              ? t.report.emailLink
              : t.report.resend}
        </Button>
        <Link to={`/session/${encodeURIComponent(token)}`} className="btn btn-secondary">
          <IconPen size={16} />
          {t.report.editInputs}
        </Link>
        <Link to={`/delete/${encodeURIComponent(token)}`} className="btn btn-danger">
          <IconTrash size={16} />
          {t.report.deleteMyData}
        </Link>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => feedbackFormRef.current?.focus()}
        >
          {t.report.shareFeedback}
        </button>
      </div>

      {resendMsg === 'sent' ? (
        <div className="notice notice-ok" role="status">
          {t.report.emailSentNote}
        </div>
      ) : null}
      {resendMsg === 'failed' ? (
        <div className="notice notice-warn" role="status">
          {t.report.emailFailedNote}
        </div>
      ) : null}
      {resendMsg === 'cooldown' ? (
        <div className="notice notice-warn" role="status">
          {t.report.resendCooldown.replace('{seconds}', String(cooldownSeconds))}
        </div>
      ) : null}
      <LiveRegion text={resendMsg === 'sent' ? t.report.emailSentNote : ''} />

      <ReportDocument report={report} lang={reportLang} />

      {/* feedback */}
      <section
        id="feedback"
        className="feedback-section report-section"
        ref={feedbackFormRef}
        tabIndex={-1}
        aria-label={t.feedback.title}
      >
        <FeedbackForm
          token={token}
          lang={reportLang}
          onThanks={() => setFeedbackThanks(true)}
          thanked={feedbackThanks}
        />
      </section>
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/* Report document                                                     */
/* ------------------------------------------------------------------ */

function ReportDocument({ report, lang }: { report: ReportOutput; lang: Language }) {
  const t = dict(lang);
  return (
    <article className="report-document">
      <header className="report-document-header">
        <h1 className="report-document-title">{t.report.title}</h1>
        <p className="report-document-subtitle">{t.report.subtitle}</p>
        <p className="report-method-line">
          {t.report.methodBadge} — {report.modelId} · {t.report.methodLine}
        </p>
        <p className="report-confidential">{t.report.confidentiality}</p>
      </header>

      <section className="report-thesis report-section" aria-label="Thesis">
        <p className="report-thesis-text">{report.strategyThesis}</p>
      </section>

      {report.readinessSnapshot && report.readinessSnapshot.length > 0 ? (
        <ReadinessSnapshot items={report.readinessSnapshot} lang={lang} />
      ) : null}

      <Section num={1} title={t.report.sectionTitles.s1}>
        <Statement lead stmt={report.decisionBrief.decision} lang={lang} />
        <SubHeading text={t.report.labels.decisionScope} />
        <StatementList statements={report.decisionBrief.scope} lang={lang} />
        <p className="kv-line">
          <strong>{t.report.labels.deadline}</strong> {report.decisionBrief.deadline}
        </p>
        <p className="kv-line">
          <strong>{t.report.labels.approver}</strong> {report.decisionBrief.approver}
        </p>
        <SubHeading text={t.report.labels.hardConstraints} />
        <StatementList statements={report.decisionBrief.hardConstraints} lang={lang} />
      </Section>

      <Section num={2} title={t.report.sectionTitles.s2}>
        <StatementList statements={report.evidenceBase} lang={lang} />
      </Section>

      <Section num={3} title={t.report.sectionTitles.s3}>
        <SubHeading text={t.report.labels.symptoms} />
        <StatementList statements={report.challengeDiagnosis.symptoms} lang={lang} />
        <SubHeading text={t.report.labels.candidateDiagnoses} />
        <ul className="diagnosis-list">
          {report.challengeDiagnosis.candidateDiagnoses.map((d, i) => (
            <li key={i} className="diagnosis-card">
              <h4 className="diagnosis-heading">{d.diagnosis}</h4>
              {d.support.length ? (
                <ul className="bullet-list">
                  {d.support.map((s, j) => (
                    <li key={j}>{s}</li>
                  ))}
                </ul>
              ) : null}
              {d.counter_evidence.length ? (
                <ul className="bullet-list bullet-counter">
                  {d.counter_evidence.map((s, j) => (
                    <li key={j}>{s}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
        <SubHeading text={t.report.labels.confirmedDiagnosis} />
        <Statement lead stmt={report.challengeDiagnosis.confirmedDiagnosis} lang={lang} />
      </Section>

      <Section num={4} title={t.report.sectionTitles.s4}>
        <Statement lead stmt={report.crux.cruxStatement} lang={lang} />
        {report.crux.whyNow.length ? (
          <>
            <SubHeading text={t.report.labels.whyNow} />
            <StatementList statements={report.crux.whyNow} lang={lang} />
          </>
        ) : null}
        {report.crux.alternativesConsidered.length ? (
          <>
            <SubHeading text={t.report.labels.alternativesConsidered} />
            <ul className="bullet-list">
              {report.crux.alternativesConsidered.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </>
        ) : null}
      </Section>

      <Section num={5} title={t.report.sectionTitles.s5}>
        <div className="alternatives-grid">
          {report.strategicAlternatives.map((alt, i) => (
            <AlternativeCard key={i} alt={alt} index={i + 1} lang={lang} />
          ))}
        </div>
      </Section>

      <Section num={6} title={t.report.sectionTitles.s6}>
        <ChoiceLine label={t.report.labels.winningAspiration} stmt={report.choiceContract.winningAspiration} lang={lang} />
        <ChoiceLine label={t.report.labels.whereToPlay} stmt={report.choiceContract.whereToPlay} lang={lang} />
        <ChoiceLine label={t.report.labels.howToWin} stmt={report.choiceContract.howToWin} lang={lang} />
        <SubHeading text={t.report.labels.requiredCapabilities} />
        <StatementList statements={report.choiceContract.requiredCapabilities} lang={lang} />
        <SubHeading text={t.report.labels.managementSystems} />
        <StatementList statements={report.choiceContract.managementSystems} lang={lang} />
      </Section>

      <Section num={7} title={t.report.sectionTitles.s7}>
        <AssumptionRegister entries={report.assumptionRegister} lang={lang} />
        <SubHeading text={t.report.labels.reverseEconomics} />
        <ul className="bullet-list">
          {report.reverseEconomics.mustBeTrueForValue.map((v, i) => (
            <li key={`v-${i}`}>{v}</li>
          ))}
          {report.reverseEconomics.mustBeTrueForCost.map((c, i) => (
            <li key={`c-${i}`}>{c}</li>
          ))}
        </ul>
        {report.reverseEconomics.statements && report.reverseEconomics.statements.length ? (
          <StatementList statements={report.reverseEconomics.statements} lang={lang} />
        ) : null}
      </Section>

      <Section num={8} title={t.report.sectionTitles.s8}>
        <EvidenceGatesTable gates={report.evidenceGates} lang={lang} />
      </Section>

      <Section num={9} title={t.report.sectionTitles.s9}>
        <ActionPortfolio actions={report.actionPortfolio} lang={lang} />
        <SubHeading text={t.report.labels.stopDefer} />
        <StatementList statements={report.stopDefer} lang={lang} />
      </Section>

      <Section num={10} title={t.report.sectionTitles.s10}>
        <ExecutionMap measures={report.executionMeasures} lang={lang} />
      </Section>

      <Section num={11} title={t.report.sectionTitles.s11}>
        <ul className="risk-list">
          {report.riskReviews.map((risk, i) => (
            <RiskRow key={i} risk={risk} lang={lang} />
          ))}
        </ul>
      </Section>

      <Section num={12} title={t.report.sectionTitles.s12}>
        <Statement lead stmt={report.decisionRecord.confirmedDecision} lang={lang} />
        <SubHeading text={t.report.labels.pendingOwnerDecisions} />
        <ul className="bullet-list">
          {report.decisionRecord.pendingOwnerDecisions.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
        <SubHeading text={t.report.labels.revisitTriggers} />
        <ul className="bullet-list">
          {report.decisionRecord.revisitTriggers.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
        <p className="kv-line">
          <strong>{t.report.labels.reviewCadence}</strong> {report.decisionRecord.reviewCadence}
        </p>
        {report.decisionRecord.approvedBy.length ? (
          <SubHeading text={t.report.labels.approvedBy} />
        ) : null}
        {report.decisionRecord.approvedBy.length ? (
          <ul className="bullet-list">
            {report.decisionRecord.approvedBy.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        ) : null}
      </Section>

      <footer className="report-footer">
        <p>{t.report.footer.humanDecisionNote}</p>
        <p>{t.report.footer.needsValidationNote}</p>
        <p className="report-method-attribution">{t.report.methodAttribution}</p>
        {report.limitations.length ? (
          <ul className="bullet-list">
            {report.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        ) : null}
      </footer>
    </article>
  );
}

function Section({
  num,
  title,
  children,
}: {
  num: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="report-section" aria-labelledby={`report-section-${num}`}>
      <h2 id={`report-section-${num}`} className="report-section-title">
        {title}
      </h2>
      <div className="report-section-body">{children}</div>
    </section>
  );
}

function SubHeading({ text }: { text: string }) {
  return <h3 className="report-subheading">{text}</h3>;
}

function Statement({
  stmt,
  lang,
  lead = false,
}: {
  stmt: ReportStatement;
  lang: Language;
  lead?: boolean;
}) {
  return (
    <p className={lead ? 'report-statement-lead' : 'report-statement'}>
      <span className="statement-text">{stmt.text}</span>{' '}
      <EvidenceLabel label={stmt.label} lang={lang} />
      {stmt.note ? <span className="statement-note">{stmt.note}</span> : null}
    </p>
  );
}

function StatementList({ statements, lang }: { statements: ReportStatement[]; lang: Language }) {
  return (
    <ul className="statement-list">
      {statements.map((s, i) => (
        <li key={i} className="statement-list-item">
          <span className="statement-text">{s.text}</span>{' '}
          <EvidenceLabel label={s.label} lang={lang} />
          {s.note ? <span className="statement-note">{s.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function ChoiceLine({
  label,
  stmt,
  lang,
}: {
  label: string;
  stmt: ReportStatement;
  lang: Language;
}) {
  return (
    <div className="choice-line">
      <span className="choice-line-label">{label}</span>
      <span className="statement-text">{stmt.text}</span>{' '}
      <EvidenceLabel label={stmt.label} lang={lang} />
    </div>
  );
}

function AlternativeCard({ alt, index, lang }: { alt: StrategicAlternative; index: number; lang: Language }) {
  const t = dict(lang);
  return (
    <article className="alternative-card">
      <h3 className="alternative-name">
        <span className="alt-index" aria-hidden="true">
          {index}
        </span>
        {alt.name}
      </h3>
      <p className="kv-line">
        <strong>{t.report.labels.guidingPolicy}</strong> {alt.guidingPolicy}
      </p>
      <p className="kv-line">
        <strong>{t.report.labels.whereToPlay}</strong> {alt.whereToPlay}
      </p>
      <p className="kv-line">
        <strong>{t.report.labels.howToWin}</strong> {alt.howToWin}
      </p>
      {alt.tradeoffs.length ? (
        <>
          <h4 className="report-subheading">{t.report.labels.tradeoffs}</h4>
          <StatementList statements={alt.tradeoffs} lang={lang} />
        </>
      ) : null}
    </article>
  );
}

function AssumptionRegister({ entries, lang }: { entries: AssumptionEntry[]; lang: Language }) {
  const t = dict(lang);
  return (
    <ul className="assumption-list">
      {entries.map((e, i) => (
        <li key={i} className="assumption-item">
          <p className="assumption-text">
            <span className="statement-text">{e.assumption}</span>{' '}
            <EvidenceLabel label={e.label} lang={lang} />
          </p>
          <p className="assumption-meta">
            <span className="pill pill-meta">{t.report.labels.importance}</span> {e.importance}
            <span className="pill pill-meta">{t.report.labels.evidenceState}</span> {e.evidenceState}
          </p>
        </li>
      ))}
    </ul>
  );
}

function EvidenceGatesTable({ gates, lang }: { gates: EvidenceGate[]; lang: Language }) {
  const t = dict(lang);
  return (
    <ul className="gate-list">
      {gates.map((g, i) => (
        <li key={i} className="gate-row">
          <div className="gate-grid">
            <p className="kv-line">
              <strong>{t.report.labels.gateOwner}</strong> {g.owner}
            </p>
            <p className="kv-line">
              <strong>{t.report.labels.gateDecisionRule}</strong> {g.decisionRule}
            </p>
            <p className="kv-line">
              <strong>{t.report.labels.gateReviewDate}</strong> {g.reviewDate}
            </p>
          </div>
          <p className="gate-test">
            <strong>{t.report.labels.gateTest}</strong> {g.test}
          </p>
          <p className="gate-threshold">
            <strong>{t.report.labels.gateThreshold}</strong> {g.threshold}
          </p>
          <p className="gate-measure">
            <strong>{t.report.labels.gateMeasure}</strong> {g.measure}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ActionPortfolio({ actions, lang }: { actions: ActionItem[]; lang: Language }) {
  const t = dict(lang);
  return (
    <ul className="action-list">
      {actions.map((a, i) => (
        <li key={i} className="action-item">
          <p className="action-text">{a.action}</p>
          <p className="action-meta">
            <span>
              <strong>{t.report.labels.actionOwner}</strong> {a.owner}
            </span>
            <span>
              <strong>{t.report.labels.actionMilestone}</strong> {a.milestone}
            </span>
            <span>
              <strong>{t.report.labels.actionSupports}</strong> {a.supportsPriority}
            </span>
          </p>
        </li>
      ))}
    </ul>
  );
}

function ExecutionMap({ measures, lang }: { measures: ExecutionMeasure[]; lang: Language }) {
  const t = dict(lang);
  return (
    <ul className="measure-list">
      {measures.map((m, i) => (
        <li key={i} className="measure-item">
          <p className="measure-text">{m.measure}</p>
          <p className="measure-meta">
            <span>
              <strong>{t.report.labels.measureKind}</strong> {m.kind}
            </span>
            <span>
              <strong>{t.report.labels.measureSource}</strong> {m.dataSource}
            </span>
            <span>
              <strong>{t.report.labels.measureOwner}</strong> {m.owner}
            </span>
            <span>
              <strong>{t.report.labels.measureCadence}</strong> {m.cadence}
            </span>
          </p>
        </li>
      ))}
    </ul>
  );
}

function RiskRow({ risk, lang }: { risk: RiskReview; lang: Language }) {
  const t = dict(lang);
  return (
    <li className="risk-item">
      <p className="risk-text">
        <span className="statement-text">{risk.risk}</span> <EvidenceLabel label={risk.label} lang={lang} />
      </p>
      <p className="risk-meta">
        <span>
          <strong>{t.report.labels.riskArea}</strong> {risk.area}
        </span>
        <span>
          <strong>{t.report.labels.riskReviewOwner}</strong> {risk.reviewOwner}
        </span>
        {risk.requiresHumanApproval ? (
          <span className="risk-human">
            <IconCheck size={14} />
            {t.report.labels.requiresHumanApproval}
          </span>
        ) : null}
      </p>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

function FeedbackForm({
  token,
  lang,
  onThanks,
  thanked,
}: {
  token: string;
  lang: Language;
  onThanks: () => void;
  thanked: boolean;
}) {
  const t = dict(lang);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [mostHelpful, setMostHelpful] = useState('');
  const [leastHelpful, setLeastHelpful] = useState('');
  const [comments, setComments] = useState('');
  const [followupRequested, setFollowupRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    if (busy) return;
    if (rating < 1) {
      setError(t.errors.requiredField);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitFeedback(token, {
        rating,
        mostHelpfulQuestion: mostHelpful.trim() || undefined,
        leastHelpfulQuestion: leastHelpful.trim() || undefined,
        comments: comments.trim() || undefined,
        followupRequested,
      });
      onThanks();
    } catch {
      setError(t.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  if (thanked) {
    return (
      <div className="feedback-thanks" role="status">
        <h2 className="feedback-title">{t.feedback.thanksTitle}</h2>
        <p>{t.feedback.thanksBody}</p>
      </div>
    );
  }

  const display = hover || rating;
  return (
    <div className="feedback-form">
      <h2 className="feedback-title">{t.feedback.title}</h2>
      <fieldset>
        <legend className="field-label">{t.feedback.helpfulLabel}</legend>
        <div className="rating-row" role="radiogroup" aria-label={t.feedback.helpfulLabel}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n}`}
              className={`rating-star ${display >= n ? 'is-on' : ''}`}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setRating(n)}
            >
              ★
            </button>
          ))}
        </div>
        <p className="rating-scale">
          <span>{t.feedback.helpful1}</span>
          <span>{t.feedback.helpful5}</span>
        </p>
      </fieldset>

      <div className="feedback-field">
        <label className="field-label" htmlFor="fb-most">
          {t.feedback.mostHelpful}
        </label>
        <input
          id="fb-most"
          className="input"
          value={mostHelpful}
          maxLength={300}
          onChange={(e) => setMostHelpful(e.target.value)}
        />
      </div>

      <div className="feedback-field">
        <label className="field-label" htmlFor="fb-least">
          {t.feedback.leastHelpful}
        </label>
        <input
          id="fb-least"
          className="input"
          value={leastHelpful}
          maxLength={300}
          onChange={(e) => setLeastHelpful(e.target.value)}
        />
      </div>

      <div className="feedback-field">
        <label className="field-label" htmlFor="fb-comments">
          {t.feedback.comments}
        </label>
        <textarea
          id="fb-comments"
          className="textarea"
          rows={4}
          value={comments}
          maxLength={3000}
          onChange={(e) => setComments(e.target.value)}
        />
      </div>

      <label className="checkbox-row" htmlFor="fb-followup">
        <input
          id="fb-followup"
          type="checkbox"
          checked={followupRequested}
          onChange={(e) => setFollowupRequested(e.target.checked)}
        />
        <span className="checkbox-copy">{t.feedback.followupRequested}</span>
      </label>

      {error ? <ErrorNotice lang={lang} message={error} /> : null}

      <div className="feedback-actions">
        <Button variant="primary" onClick={() => void submit()} disabled={busy}>
          {busy ? t.common.saving : t.feedback.submit}
        </Button>
      </div>
    </div>
  );
}
