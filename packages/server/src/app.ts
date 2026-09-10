/**
 * HTTP API — Hono application. Typed zod validation on every mutation,
 * server-side secrets only, neutral errors for expired/deleted tokens,
 * audited admin reveal, consent-independent email delivery, distinct
 * session vs report capability tokens (SEC-02/09).
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import type { Repo, SessionRow } from './repo';
import { Orchestrator, DomainError } from './orchestrator';
import { AdminService } from './services/admin';
import { AnalyticsService } from './services/analytics';
import type { EmailService } from './email/types';
import type { AppEnv } from './env';
import { computeExpiry, hashToken, issueToken, reportExpiry } from './tokens';
import { constantTimeEqual } from './security';
import { rateLimit, Idempotency } from './middleware/rateLimit';
import { logger } from './logger';
import type { CoreStageId } from '@2027strategy/shared';
import {
  answerInput,
  confirmReflectionInput,
  deleteInput,
  editAnswerInput,
  feedbackInput,
  POLICY_VERSION,
  sessionCreateInput,
  setDeliveryInput,
  type ConsentPurpose,
} from '@2027strategy/shared';

export interface AppDeps {
  repo: Repo;
  orchestrator: Orchestrator;
  admin: AdminService;
  analytics: AnalyticsService;
  email: EmailService;
  env: AppEnv;
}

type C = Context;

const NEUTRAL = {
  ok: false,
  code: 'link_unavailable',
  message: 'This link is not available. Please start a new sprint if you would like to continue.',
};

export function createApp(deps: AppDeps) {
  const { repo, orchestrator: orch, admin, analytics, email, env } = deps;
  const idem = new Idempotency(repo);
  const app = new Hono();

  app.use('*', cors({ origin: env.PUBLIC_ORIGIN, credentials: false }));
  app.use('*', async (c, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
      const origin = c.req.header('origin');
      if (origin && origin !== env.PUBLIC_ORIGIN) {
        return c.json({ ok: false, message: 'Origin rejected.' }, 403);
      }
    }
    await next();
  });

  app.get('/api/health', (c) => c.json({ ok: true, name: '2027-strategy' }));

  // Optional static hosting of the built SPA (apps/web/dist) for single-port preview.
  const webDist = process.env.WEB_DIST;
  if (webDist) {
    const MIME: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.woff2': 'font/woff2',
    };
    app.get('*', async (c, next) => {
      if (c.req.path.startsWith('/api')) return next();
      const { readFileSync, existsSync } = await import('node:fs');
      const { join, normalize } = await import('node:path');
      const base = normalize(webDist);
      const urlPath = c.req.path === '/' ? '/index.html' : (c.req.path.split('?')[0] ?? '/');
      const file = normalize(join(base, urlPath));
      const safe = file.startsWith(base);
      const fallback = join(base, 'index.html');
      const candidates = safe && existsSync(file) ? [file] : [fallback];
      try {
        const chosen = candidates[0] ?? join(base, 'index.html');
      const body = readFileSync(chosen);
      const ext = chosen.slice(chosen.lastIndexOf('.'));
        c.header('Content-Type', MIME[ext] ?? 'application/octet-stream');
        return c.body(body);
      } catch {
        return c.notFound();
      }
    });
  }

  /* ------------------------- session lifecycle ------------------------- */

  app.post('/api/session', async (c) => {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip') ??
      'local';
    const rl = rateLimit(`session:${ip}`, env.RATE_SESSION_PER_HOUR, 3600_000);
    if (!rl.ok) return c.json({ ok: false, message: 'Too many sessions. Try again later.' }, 429);
    const body = sessionCreateInput.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ ok: false, message: 'Invalid setup.' }, 400);
    }
    const st = issueToken();
    const rt = issueToken();
    const row = repo.createSession({
      tokenHash: st.hash,
      language: body.data.language,
      lens: body.data.lens,
      roleBand: body.data.roleBand,
      industryBand: body.data.industryBand,
      organizationAlias: body.data.organizationAlias,
      privacyMode: body.data.privacyMode,
      expiresAt: computeExpiry(body.data.privacyMode, env),
    });
    repo.setReportTokenHash(row.id, rt.hash);
    analytics.track('session_created', {
      lens: body.data.lens,
      roleBand: body.data.roleBand,
      industryBand: body.data.industryBand,
      privacyMode: body.data.privacyMode,
    });
    return c.json({
      ok: true,
      token: st.token,
      reportToken: rt.token,
      status: row.status,
      coreStage: row.core_stage,
      currentStage: orch.currentCoreStageId(row),
      expiresAt: row.expires_at,
      methodVersion: row.method_version,
      promptVersion: row.prompt_version,
      schemaVersion: row.schema_version,
    });
  });

  /** Session-capability lookup from the session token (interview/edit). */
  function fromSession(c: C) {
    const row = repo.getSessionByTokenHash(hashToken(c.req.param('token') ?? ''));
    return checkUsable(c, row);
  }

  /** Report/delete-capability lookup — accepts the report token OR the session token. */
  function fromReport(c: C) {
    const row = repo.getSessionByAnyTokenHash(hashToken(c.req.param('token') ?? ''));
    return checkUsable(c, row);
  }

  function checkUsable(c: C, row: SessionRow | undefined) {
    if (!row || row.status === 'deleted' || row.status === 'expired') {
      return { usable: false as const, res: c.json(NEUTRAL, 404) };
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return { usable: false as const, res: c.json(NEUTRAL, 404) };
    }
    return { usable: true as const, row };
  }

  function freshSafeState(c: C, row: SessionRow) {
    const fresh = repo.getSessionById(row.id);
    return safeState(c, fresh ?? row);
  }

  function safeState(c: C, row: SessionRow) {
    const answered = repo.activeResponsesForSession(row.id);
    return {
      language: row.language,
      lens: row.lens,
      roleBand: row.role_band,
      industryBand: row.industry_band,
      privacyMode: row.privacy_mode,
      organizationAlias: row.organization_alias,
      status: row.status,
      coreStage: row.core_stage,
      followupCount: row.followup_count,
      currentStageId: orch.currentCoreStageId(row),
      reflectionState: row.reflection_state,
      methodVersion: row.method_version,
      promptVersion: row.prompt_version,
      schemaVersion: row.schema_version,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      answeredStages: answered.map((r) => r.stage_id),
      reportAvailable: !!repo.getActiveReport(row.id),
    };
  }

  app.get('/api/session/:token', (c) => {
    const s = fromSession(c);
    if (!s.usable) return s.res;
    return c.json({ ok: true, session: freshSafeState(c, s.row) });
  });

  app.post('/api/session/:token/answer', async (c) => {
    const s = fromSession(c);
    if (!s.usable) return s.res;
    const rl = rateLimit(`ai:${s.row.id}`, env.RATE_AI_PER_HOUR, 3600_000);
    if (!rl.ok) return c.json({ ok: false, message: 'Rate limit reached. Try later.' }, 429);
    const body = answerInput.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ ok: false, message: 'Invalid answer.' }, 400);
    const claim = idem.tryClaim(`a:${body.data.idempotencyKey}`, s.row.id);
    if (!claim.first) return c.json({ ok: true, duplicate: true, session: freshSafeState(c, s.row) });
    try {
      const out = await orch.submitCoreAnswer(s.row, body.data.stageId as CoreStageId, body.data.answer);
      analytics.track('stage_completed', { stageId: body.data.stageId, skipped: false, elapsedBucket: 'unknown' });
      return c.json({
        ok: true,
        assessment: out.assessment,
        session: freshSafeState(c, s.row),
        followupQuestion: out.followupQuestion,
        allCoreAnswered: out.allCoreAnswered,
      });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.post('/api/session/:token/followup', async (c) => {
    const s = fromSession(c);
    if (!s.usable) return s.res;
    const body = answerInput.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ ok: false, message: 'Invalid answer.' }, 400);
    try {
      const out = await orch.submitFollowupAnswer(s.row, body.data.answer);
      return c.json({ ok: true, session: freshSafeState(c, s.row), allCoreAnswered: out.allCoreAnswered });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.post('/api/session/:token/skip', async (c) => {
    const s = fromSession(c);
    if (!s.usable) return s.res;
    try {
      const out = await orch.skipStage(s.row);
      return c.json({ ok: true, session: freshSafeState(c, s.row), allCoreAnswered: out.allCoreAnswered });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.post('/api/session/:token/answer/:responseId/edit', async (c) => {
    const s = fromSession(c);
    if (!s.usable) return s.res;
    const body = editAnswerInput.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ ok: false, message: 'Invalid edit.' }, 400);
    try {
      await orch.editAnswer(s.row, c.req.param('responseId') ?? '', body.data.answer);
      return c.json({ ok: true, session: freshSafeState(c, s.row), invalidated: true });
    } catch (err) {
      return handleError(c, err);
    }
  });

  /* ------------------------- reflection ------------------------- */

  app.post('/api/session/:token/reflection', async (c) => {
    const s = fromSession(c);
    if (!s.usable) return s.res;
    try {
      const reflection = await orch.generateReflection(s.row);
      analytics.track('reflection_viewed', { completionBucket: '8' });
      return c.json({ ok: true, reflection });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.post('/api/session/:token/reflection/confirm', async (c) => {
    const s = fromSession(c);
    if (!s.usable) return s.res;
    const body = confirmReflectionInput.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ ok: false, message: 'Invalid confirmation.' }, 400);
    const claim = idem.tryClaim(`r:${body.data.idempotencyKey}`, s.row.id);
    if (!claim.first) return c.json({ ok: true, session: freshSafeState(c, s.row) });
    try {
      await orch.confirmReflection(s.row, body.data.corrections);
      analytics.track('reflection_confirmed', {
        correctionBucket: body.data.corrections ? '1' : '0',
      });
      return c.json({ ok: true, session: freshSafeState(c, s.row) });
    } catch (err) {
      return handleError(c, err);
    }
  });

  /* ------------------------- preview & delivery ------------------------- */

  /**
   * Preview. Report generation can take minutes with reasoning models, so this
   * returns 202 {status:'generating'} when it is not ready within the inline
   * budget; the SPA polls /report/status (keeps requests under Cloudflare's
   * 100s origin timeout).
   */
  app.get('/api/session/:token/preview', async (c) => {
    const s = fromSession(c);
    if (!s.usable) return s.res;
    const existed = !!repo.getActiveReport(s.row.id);
    try {
      const out = await orch.generatePreviewWithBudget(s.row, 12_000);
      if (out.status === 'ready') {
        if (!existed) {
          analytics.track('report_generated', {
            language: s.row.language,
            lens: s.row.lens,
            elapsedBucket: 'async',
            modelRoute: 'live',
          });
        }
        analytics.track('preview_viewed', { readinessCounts: out.preview.readinessSnapshot.length });
        return c.json({ ok: true, preview: out.preview });
      }
      if (out.status === 'failed') {
        const insufficient = /insufficient|substantive/i.test(out.error ?? '');
        return c.json(
          {
            ok: false,
            code: insufficient ? 'insufficient_input' : 'report_failed',
            status: 'failed',
            message: insufficient
              ? 'Not enough substantive answers yet. Return to the interview and add detail to at least five questions.'
              : 'Report generation failed. Please retry.',
          },
          502,
        );
      }
      return c.json({ ok: true, status: 'generating' }, 202);
    } catch (err) {
      return handleError(c, err);
    }
  });

  /** Poll target for the SPA while a report generates in the background. */
  app.get('/api/session/:token/report/status', (c) => {
    const s = fromSession(c);
    if (!s.usable) return s.res;
    const job = orch.getReportJobStatus(s.row.id);
    return c.json({ ok: true, ...job });
  });

  app.post('/api/session/:token/delivery', async (c) => {
    const s = fromSession(c);
    if (!s.usable) return s.res;
    const body = setDeliveryInput.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ ok: false, message: 'Invalid delivery details.' }, 400);
    }
    const d = body.data;
    const claim = idem.tryClaim(`d:${d.idempotencyKey}`, s.row.id);
    if (!claim.first) return c.json({ ok: true, duplicate: true, session: freshSafeState(c, s.row) });

    let reportReady = !!repo.getActiveReport(s.row.id);
    if (!reportReady) {
      // start generation; wait briefly so fast engines can deliver immediately
      orch.startReportGeneration(s.row);
      await orch.waitForReport(s.row.id, 4_000);
      reportReady = !!repo.getActiveReport(s.row.id);
    }

    const consents: ConsentPurpose[] = [];
    if (d.email) {
      const contact = repo.getOrCreateContact(d.email, d.firstName);
      repo.recordConsent({
        contactId: contact.id,
        sessionId: s.row.id,
        purpose: 'report_delivery',
        policyVersion: POLICY_VERSION,
        granted: true,
      });
      consents.push('report_delivery');
      const optional: Array<{ flag: boolean; purpose: ConsentPurpose }> = [
        { flag: d.consents.newsletter, purpose: 'newsletter' },
        { flag: d.consents.pulse, purpose: 'pulse' },
        { flag: d.consents.followup, purpose: 'followup' },
      ];
      for (const o of optional) {
        if (o.flag) {
          repo.recordConsent({
            contactId: contact.id,
            sessionId: s.row.id,
            purpose: o.purpose,
            policyVersion: POLICY_VERSION,
            granted: true,
          });
          consents.push(o.purpose);
        }
      }
      const reportTokenRaw = d.reportToken ?? c.req.param('token');
      const sendNow = async (): Promise<boolean> => {
        const active = repo.getActiveReport(s.row.id);
        if (!active) return false;
        const reportJson = JSON.parse(active.report_json) as { strategyThesis?: string; language: string };
        const res = await email.sendReport({
          to: contact.email_normalized,
          firstName: contact.first_name ?? undefined,
          language: reportJson.language as 'en' | 'zh-CN',
          thesis: reportJson.strategyThesis ?? '',
          reportUrl: `${env.PUBLIC_ORIGIN}/report/${reportTokenRaw}`,
          deleteUrl: `${env.PUBLIC_ORIGIN}/delete/${reportTokenRaw}`,
          expiryDateIso: reportExpiry(env),
        });
        if (!res.ok) return false;
        repo.markReportEmailSent(active.id);
        return true;
      };

      // transactional email independent of newsletter consent (FR-018, EMAIL-002)
      const deliveredNow = reportReady ? await sendNow() : false;
      if (!reportReady) {
        // generation still running: send as soon as it finishes
        orch.startReportGeneration(s.row, async () => {
          const ok = await sendNow();
          if (ok) repo.updateSession(s.row.id, { status: 'report_ready' });
        });
      } else if (!deliveredNow) {
        repo.updateSession(s.row.id, { status: 'report_ready' });
        return c.json({
          ok: true,
          emailDelivered: false,
          session: freshSafeState(c, s.row),
          reportStatus: 'ready',
        });
      } else {
        repo.updateSession(s.row.id, { status: 'report_ready' });
        if (consents.some((p) => p !== 'report_delivery')) {
          await email.sendConsentConfirmation({
            to: contact.email_normalized,
            language: row_lang(s.row),
            purposes: consents.filter((p) => p !== 'report_delivery'),
          });
        }
      }
      analytics.track('delivery_selected', {
        emailYesNo: 'yes',
        consentFlags: consents.join(','),
      });
      return c.json({
        ok: true,
        emailDelivered: deliveredNow,
        session: freshSafeState(c, s.row),
        reportStatus: reportReady ? 'ready' : 'generating',
      });
    }
    if (reportReady) {
      repo.updateSession(s.row.id, { status: 'report_ready' });
    } else {
      orch.startReportGeneration(s.row);
    }
    analytics.track('delivery_selected', { emailYesNo: 'no', consentFlags: 'none' });
    return c.json({
      ok: true,
      emailDelivered: false,
      session: freshSafeState(c, s.row),
      reportStatus: reportReady ? 'ready' : 'generating',
    });
  });

  /* ------------------------- report ------------------------- */

  app.get('/api/report/:token', (c) => {
    const s = fromReport(c);
    if (!s.usable) return s.res;
    const active = repo.getActiveReport(s.row.id);
    if (!active) return c.json({ ok: false, message: 'No report yet.' }, 404);
    return c.json({ ok: true, report: JSON.parse(active.report_json) });
  });

  app.post('/api/report/:token/resend', async (c) => {
    const s = fromReport(c);
    if (!s.usable) return s.res;
    const rl = rateLimit(`resend:${s.row.id}`, 1, env.RATE_RESEND_COOLDOWN_SECONDS * 1000);
    if (!rl.ok) {
      return c.json(
        { ok: false, message: 'Wait before resending.', retryAfterSeconds: rl.retryAfterSeconds },
        429,
      );
    }
    const contact = latestDeliveryContact(repo, s.row.id);
    if (!contact) return c.json({ ok: false, message: 'No delivery contact on record.' }, 400);
    const active = repo.getActiveReport(s.row.id);
    if (!active) return c.json({ ok: false, message: 'No report yet.' }, 404);
    const reportJson = JSON.parse(active.report_json) as { strategyThesis?: string; language: string };
    const reportTokenRaw = c.req.param('token');
    const emailRes = await email.sendReport({
      to: contact.email_normalized,
      firstName: contact.first_name ?? undefined,
      language: reportJson.language as 'en' | 'zh-CN',
      thesis: reportJson.strategyThesis ?? '',
      reportUrl: `${env.PUBLIC_ORIGIN}/report/${reportTokenRaw}`,
      deleteUrl: `${env.PUBLIC_ORIGIN}/delete/${reportTokenRaw}`,
      expiryDateIso: reportExpiry(env),
    });
    if (emailRes.ok) {
      repo.markReportEmailSent(active.id);
      return c.json({ ok: true, sent: true });
    }
    return c.json({ ok: false, sent: false, message: 'Email could not be sent.' }, 502);
  });

  app.post('/api/report/:token/feedback', async (c) => {
    const s = fromReport(c);
    if (!s.usable) return s.res;
    const body = feedbackInput.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ ok: false, message: 'Invalid feedback.' }, 400);
    const active = repo.getActiveReport(s.row.id);
    repo.addFeedback({
      sessionId: s.row.id,
      reportId: active?.id ?? null,
      rating: body.data.rating,
      comments: body.data.comments,
      followupRequested: body.data.followupRequested,
    });
    if (body.data.followupRequested) {
      repo.recordConsent({
        contactId: null,
        sessionId: s.row.id,
        purpose: 'followup',
        policyVersion: POLICY_VERSION,
        granted: true,
      });
    }
    analytics.track('feedback_submitted', {
      rating: body.data.rating,
      followupRequested: body.data.followupRequested,
    });
    return c.json({ ok: true });
  });

  /* ------------------------- deletion ------------------------- */

  app.post('/api/privacy/delete', async (c) => {
    const token = (c.req.header('x-deletion-token') ?? '').trim();
    if (!token) return c.json(NEUTRAL, 404);
    const row = repo.getSessionByAnyTokenHash(hashToken(token));
    const body = deleteInput.safeParse(await c.req.json().catch(() => null));
    if (!body.success || body.data.confirmation !== 'delete') {
      return c.json({ ok: false, message: 'Deletion requires explicit confirmation.' }, 400);
    }
    if (!row || row.status === 'deleted' || row.status === 'expired') {
      // idempotent, no existence leak (PRIV-007)
      return c.json({ ok: true, neutral: true, receipt: { id: 'processed' } });
    }
    const sessionId = row.id;
    repo.recordDeletion(sessionId, hashToken(token));
    const contactIds = repo.db
      .prepare(
        'SELECT DISTINCT contact_id AS cid FROM consents WHERE session_id = ? AND contact_id IS NOT NULL',
      )
      .all(sessionId) as Array<{ cid: string }>;
    // deletion receipt to the contact before records are removed (PRD §17.3)
    for (const { cid } of contactIds) {
      const contact = cid ? repo.getContact(cid) : undefined;
      if (contact) {
        await email.sendDeletionReceipt({
          to: contact.email_normalized,
          language: row.language as 'en' | 'zh-CN',
        });
      }
    }
    repo.deleteSession(sessionId);
    for (const { cid } of contactIds) {
      const stillLinked = repo.db
        .prepare('SELECT COUNT(*) AS n FROM consents WHERE contact_id = ? AND session_id != ?')
        .get(cid, sessionId) as { n: number };
      if (stillLinked.n === 0) {
        repo.db.prepare('DELETE FROM contacts WHERE id = ?').run(cid);
      }
    }
    analytics.track('deletion_requested', { privacyMode: row.privacy_mode });
    return c.json({ ok: true, receipt: { id: sessionId.slice(0, 8), deletedAt: new Date().toISOString() } });
  });

  /* ------------------------- admin ------------------------- */

  async function adminAuth(c: C, next: () => Promise<void>) {
    const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
    if (!env.ADMIN_TOKEN || !constantTimeEqual(token, env.ADMIN_TOKEN)) {
      return c.json({ ok: false, message: 'Unauthorized.' }, 401);
    }
    await next();
  }

  app.get('/api/admin/metrics', adminAuth, (c) => c.json({ ok: true, metrics: admin.metrics() }));
  app.get('/api/admin/sessions', adminAuth, (c) => c.json({ ok: true, sessions: admin.sessionList() }));

  app.get('/api/admin/sessions/:id', adminAuth, (c) => {
    const row = repo.getSessionById(c.req.param('id') ?? '');
    if (!row) return c.json({ ok: false, message: 'Not found.' }, 404);
    return c.json({ ok: true, session: admin.sessionView(row) });
  });

  app.post('/api/admin/sessions/:id/reveal', adminAuth, async (c) => {
    const row = repo.getSessionById(c.req.param('id') ?? '');
    if (!row) return c.json({ ok: false, message: 'Not found.' }, 404);
    const body = (await c.req.json().catch(() => ({ reason: '' }))) as { reason?: string };
    const reason = (body.reason ?? '').trim();
    if (reason.length < 3) return c.json({ ok: false, message: 'A reason is required for reveal.' }, 400);
    const raw = admin.revealRawAnswers(row.id, 'admin', reason);
    return c.json({ ok: true, raw });
  });

  app.get('/api/admin/contacts/export', adminAuth, (c) => {
    const rows = admin.contactsExport();
    const header = 'email,first_name,newsletter,pulse,followup,created_at';
    const lines = rows.map((r) =>
      [r.email, r.firstName ?? '', r.newsletter ? '1' : '0', r.pulse ? '1' : '0', r.followup ? '1' : '0', r.createdAt]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', 'attachment; filename="2027-strategy-consented-contacts.csv"');
    return c.body([header, ...lines].join('\n'));
  });

  app.get('/api/admin/audit', adminAuth, (c) => c.json({ ok: true, audit: repo.listAudit() }));

  return app;
}

