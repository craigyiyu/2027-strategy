/**
 * Typed data-access layer. Raw answer text is always stored/read encrypted
 * via FieldCipher. Analytics/audit fields use allow-listed JSON only.
 */
import type { Database } from 'better-sqlite3';
import crypto from 'node:crypto';
import type { FieldCipher, EncryptedPayload } from './security';
import type {
  Language,
  Lens,
  RoleBand,
  IndustryBand,
  PrivacyMode,
  SessionStatus,
  CoreStageId,
} from '@2027strategy/shared';
import { METHOD_VERSION, PROMPT_VERSION, SCHEMA_VERSION } from '@2027strategy/shared';

export type { Database };

export interface SessionRow {
  id: string;
  public_token_hash: string;
  report_token_hash: string | null;
  language: Language;
  lens: Lens;
  role_band: RoleBand;
  industry_band: IndustryBand;
  organization_alias: string | null;
  privacy_mode: PrivacyMode;
  status: SessionStatus;
  core_stage: number;
  current_stage: string | null;
  followup_count: number;
  reflection_state: 'none' | 'ready' | 'confirmed';
  method_version: string;
  prompt_version: string;
  schema_version: string;
  expires_at: string;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResponseRow {
  id: string;
  session_id: string;
  stage_id: string;
  kind: 'core' | 'followup' | 'skip';
  extracted_json: string | null;
  sensitivity_state: string;
  quality_label: string | null;
  version: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  superseded_at: string | null;
}

export interface ContactRow {
  id: string;
  email_normalized: string;
  first_name: string | null;
  verification_state: string;
  created_at: string;
}

export const nowIso = () => new Date().toISOString();

export function newId(): string {
  return crypto.randomUUID();
}

export function isRowActive(r: ResponseRow) {
  return r.is_active === 1 && !r.superseded_at;
}

export class Repo {
  constructor(
    public db: Database,
    private cipher: FieldCipher,
  ) {}

  /* ---------------- sessions ---------------- */

