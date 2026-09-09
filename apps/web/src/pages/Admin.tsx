/**
 * Admin — owner-only console behind a sessionStorage token. Funnel metrics,
 * sessions list (metadata only), audited raw-answer reveal, audit trail and
 * consented-contact CSV export. Raw answers are never shown without a reason.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  adminAudit,
  adminContactsExport,
  adminMetrics,
  adminReveal,
  adminSession,
  adminSessions,
  adminToken,
  ApiError,
  clearAdminToken,
  storeAdminToken,
  type AdminFunnelMetrics,
  type AdminSessionView,
  type RevealedRawAnswer,
} from '../api';
import { useUiLanguage } from '../useQueryLang';
import { Footer } from '../components/Footer';
import { TopBar } from '../components/TopBar';
import { ErrorNotice } from '../components/ErrorNotice';
import { Modal } from '../components/Modal';
import { Button, FocusableH1, PageShell, useFieldId } from '../components/ui';

type AuthState = 'unknown' | 'authed' | 'denied';

interface RawRow {
  session: AdminSessionView | null;
  raw: RevealedRawAnswer[] | null;
  reason: string;
  revealing: boolean;
}

export default function Admin() {
  const { lang, t } = useUiLanguage();
  const tokenInputId = useFieldId('admin-token');

  const [auth, setAuth] = useState<AuthState>(() => (adminToken() ? 'authed' : 'unknown'));
  const [tokenValue, setTokenValue] = useState('');
  const [deniedMsg, setDeniedMsg] = useState<string | null>(null);

  const [metrics, setMetrics] = useState<AdminFunnelMetrics | null>(null);
  const [sessions, setSessions] = useState<AdminSessionView[] | null>(null);
  const [audit, setAudit] = useState<Array<Record<string, unknown>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<RawRow>({
    session: null,
    raw: null,
    reason: '',
    revealing: false,
  });
  const [revealOpen, setRevealOpen] = useState(false);

  const loadAll = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [m, s, a] = await Promise.all([adminMetrics(), adminSessions(), adminAudit()]);
      setMetrics(m.metrics);
      setSessions(s.sessions);
      setAudit(a.audit);
      setAuth('authed');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAdminToken();
        setAuth('denied');
        setDeniedMsg(t.admin.invalidToken);
      } else {
        setError(err instanceof ApiError && err.status === 0 ? t.errors.network : t.errors.generic);
      }
    } finally {
      setBusy(false);
    }
  }, [t]);

  useEffect(() => {
    if (auth === 'authed') {
      void loadAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth]);

  const signIn = async (): Promise<void> => {
    const trimmed = tokenValue.trim();
    if (!trimmed) {
      setDeniedMsg(t.admin.invalidToken);
      return;
    }
    storeAdminToken(trimmed);
    setAuth('authed');
    setDeniedMsg(null);
  };

  const signOut = (): void => {
    clearAdminToken();
    setAuth('unknown');
    setMetrics(null);
    setSessions(null);
    setAudit(null);
  };

  const openDetail = async (id: string): Promise<void> => {
    setDetail({ session: null, raw: null, reason: '', revealing: false });
    try {
      const res = await adminSession(id);
      setDetail((prev) => ({ ...prev, session: res.session }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAdminToken();
        setAuth('denied');
        setDeniedMsg(t.admin.invalidToken);
      } else {
        setError(t.errors.generic);
      }
    }
  };

  const reveal = async (): Promise<void> => {
    const target = detail.session;
    if (!target) return;
    if (detail.reason.trim().length < 3) {
      setError(t.errors.requiredField);
      return;
    }
    setDetail((prev) => ({ ...prev, revealing: true }));
    setError(null);
    try {
      const res = await adminReveal(target.id, detail.reason.trim());
      setDetail((prev) => ({ ...prev, raw: res.raw, revealing: false }));
      setRevealOpen(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAdminToken();
        setAuth('denied');
        setDeniedMsg(t.admin.invalidToken);
      } else {
        setError(t.errors.generic);
      }
      setDetail((prev) => ({ ...prev, revealing: false }));
    }
  };

  const exportCsv = async (): Promise<void> => {
    setError(null);
    try {
      const { filename, blob } = await adminContactsExport();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAdminToken();
        setAuth('denied');
        setDeniedMsg(t.admin.invalidToken);
      } else {
        setError(err instanceof ApiError && err.status === 0 ? t.errors.network : t.errors.generic);
      }
    }
  };

  useEffect(() => {
    document.title = `${t.admin.title} — ${t.meta.title}`;
  }, [t]);

  // ---- sign-in gate ----
  if (auth !== 'authed') {
    return (
      <PageShell topBar={<TopBar lang={lang} langSwitch />} footer={<Footer lang={lang} />}>
        <FocusableH1>{t.admin.signInTitle}</FocusableH1>
        {deniedMsg ? <ErrorNotice lang={lang} message={deniedMsg} /> : null}
        <form
          className="admin-signin"
          onSubmit={(e) => {
            e.preventDefault();
            void signIn();
          }}
        >
          <label className="field-label" htmlFor={tokenInputId}>
            {t.admin.tokenLabel}
          </label>
          <input
            id={tokenInputId}
            type="password"
            autoComplete="current-password"
            className="input"
            value={tokenValue}
            onChange={(e) => setTokenValue(e.target.value)}
          />
          <div className="form-actions">
            <Button variant="primary" type="submit">
              {t.admin.signIn}
            </Button>
          </div>
        </form>
      </PageShell>
    );
  }

  const pct = (metrics ? metrics.emailDeliveryRate : 0) * 100;

  return (
    <PageShell topBar={<TopBar lang={lang} langSwitch />} footer={<Footer lang={lang} />}>
      <div className="admin-head">
        <FocusableH1>{t.admin.title}</FocusableH1>
        <Button variant="ghost" onClick={signOut}>
          {t.admin.signOut}
        </Button>
      </div>

      {error ? <ErrorNotice lang={lang} message={error} /> : null}
      {busy ? (
        <p className="page-subtitle" role="status">
          {t.common.loading}
        </p>
      ) : null}

      {/* metrics */}
      {metrics ? (
        <>
          <section className="report-section" aria-labelledby="admin-funnel">
            <h2 id="admin-funnel" className="report-section-title">
              {t.admin.funnelTitle}
            </h2>
            <dl className="metric-grid">
              <div className="metric-card">
                <dt>{t.admin.landingVisits}</dt>
                <dd>{metrics.landingVisits}</dd>
              </div>
              <div className="metric-card">
                <dt>{t.admin.interviewStarts}</dt>
                <dd>{metrics.interviewStarts}</dd>
              </div>
              <div className="metric-card">
                <dt>{t.admin.previewReached}</dt>
                <dd>{metrics.previewReached}</dd>
              </div>
              <div className="metric-card">
                <dt>{t.admin.reportsGenerated}</dt>
                <dd>{metrics.fullReportGenerated}</dd>
              </div>
              <div className="metric-card">
                <dt>{t.admin.emailDeliveryRate}</dt>
                <dd>{pct.toFixed(0)}%</dd>
              </div>
            </dl>

            <h3 className="report-subheading">{t.admin.stageFunnelTitle}</h3>
            <div className="stage-funnel">
              {Object.entries(metrics.stageFunnel).map(([stage, count]) => {
                const max = Math.max(1, ...Object.values(metrics.stageFunnel));
                const width = Math.round((count / max) * 100);
                return (
                  <div className="stage-bar" key={stage}>
                    <span className="stage-bar-label">{stage}</span>
                    <div className="stage-bar-track" aria-hidden="true">
                      <div className="stage-bar-fill" style={{ width: `${width}%` }} />
                    </div>
                    <span className="stage-bar-count">{count}</span>
                  </div>
                );
              })}
            </div>

            <h3 className="report-subheading">{t.admin.optIns}</h3>
            <ul className="stat-line">
              <li>
                {t.admin.newsletter}: <strong>{metrics.optInCounts.newsletter}</strong>
              </li>
              <li>
                {t.admin.pulse}: <strong>{metrics.optInCounts.pulse}</strong>
              </li>
              <li>
                {t.admin.followup}: <strong>{metrics.optInCounts.followup}</strong>
              </li>
            </ul>

            {metrics.priorityCategories.length ? (
              <>
                <h3 className="report-subheading">Priority pulse categories</h3>
                <ul className="stat-line">
                  {metrics.priorityCategories.map((p) => (
                    <li key={`${p.category}-${p.count}`}>
                      {p.category}: <strong>{p.count}</strong>
                      {p.suppressed ? <span className="pill pill-meta"> {t.admin.suppressed}</span> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {metrics.byLanguage && Object.keys(metrics.byLanguage).length ? (
              <>
                <h3 className="report-subheading">By language</h3>
                <ul className="stat-line">
                  {Object.entries(metrics.byLanguage).map(([k, v]) => (
                    <li key={k}>
                      {k}: <strong>{v}</strong>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          <section className="report-section" aria-labelledby="admin-contacts">
            <h2 id="admin-contacts" className="report-section-title">
              {t.admin.contactsTitle}
            </h2>
            <Button variant="secondary" onClick={() => void exportCsv()}>
              {t.admin.exportCta}
            </Button>
          </section>
        </>
      ) : null}

      {/* sessions */}
      {sessions ? (
        <section className="report-section" aria-labelledby="admin-sessions">
          <h2 id="admin-sessions" className="report-section-title">
            {t.admin.sessionsTitle}
          </h2>
          {sessions.length === 0 ? <p>{t.admin.noData}</p> : null}
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Lang</th>
                  <th>Lens</th>
                  <th>Role</th>
                  <th>Industry</th>
                  <th>Mode</th>
                  <th>Status</th>
                  <th>Stage</th>
                  <th>Reports</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="cell-mono">{s.id.slice(0, 8)}</td>
                    <td>{s.language}</td>
                    <td>{s.lens}</td>
                    <td>{s.roleBand}</td>
                    <td>{s.industryBand}</td>
                    <td>{s.privacyMode}</td>
                    <td>{s.status}</td>
                    <td>{s.coreStage}/8</td>
                    <td>{s.reportCount}</td>
                    <td>{shortDate(s.createdAt)}</td>
                    <td>
                      <Button variant="ghost" onClick={() => void openDetail(s.id)}>
                        {t.admin.viewSession}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detail.session ? (
            <div className="admin-detail">
              <h3 className="report-subheading">
                Session {detail.session.id.slice(0, 8)}
              </h3>
              <p className="page-subtitle">{t.admin.rawHidden}</p>
              <dl className="kv-grid">
                <div>
                  <dt>Language</dt>
                  <dd>{detail.session.language}</dd>
                </div>
                <div>
                  <dt>Lens</dt>
                  <dd>{detail.session.lens}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{detail.session.status}</dd>
                </div>
                <div>
                  <dt>Core stage</dt>
                  <dd>{detail.session.coreStage}/8</dd>
                </div>
                <div>
                  <dt>Follow-ups</dt>
                  <dd>{detail.session.followupCount}/4</dd>
                </div>
                <div>
                  <dt>Consents</dt>
                  <dd>
                    {detail.session.consents.length
                      ? detail.session.consents
                          .filter((c) => c.granted === 1)
                          .map((c) => c.purpose)
                          .join(', ')
                      : '—'}
                  </dd>
                </div>
              </dl>

              {detail.raw ? (
                <ul className="raw-list">
                  {detail.raw.map((r) => (
                    <li key={`${r.stageId}-${r.createdAt}`} className="raw-item">
                      <p className="raw-meta">
                        {r.stageId} · {r.kind} · {shortDate(r.createdAt)}
                      </p>
                      <p className="raw-text">{r.text ?? '—'}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <Button variant="danger" onClick={() => setRevealOpen(true)}>
                  {t.admin.revealAction}
                </Button>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* audit */}
      {audit ? (
        <section className="report-section" aria-labelledby="admin-audit">
          <h2 id="admin-audit" className="report-section-title">
            {t.admin.auditTitle}
          </h2>
          {audit.length === 0 ? <p>{t.admin.noData}</p> : null}
          <ul className="audit-list">
            {audit.map((row, i) => (
              <li key={i} className="audit-item">
                {formatAuditRow(row).map(([k, v]) => (
                  <span key={k} className="audit-kv">
                    <strong>{k}</strong> {v}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Modal
        open={revealOpen}
        onClose={() => setRevealOpen(false)}
        title={t.admin.revealAction}
      >
        <label className="field-label" htmlFor="reveal-reason">
          {t.admin.revealReasonLabel}
        </label>
        <input
          id="reveal-reason"
          className="input"
          type="text"
          maxLength={500}
          value={detail.reason}
          onChange={(e) => setDetail((prev) => ({ ...prev, reason: e.target.value }))}
        />
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setRevealOpen(false)}>
            {t.common.cancel}
          </Button>
          <Button variant="danger" onClick={() => void reveal()} disabled={detail.revealing}>
            {detail.revealing ? t.common.saving : t.admin.revealSubmit}
          </Button>
        </div>
      </Modal>
    </PageShell>
  );
}

function shortDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
  } catch {
    return iso;
  }
}

function formatAuditRow(row: Record<string, unknown>): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const order = ['created_at', 'actor', 'action', 'session_id', 'detail'];
  for (const key of order) {
    if (row[key] === undefined || row[key] === null) continue;
    let value = String(row[key]);
    if (key === 'detail' && typeof row[key] === 'object') {
      try {
        value = JSON.stringify(row[key]);
      } catch {
        value = String(row[key]);
      }
    }
    out.push([key.replace(/_/g, ' '), value]);
  }
  for (const key of Object.keys(row)) {
    if (order.includes(key)) continue;
    out.push([key.replace(/_/g, ' '), String(row[key])]);
  }
  return out;
}
