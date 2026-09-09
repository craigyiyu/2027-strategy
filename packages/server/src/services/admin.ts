/**
 * Admin service — aggregate funnel metrics, consented-contact export and
 * audited raw-answer reveal (FR-025/026/028/029, SEC-07/08). Raw answers are
 * never exported with contacts and never appear in aggregate output.
 */
import type { Repo, SessionRow } from '../repo';
import { PULSE_MIN_CELL_DEFAULT, type FunnelMetrics } from '@2027strategy/shared';

export interface AdminSessionView {
  id: string;
  language: string;
  lens: string;
  roleBand: string;
  industryBand: string;
  privacyMode: string;
  status: string;
  coreStage: number;
  followupCount: number;
  createdAt: string;
  expiresAt: string;
  reportCount: number;
  consents: Array<{ purpose: string; granted: number }>;
  rawHidden: true;
}

export class AdminService {
  constructor(
    private repo: Repo,
    private pulseMinCell: number = PULSE_MIN_CELL_DEFAULT,
  ) {}

  metrics(): FunnelMetrics {
    const db = this.repo.db;
    const count = (sql: string, ...p: unknown[]) =>
      (db.prepare(sql).get(...p) as { n: number }).n;

    const starts = count('SELECT COUNT(*) AS n FROM sessions');
    const stageFunnel: Record<string, number> = {};
    for (const i of [1, 2, 3, 4, 5, 6, 7, 8]) {
      stageFunnel[`Q${i}`] = count(
        'SELECT COUNT(DISTINCT session_id) AS n FROM responses WHERE is_active = 1 AND stage_id = ? AND kind IN (?,?)',
        `Q${i}`,
        'core',
        'skip',
      );
    }
    const previewReached = count(
      "SELECT COUNT(*) AS n FROM sessions WHERE status IN ('preview_ready','report_ready','completed') OR reflection_state = 'confirmed'",
    );
    const reportsGenerated = count(
      "SELECT COUNT(*) AS n FROM reports WHERE status = 'ready' AND superseded_at IS NULL",
    );
    const delivered = count("SELECT COUNT(*) AS n FROM emails WHERE purpose = 'report_delivery' AND status = 'sent'");
    const emailAttempts = count("SELECT COUNT(*) AS n FROM emails WHERE purpose = 'report_delivery'");
    const optIns = (purpose: string) =>
      count('SELECT COUNT(*) AS n FROM consents WHERE purpose = ? AND granted = 1', purpose);

    const pulseCounts = this.repo.pulseTagCounts();
    const priorityCategories = pulseCounts
      .filter((p) => p.tag_key === 'priority')
      .map((p) => ({
        category: p.tag_value,
        count: p.n,
        suppressed: p.n < this.pulseMinCell,
      }));

    const byLanguage: Record<string, number> = {};
    for (const r of db.prepare('SELECT language, COUNT(*) AS n FROM sessions GROUP BY language').all() as Array<{ language: string; n: number }>) {
      byLanguage[r.language] = r.n;
    }
    const byLens: Record<string, number> = {};
    for (const r of db.prepare('SELECT lens, COUNT(*) AS n FROM sessions GROUP BY lens').all() as Array<{ lens: string; n: number }>) {
      byLens[r.lens] = r.n;
    }

    return {
      landingVisits: count('SELECT COUNT(*) AS n FROM analytics_events WHERE name = ?', 'landing_viewed'),
      interviewStarts: starts,
      stageFunnel,
      previewReached,
      fullReportGenerated: reportsGenerated,
      emailDeliveryRate: emailAttempts > 0 ? delivered / emailAttempts : 0,
      optInCounts: {
        newsletter: optIns('newsletter'),
        pulse: optIns('pulse'),
        followup: optIns('followup'),
      },
      priorityCategories,
      byLanguage,
      byLens,
    };
  }

  sessionList(limit = 50): AdminSessionView[] {
    const rows = this.repo.db
      .prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT ?')
      .all(limit) as SessionRow[];
    return rows.map((r) => this.sessionView(r));
  }

  sessionView(session: SessionRow): AdminSessionView {
    const reports = this.repo.getReportBySession(session.id);
    return {
      id: session.id,
      language: session.language,
      lens: session.lens,
      roleBand: session.role_band,
      industryBand: session.industry_band,
      privacyMode: session.privacy_mode,
      status: session.status,
      coreStage: session.core_stage,
      followupCount: session.followup_count,
      createdAt: session.created_at,
      expiresAt: session.expires_at,
      reportCount: reports.length,
      consents: this.repo.listConsentsForSession(session.id),
      rawHidden: true,
    };
  }

  /**
   * Audited raw-answer reveal. Returns response metadata + decrypted text ONLY
   * after an audit row is written with actor/time/session/reason (SEC-08).
   */
  revealRawAnswers(sessionId: string, actor: string, reason: string): Array<{ stageId: string; kind: string; text: string | null; createdAt: string }> {
    this.repo.audit({ actor, action: 'raw_answer_reveal', sessionId, detail: { reason } });
    const rows = this.repo.activeResponsesForSession(sessionId);
    return rows.map((r) => ({
      stageId: r.stage_id,
      kind: r.kind,
      text: this.repo.readAnswerText(r),
      createdAt: r.created_at,
    }));
  }

  contactsExport(): Array<{ email: string; firstName: string | null; newsletter: boolean; pulse: boolean; followup: boolean; createdAt: string }> {
    const rows = this.repo.db
      .prepare(
        `SELECT c.id, c.email_normalized, c.first_name, c.created_at FROM contacts c ORDER BY c.created_at ASC`,
      )
      .all() as Array<{ id: string; email_normalized: string; first_name: string | null; created_at: string }>;
    return rows.map((c) => {
      const consents = this.repo.db
        .prepare('SELECT purpose, granted FROM consents WHERE contact_id = ? AND granted = 1')
        .all(c.id) as Array<{ purpose: string; granted: number }>;
      const has = (p: string) => consents.some((x) => x.purpose === p);
      return {
        email: c.email_normalized,
        firstName: c.first_name,
        newsletter: has('newsletter'),
        pulse: has('pulse'),
        followup: has('followup'),
        createdAt: c.created_at,
      };
    });
  }
}