  createSession(input: {
    tokenHash: string;
    language: Language;
    lens: Lens;
    roleBand: RoleBand;
    industryBand: IndustryBand;
    organizationAlias?: string;
    privacyMode: PrivacyMode;
    expiresAt: string;
  }): SessionRow {
    const id = newId();
    const ts = nowIso();
    this.db
      .prepare(
        `INSERT INTO sessions
          (id, public_token_hash, language, lens, role_band, industry_band,
           organization_alias, privacy_mode, status, core_stage, followup_count,
           reflection_state, method_version, prompt_version, schema_version,
           expires_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,0,0,'none',?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.tokenHash,
        input.language,
        input.lens,
        input.roleBand,
        input.industryBand,
        input.organizationAlias ?? null,
        input.privacyMode,
        'created',
        METHOD_VERSION,
        PROMPT_VERSION,
        SCHEMA_VERSION,
        input.expiresAt,
        ts,
        ts,
      );
    return this.getSessionById(id)!;
  }

  getSessionById(id: string): SessionRow | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      | SessionRow
      | undefined;
  }

  getSessionByTokenHash(hash: string): SessionRow | undefined {
    return this.db
      .prepare('SELECT * FROM sessions WHERE public_token_hash = ?')
      .get(hash) as SessionRow | undefined;
  }

  getSessionByReportTokenHash(hash: string): SessionRow | undefined {
    return this.db
      .prepare('SELECT * FROM sessions WHERE report_token_hash = ?')
      .get(hash) as SessionRow | undefined;
  }

  getSessionByAnyTokenHash(hash: string): SessionRow | undefined {
    return (
      this.getSessionByTokenHash(hash) ??
      this.getSessionByReportTokenHash(hash)
    );
  }

  setReportTokenHash(sessionId: string, hash: string): void {
    this.db
      .prepare('UPDATE sessions SET report_token_hash = ? WHERE id = ?')
      .run(hash, sessionId);
  }

  updateSession(id: string, patch: Partial<SessionRow>): void {
    const cols = Object.keys(patch).filter((k) => k !== 'id');
    if (cols.length === 0) return;
    const set = cols.map((c) => `${c} = ?`).join(', ');
    const values = cols.map((c) => (patch as Record<string, unknown>)[c]);
    this.db
      .prepare(`UPDATE sessions SET ${set}, updated_at = ? WHERE id = ?`)
      .run(...values, nowIso(), id);
  }

  deleteSession(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  /** List expired sessions of a given mode (retention job). */
  listExpiredBefore(iso: string, privacyMode?: PrivacyMode): string[] {
    const rows = privacyMode
      ? this.db
          .prepare('SELECT id FROM sessions WHERE privacy_mode = ? AND expires_at < ?')
          .all(privacyMode, iso)
      : this.db.prepare('SELECT id FROM sessions WHERE expires_at < ?').all(iso);
    return (rows as Array<{ id: string }>).map((r) => r.id);
  }

  /* ---------------- responses ---------------- */

  /** Insert a new active response version; supersedes older active version of stage. */
  upsertResponse(input: {
    sessionId: string;
    stageId: string;
    kind: 'core' | 'followup' | 'skip';
    answer?: string;
    extractedJson?: unknown;
    sensitivityState: string;
    qualityLabel?: string;
  }): ResponseRow {
    const id = newId();
    const ts = nowIso();
    // mark prior active version of this stage inactive
    this.db
      .prepare(
        `UPDATE responses SET is_active = 0, superseded_at = ?
         WHERE session_id = ? AND stage_id = ? AND is_active = 1`,
      )
      .run(ts, input.sessionId, input.stageId);
    let enc: EncryptedPayload | null = null;
    if (input.answer !== undefined) enc = this.cipher.encrypt(input.answer);
    this.db
      .prepare(
        `INSERT INTO responses
          (id, session_id, stage_id, kind,
           answer_ciphertext, answer_iv, answer_tag, extracted_json,
           sensitivity_state, quality_label, version, is_active, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,1,1,?,?)`,
      )
      .run(
        id,
        input.sessionId,
        input.stageId,
        input.kind,
        enc?.data ?? null,
        enc?.iv ?? null,
        enc?.tag ?? null,
        input.extractedJson !== undefined ? JSON.stringify(input.extractedJson) : null,
        input.sensitivityState,
        input.qualityLabel ?? null,
        ts,
        ts,
      );
    return this.getResponse(id)!;
  }

  /** Patch extraction/provenance data on an existing active response (no new version row). */
  updateResponseExtraction(responseId: string, extractedJson: unknown, qualityLabel: string): void {
    this.db
      .prepare(
        'UPDATE responses SET extracted_json = ?, quality_label = ?, updated_at = ? WHERE id = ?',
      )
      .run(JSON.stringify(extractedJson), qualityLabel, nowIso(), responseId);
  }

  getResponse(id: string): ResponseRow | undefined {
    return this.db.prepare('SELECT * FROM responses WHERE id = ?').get(id) as
      | ResponseRow
      | undefined;
  }

  activeResponsesForSession(sessionId: string): ResponseRow[] {
    return this.db
      .prepare(
        'SELECT * FROM responses WHERE session_id = ? AND is_active = 1 ORDER BY created_at ASC',
      )
      .all(sessionId) as ResponseRow[];
  }

  /** Decrypt one stored answer. Returns null for skipped answers. */
  readAnswerText(r: ResponseRow): string | null {
    const row = this.db
      .prepare(
        'SELECT answer_ciphertext AS data, answer_iv AS iv, answer_tag AS tag FROM responses WHERE id = ?',
      )
      .get(r.id) as { data: string | null; iv: string | null; tag: string | null };
    if (!row?.data || !row.iv || !row.tag) return null;
    return this.cipher.decrypt({ data: row.data, iv: row.iv, tag: row.tag });
  }

  /* ---------------- reports ---------------- */

  createReport(sessionId: string, reportJson: unknown): { id: string; version: number } {
    const id = newId();
    const ts = nowIso();
    this.db
      .prepare(
        `INSERT INTO reports (id, session_id, report_json, version, status, model_id, prompt_version, schema_version, generated_at)
         VALUES (?,?,?,1,'ready',?,?,?,?)`,
      )
      .run(
        id,
        sessionId,
        JSON.stringify(reportJson),
        (reportJson as { modelId?: string }).modelId ?? 'unknown',
        (reportJson as { promptVersion?: string }).promptVersion ?? PROMPT_VERSION,
        (reportJson as { schemaVersion?: string }).schemaVersion ?? SCHEMA_VERSION,
        ts,
      );
    return { id, version: 1 };
  }

  getActiveReport(sessionId: string): { id: string; report_json: string; version: number } | undefined {
    return this.db
      .prepare(
        'SELECT id, report_json, version FROM reports WHERE session_id = ? AND superseded_at IS NULL AND status = ? ORDER BY version DESC LIMIT 1',
      )
      .get(sessionId, 'ready') as { id: string; report_json: string; version: number } | undefined;
  }

  getReport(id: string): { id: string; session_id: string; report_json: string; version: number } | undefined {
    return this.db
      .prepare('SELECT id, session_id, report_json, version FROM reports WHERE id = ?')
      .get(id) as { id: string; session_id: string; report_json: string; version: number } | undefined;
  }

  getReportBySession(sessionId: string): Array<{ id: string; version: number; status: string; generated_at: string; superseded_at: string | null }> {
    return this.db
      .prepare(
        'SELECT id, version, status, generated_at, superseded_at FROM reports WHERE session_id = ? ORDER BY version ASC',
      )
      .all(sessionId) as Array<{ id: string; version: number; status: string; generated_at: string; superseded_at: string | null }>;
  }

  supersedeReportsForSession(sessionId: string): void {
    const ts = nowIso();
    this.db
      .prepare(
        'UPDATE reports SET superseded_at = ? WHERE session_id = ? AND superseded_at IS NULL',
      )
      .run(ts, sessionId);
  }

  markReportEmailSent(reportId: string): void {
    this.db.prepare('UPDATE reports SET email_sent_at = ? WHERE id = ?').run(nowIso(), reportId);
  }

  /* ---------------- contacts & consents ---------------- */

  getOrCreateContact(emailNormalized: string, firstName?: string): ContactRow {
    const existing = this.db
      .prepare('SELECT * FROM contacts WHERE email_normalized = ?')
      .get(emailNormalized) as ContactRow | undefined;
    if (existing) return existing;
    const id = newId();
    this.db
      .prepare('INSERT INTO contacts (id, email_normalized, first_name, verification_state, created_at) VALUES (?,?,?,?,?)')
      .run(id, emailNormalized, firstName ?? null, 'pending', nowIso());
    return this.getContact(id)!;
  }

  getContact(id: string): ContactRow | undefined {
    return this.db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as ContactRow | undefined;
  }

  recordConsent(input: {
    contactId: string | null;
    sessionId: string;
    purpose: string;
    policyVersion: string;
    granted: boolean;
  }): void {
    const id = newId();
    const ts = nowIso();
    this.db
      .prepare(
        `INSERT INTO consents (id, contact_id, session_id, purpose, policy_version, granted, granted_at)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .run(id, input.contactId, input.sessionId, input.purpose, input.policyVersion, input.granted ? 1 : 0, ts);
  }

  listConsentsForSession(sessionId: string): Array<{ purpose: string; granted: number }> {
    return this.db
      .prepare('SELECT purpose, granted FROM consents WHERE session_id = ?')
      .all(sessionId) as Array<{ purpose: string; granted: number }>;
  }

  /** Latest contact consents (used for withdrawal on deletion). */
  contactByEmail(email: string): ContactRow | undefined {
    return this.db
      .prepare('SELECT * FROM contacts WHERE email_normalized = ?')
      .get(email) as ContactRow | undefined;
  }

  /* ---------------- pulse tags ---------------- */

  addPulseTag(reportId: string, sessionId: string, key: string, value: string): void {
    this.db
      .prepare('INSERT INTO pulse_tags (id, report_id, session_id, tag_key, tag_value, created_at) VALUES (?,?,?,?,?,?)')
      .run(newId(), reportId, sessionId, key, value, nowIso());
  }

  pulseTagCounts(): Array<{ tag_key: string; tag_value: string; n: number }> {
    return this.db
      .prepare('SELECT tag_key, tag_value, COUNT(*) AS n FROM pulse_tags GROUP BY tag_key, tag_value')
      .all() as Array<{ tag_key: string; tag_value: string; n: number }>;
  }

  /* ---------------- feedback ---------------- */

  addFeedback(input: {
    sessionId: string;
    reportId: string | null;
    rating: number;
    comments?: string;
    followupRequested: boolean;
  }): void {
    const id = newId();
    const ts = nowIso();
    let enc: EncryptedPayload | null = null;
    if (input.comments && input.comments.trim()) enc = this.cipher.encrypt(input.comments.trim());
    this.db
      .prepare(
        `INSERT INTO feedback (id, session_id, report_id, rating, comments_ciphertext, comments_iv, comments_tag, followup_requested, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.sessionId,
        input.reportId,
        input.rating,
        enc?.data ?? null,
        enc?.iv ?? null,
        enc?.tag ?? null,
        input.followupRequested ? 1 : 0,
        ts,
      );
  }

  /* ---------------- emails ---------------- */

  addEmailRecord(input: { sessionId?: string; contactId?: string | null; purpose: string; status: string }): void {
    this.db
      .prepare(
        'INSERT INTO emails (id, session_id, contact_id, purpose, status, created_at) VALUES (?,?,?,?,?,?)',
      )
      .run(newId(), input.sessionId ?? null, input.contactId ?? null, input.purpose, input.status, nowIso());
  }

  updateEmailStatus(id: string, status: string, errorCategory?: string): void {
    this.db
      .prepare('UPDATE emails SET status = ?, error_category = ?, sent_at = COALESCE(sent_at, ?) WHERE id = ?')
      .run(status, errorCategory ?? null, nowIso(), id);
  }

  /* ---------------- analytics ---------------- */

  recordAnalytics(name: string, props: Record<string, unknown>): void {
    this.db
      .prepare('INSERT INTO analytics_events (name, props_json, ts) VALUES (?,?,?)')
      .run(name, JSON.stringify(props), nowIso());
  }

  /* ---------------- audit & deletion ---------------- */

  audit(input: { actor: string; action: string; sessionId?: string; reportId?: string; detail?: unknown }): void {
    this.db
      .prepare(
        'INSERT INTO audit_log (id, actor, action, session_id, report_id, detail_json, created_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run(
        newId(),
        input.actor,
        input.action,
        input.sessionId ?? null,
        input.reportId ?? null,
        input.detail ? JSON.stringify(input.detail) : null,
        nowIso(),
      );
  }

  listAudit(limit = 100): Array<Record<string, unknown>> {
    return this.db
      .prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?')
      .all(limit) as Array<Record<string, unknown>>;
  }

  recordDeletion(sessionId: string, receiptTokenHash?: string, reason?: string): void {
    this.db
      .prepare('INSERT INTO deletion_log (id, session_id, receipt_token_hash, requested_at, reason) VALUES (?,?,?,?,?)')
      .run(newId(), sessionId, receiptTokenHash ?? null, nowIso(), reason ?? null);
  }
}
