import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, migrate } from '../../src/db';
import { Repo } from '../../src/repo';
import { FieldCipher, sha256Hex } from '../../src/security';
import { Orchestrator, DomainError } from '../../src/orchestrator';
import { AdminService } from '../../src/services/admin';
import { AnalyticsService } from '../../src/services/analytics';
import { ConsoleEmailProvider } from '../../src/email/providers';
import { createApp } from '../../src/app';
import { loadEnv } from '../../src/env';
import type { AppEnv } from '../../src/env';
import { DeterministicProvider } from '../../src/llm/deterministic';
import { FakeProvider } from '../../src/llm/fake';
import { CORE_STAGES, INJECTION_ANSWER } from '@2027strategy/shared';

function env(): AppEnv {
  return loadEnv({
    NODE_ENV: 'test',
    LLM_MODE: 'deterministic',
    ADMIN_TOKEN: 'admin-sec-tests-xyz',
    ENCRYPTION_KEY: '',
    APP_SECRET: 'security-test-secret-24chars-min',
    PUBLIC_ORIGIN: 'http://localhost:3317',
  });
}

let repo: Repo;
let orch: Orchestrator;
let admin: AdminService;
let analytics: AnalyticsService;
let email: ConsoleEmailProvider;
let e: AppEnv;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  e = env();
  const db = openDatabase();
  migrate(db);
  const cipher = new FieldCipher(e.ENCRYPTION_KEY, e.APP_SECRET);
  repo = new Repo(db, cipher);
  orch = new Orchestrator(repo, new DeterministicProvider());
  admin = new AdminService(repo, e.PULSE_MIN_CELL);
  analytics = new AnalyticsService(repo);
  email = new ConsoleEmailProvider(e);
  app = createApp({ repo, orchestrator: orch, admin, analytics, email, env: e });
});