/* ------------------------- helpers ------------------------- */

function row_lang(row: SessionRow): 'en' | 'zh-CN' {
  return row.language as 'en' | 'zh-CN';
}

function latestDeliveryContact(repo: Repo, sessionId: string) {
  const rows = repo.db
    .prepare(
      'SELECT contact_id FROM consents WHERE session_id = ? AND purpose = ? AND granted = 1 ORDER BY granted_at DESC LIMIT 1',
    )
    .all(sessionId, 'report_delivery') as Array<{ contact_id: string | null }>;
  const cid = rows[0]?.contact_id;
  return cid ? repo.getContact(cid) : undefined;
}

function handleError(c: C, err: unknown) {
  if (err instanceof DomainError) {
    const status =
      err.code === 'not_found'
        ? 404
        : err.code === 'wrong_state' || err.code === 'invalid_stage'
          ? 409
          : err.code === 'insufficient_input'
            ? 422
            : err.code === 'sensitive_blocked'
              ? 422
              : err.code === 'limit_exceeded'
                ? 429
                : 400;
    return c.json({ ok: false, code: err.code, message: err.message }, status);
  }
  const msg = err instanceof Error ? err.message : 'Unknown error';
  if (/^llm /.test(msg)) {
    return c.json(
      {
        ok: false,
        code: 'ai_failed',
        message: 'The AI could not complete that step. Your answer is safe. Please retry.',
      },
      502,
    );
  }
  logger.error('api', 'unhandled', { error: msg.slice(0, 160) });
  return c.json({ ok: false, code: 'internal', message: 'Something went wrong. Please try again.' }, 500);
}