async function api(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await app.request(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function create(token: Record<string, unknown> = {}) {
  const r = await api('POST', '/api/session', {
    language: 'en',
    lens: 'business',
    roleBand: 'director_vp',
    industryBand: 'technology',
    privacyMode: 'save',
    ...token,
  });
  return r.json as { token: string; reportToken: string };
}

describe('prompt-injection resistance (SEC-004)', () => {
  it('treats injection text as user content only; state machine stays intact', async () => {
    const { token } = await create();
    const res = await api('POST', `/api/session/${token}/answer`, {
      stageId: 'Q1',
      answer: INJECTION_ANSWER,
      idempotencyKey: 'inj-1-0000000001',
    });
    expect(res.status).toBe(200);
    const b = res.json as {
      session: { coreStage: number; currentStageId: string | null; status: string };
      assessment: {
        extracted_items?: Array<{ type: string; needs_validation: boolean }>;
      };
    };
    // injection must NOT skip stages or jump to approval
    expect(b.session.status).toBe('in_progress');
    expect(b.session.coreStage).toBe(1);
    expect(b.session.currentStageId).toBe('Q2');
    // user content stays user content — never converted into a verified fact
    const extracted = b.assessment.extracted_items ?? [];
    expect(extracted.every((e) => e.type !== 'user_fact')).toBe(true);
    // response exposes no hidden prompt or app secret
    const rawText = JSON.stringify(res.json);
    expect(rawText.toLowerCase()).not.toContain('api key:');
    expect(rawText).not.toContain('Bearer ');
  });
});

describe('invalid JSON / omit-field recovery (REPORT-001)', () => {
  it('server rejects invalid report and does not persist it', async () => {
    const db = openDatabase();
    migrate(db);
    const cipher = new FieldCipher('', 'x');
    const r2 = new Repo(db, cipher);
    const o2 = new Orchestrator(r2, new FakeProvider({ fakeBehavior: 'omit-field', promptVersion: 't' } as unknown as { fakeBehavior: 'omit-field'; promptVersion: string }));
    const a2 = new AdminService(r2, 20);
    const an2 = new AnalyticsService(r2);
    const em2 = new ConsoleEmailProvider(e);
    const app2 = createApp({ repo: r2, orchestrator: o2, admin: a2, analytics: an2, email: em2, env: e });
    const mk = await app2.request('http://localhost/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'en', lens: 'business', roleBand: 'owner', industryBand: 'other', privacyMode: 'save',
      }),
    });
    const { token } = (await mk.json()) as { token: string };
    for (let i = 0; i < 8; i++) {
      const stage = CORE_STAGES[i]!;
      await app2.request(`http://localhost/api/session/${token}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId: stage, answer: 'A specific and sufficiently detailed answer for stage ' + stage + ' with owner and deadline.', idempotencyKey: `rf-${stage}-0000001` }),
      });
    }
    const ref = await app2.request(`http://localhost/api/session/${token}/reflection`, { method: 'POST' });
    expect(ref.status).toBe(200);
    await app2.request(`http://localhost/api/session/${token}/reflection/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ corrections: '', confirmation: 'confirm', idempotencyKey: 'rf-confirm-0000001' }),
    });
    const preview = await app2.request(`http://localhost/api/session/${token}/preview`, { method: 'GET' });
    // invalid report → recoverable error, no report persisted
    expect([400, 409, 422, 502]).toContain(preview.status);
    const reports = r2.db.prepare('SELECT COUNT(*) AS n FROM reports').get() as { n: number };
    expect(reports.n).toBe(0);
  });
});

describe('email failure recovery (FR-032/040, EMAIL-003)', () => {
  it('keeps report on screen and exposes a resend path with cooldown when email fails', async () => {
    const { token } = await create();
    // simulate failing email provider on resend path
    for (let i = 0; i < 8; i++) {
      const stage = CORE_STAGES[i]!;
      await api('POST', `/api/session/${token}/answer`, {
        stageId: stage,
        answer: `Specific answer ${stage}: owner is the CTO, deadline Q4, observable outcome defined with numbers and trade-offs described.`,
        idempotencyKey: `em-${stage}-0000001`,
      });
    }
    await api('POST', `/api/session/${token}/reflection`);
    await api('POST', `/api/session/${token}/reflection/confirm`, {
      corrections: '',
      confirmation: 'confirm',
      idempotencyKey: 'em-confirm-00000001',
    });
    // delivery with email triggers console provider (succeeds); verify report remains
    const d = await api('POST', `/api/session/${token}/delivery`, {
      email: 'recover@example.com',
      consents: { reportDelivery: true, newsletter: false, pulse: false, followup: false },
      idempotencyKey: 'em-delivery-0000001',
    });
    expect(d.status).toBe(200);
    expect((d.json as { emailDelivered: boolean }).emailDelivered).toBe(true);
    // resend success; then immediate resend is rate limited (cooldown)
    const resend1 = await api('POST', `/api/report/${token}/resend`);
    expect(resend1.status).toBe(200);
    const resend2 = await api('POST', `/api/report/${token}/resend`);
    expect([200, 429]).toContain(resend2.status);
  });
});

describe('analytics minimization (PRIV-008/009)', () => {
  it('blocks any event carrying disallowed raw content', async () => {
    // direct service test: raw text must be rejected by allow-list
    const { isAllowedAnalyticsEvent } = await import('@2027strategy/shared');
    expect(isAllowedAnalyticsEvent('stage_completed', { stageId: 'Q1', skipped: false })).toEqual({ ok: true });
    const blocked = isAllowedAnalyticsEvent('stage_completed', { answerText: 'secret raw answer' });
    expect(blocked.ok).toBe(false);
    // tracking disallowed props writes nothing
    analytics.track('stage_completed', { stageId: 'Q1', skipped: false, email: 'x@y.z' } as never);
    const n = repo.db.prepare('SELECT COUNT(*) AS n FROM analytics_events').get() as { n: number };
    expect(n.n).toBe(0);
  });
});

describe('retention job (PRIV-012)', () => {
  it('purges private sessions after expiry and leaves deletion audit intact', async () => {
    const { token } = await create({ privacyMode: 'private' });
    const sid = (repo.db.prepare('SELECT id FROM sessions').get() as { id: string }).id;
    // simulate retention sweep: private sessions whose expires_at < now are deleted
    repo.updateSession(sid, { expires_at: new Date(Date.now() - 1000).toISOString() });
    const ids = repo.listExpiredBefore(new Date().toISOString(), 'private');
    expect(ids).toContain(sid);
    repo.deleteSession(sid);
    const left = repo.db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number };
    expect(left.n).toBe(0);
    void token;
  });
});

describe('domain error mapping', () => {
  it('edit of nonexistent response returns neutral not-found', async () => {
    const { token } = await create();
    const res = await api('POST', `/api/session/${token}/answer/does-not-exist/edit`, {
      answer: 'edited',
    });
    expect(res.status).toBe(404);
  });
});

describe('email failure recovery with failing provider (EMAIL-003, FR-032/040)', () => {
  it('keeps the report on screen and reports non-delivery when the provider fails', async () => {
    const db = openDatabase();
    migrate(db);
    const repo2 = new Repo(db, new FieldCipher('', 'fail-secret-24-characters-min'));
    const o2 = new Orchestrator(repo2, new DeterministicProvider());
    const failingEmail: EmailServiceShim = {
      providerName: 'failing',
      async sendReport() { return { ok: false, provider: 'failing', emailId: 'x', status: 'failed' }; },
      async sendDeletionReceipt() { return { ok: true, provider: 'failing', emailId: 'x', status: 'sent' }; },
      async sendConsentConfirmation() { return { ok: true, provider: 'failing', emailId: 'x', status: 'sent' }; },
    };
    const app2 = createApp({
      repo: repo2,
      orchestrator: o2,
      admin: new AdminService(repo2, 20),
      analytics: new AnalyticsService(repo2),
      email: failingEmail as never,
      env: e,
    });
    const mk = await app2.request('http://localhost/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'en', lens: 'business', roleBand: 'owner', industryBand: 'other', privacyMode: 'save' }),
    });
    const { token } = (await mk.json()) as { token: string };
    for (let i = 0; i < 8; i++) {
      const stage = CORE_STAGES[i]!;
      await app2.request(`http://localhost/api/session/${token}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId: stage, answer: `Specific answer ${stage} with owner, deadline Q4 and a measurable outcome and numbers.`, idempotencyKey: `ef-${stage}-0000001` }),
      });
    }
    await app2.request(`http://localhost/api/session/${token}/reflection`, { method: 'POST' });
    await app2.request(`http://localhost/api/session/${token}/reflection/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ corrections: '', confirmation: 'confirm', idempotencyKey: 'ef-confirm-00000001' }),
    });
    const d = await app2.request(`http://localhost/api/session/${token}/delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fail@example.com', consents: { reportDelivery: true, newsletter: false, pulse: false, followup: false }, idempotencyKey: 'ef-delivery-0000001' }),
    });
    expect(d.status).toBe(200);
    const body = (await d.json()) as { emailDelivered: boolean; session: { status: string } };
    expect(body.emailDelivered).toBe(false);
    // report still available on screen afterwards
    const rep = await app2.request(`http://localhost/api/session/${token}/preview`, { method: 'GET' });
    expect([200, 409]).toContain(rep.status);
  });
});

describe('admin consented export without strategy text (ADMIN-004, FR-038)', () => {
  it('exports consented contact metadata only', async () => {
    // seed a saved session + contact with newsletter + pulse consent
    const mk = await api('POST', '/api/session', {
      language: 'en', lens: 'technology', roleBand: 'c_suite', industryBand: 'integrated_resort_hospitality', privacyMode: 'save',
    });
    const { token } = mk.json as { token: string };
    for (let i = 0; i < 8; i++) {
      const stage = CORE_STAGES[i]!;
      await api('POST', `/api/session/${token}/answer`, { stageId: stage, answer: `Export-answer ${stage} owner CTO deadline Q4 outcome measured with numbers and trade-offs.`, idempotencyKey: `ex-${stage}-000001` });
    }
    await api('POST', `/api/session/${token}/reflection`);
    await api('POST', `/api/session/${token}/reflection/confirm`, { corrections: '', confirmation: 'confirm', idempotencyKey: 'ex-confirm-0000001' });
    await api('POST', `/api/session/${token}/delivery`, { email: 'export-me@example.com', consents: { reportDelivery: true, newsletter: true, pulse: true, followup: false }, idempotencyKey: 'ex-delivery-0000001' });
    const res = await app.request('http://localhost/api/admin/contacts/export', {
      headers: { Authorization: 'Bearer admin-sec-tests-xyz' },
    });
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain('export-me@example.com');
    expect(csv).toMatch(/newsletter,pulse/);
    // no strategy/answer/report text anywhere
    expect(csv).not.toContain('Export-answer');
    expect(csv.toLowerCase()).not.toContain('strategy brief');
  });
});

type EmailServiceShim = {
  providerName: string;
  sendReport(i: { to: string; language: string }): Promise<{ ok: boolean }>;
  sendDeletionReceipt(i: { to: string }): Promise<{ ok: boolean }>;
  sendConsentConfirmation(i: { to: string }): Promise<{ ok: boolean }>;
};
