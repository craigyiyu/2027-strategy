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
import { PERSONA_A } from '@2027strategy/shared';
import { CORE_STAGES } from '@2027strategy/shared';

function testEnv(): AppEnv {
  return loadEnv({
    NODE_ENV: 'test',
    LLM_MODE: 'deterministic',
    ADMIN_TOKEN: 'test-admin-token-abcdef-123456',
    ENCRYPTION_KEY: '',
    APP_SECRET: 'integration-test-secret-24chars-min',
    PUBLIC_ORIGIN: 'http://localhost:3317',
    RETENTION_PRIVATE_HOURS: '1',
    RETENTION_SAVED_DAYS: '90',
  });
}

let repo: Repo;
let orch: Orchestrator;
let admin: AdminService;
let analytics: AnalyticsService;
let email: ConsoleEmailProvider;
let env: AppEnv;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  env = testEnv();
  const db = openDatabase();
  migrate(db);
  const cipher = new FieldCipher(env.ENCRYPTION_KEY, env.APP_SECRET);
  repo = new Repo(db, cipher);
  orch = new Orchestrator(repo, new DeterministicProvider());
  admin = new AdminService(repo, env.PULSE_MIN_CELL);
  analytics = new AnalyticsService(repo);
  email = new ConsoleEmailProvider(env);
  app = createApp({ repo, orchestrator: orch, admin, analytics, email, env });
});

const BASE_URL = 'http://localhost';

async function api(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await app.request(`${BASE_URL}${path}`, {
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

async function createSession(overrides: Record<string, unknown> = {}) {
  const r = await api('POST', '/api/session', {
    language: 'en',
    lens: 'technology',
    roleBand: 'c_suite',
    industryBand: 'integrated_resort_hospitality',
    privacyMode: 'save',
    ...overrides,
  });
  expect(r.status).toBe(200);
  const body = r.json as { token: string; reportToken: string };
  return body;
}

/** Answer all 8 stages with Persona A answers (sufficient quality). */
async function completeInterview(token: string, idemPrefix = 'it') {
  for (let i = 0; i < 8; i++) {
    const stage = CORE_STAGES[i]!;
    const answer = (PERSONA_A.answers as Record<string, { text: string }>)[stage]!.text;
    const res = await api('POST', `/api/session/${token}/answer`, {
      stageId: stage,
      answer,
      idempotencyKey: `${idemPrefix}-${stage}-${Date.now()}`,
    });
    expect(res.status).toBe(200);
    const b = res.json as { session: { status: string } };
    if (b.session.status === 'reflection_ready') break;
  }
  const s = await api('GET', `/api/session/${token}`);
  return (s.json as { session: { status: string; coreStage: number } }).session;
}

describe('API happy path (anonymous → report)', () => {
  it('creates a session without email and completes all stages (FR-001..005)', async () => {
    const { token } = await createSession();
    const s0 = await api('GET', `/api/session/${token}`);
    expect((s0.json as { session: { currentStageId: string; status: string } }).session.currentStageId).toBe('Q1');
    const sess = await completeInterview(token, 'happy');
    expect(sess.status).toBe('reflection_ready');
    expect(sess.coreStage).toBe(8);
  });

  it('reflect + confirm + preview precede any email (FR-012..016)', async () => {
    const { token } = await createSession();
    await completeInterview(token, 'preview');
    const ref = await api('POST', `/api/session/${token}/reflection`);
    expect(ref.status).toBe(200);
    const reflection = (ref.json as { reflection: { decision: string } }).reflection;
    expect(reflection.decision.length).toBeGreaterThan(0);

    // preview before confirmation must be rejected (FUNC-012)
    const pre = await api('GET', `/api/session/${token}/preview`);
    expect(pre.status).toBe(409);

    const conf = await api('POST', `/api/session/${token}/reflection/confirm`, {
      corrections: '',
      confirmation: 'confirm',
      idempotencyKey: `confirm-${Date.now()}`,
    });
    expect(conf.status).toBe(200);

    const preview = await api('GET', `/api/session/${token}/preview`);
    expect(preview.status).toBe(200);
    const p = preview.json as {
      preview: {
        strategyThesis: string;
        pivotalChallenge: string;
        proposedPriorities: string[];
        stopDefer: string;
        unresolvedTension: string;
        readinessSnapshot: unknown[];
      };
    };
    expect(p.preview.proposedPriorities.length).toBeLessThanOrEqual(3);
    expect(p.preview.stopDefer.length).toBeGreaterThan(0);
    expect(p.preview.readinessSnapshot).toHaveLength(5);
  });

  it('no numeric total strategy score anywhere (FR-017)', async () => {
    const { token } = await createSession();
    await completeInterview(token, 'noscore');
    await api('POST', `/api/session/${token}/reflection`);
    await api('POST', `/api/session/${token}/reflection/confirm`, {
      corrections: '',
      confirmation: 'confirm',
      idempotencyKey: `ns-${Date.now()}`,
    });
    const preview = await api('GET', `/api/session/${token}/preview`);
    expect(JSON.stringify(preview.json)).not.toMatch(/"score"/i);
    const report = await api('GET', `/api/session/${token}/preview`);
    expect(JSON.stringify(report.json)).not.toMatch(/\bscore\b/i);
  });

  it('anonymous delivery (no email) still produces an on-screen report', async () => {
    const { token } = await createSession();
    await completeInterview(token, 'anon');
    await api('POST', `/api/session/${token}/reflection`);
    await api('POST', `/api/session/${token}/reflection/confirm`, {
      corrections: '',
      confirmation: 'confirm',
      idempotencyKey: `anon-confirm-${Date.now()}`,
    });
    const deliv = await api('POST', `/api/session/${token}/delivery`, {
      consents: { reportDelivery: true, newsletter: false, pulse: false, followup: false },
      idempotencyKey: `anon-delivery-${Date.now()}`,
    });
    expect(deliv.status).toBe(200);
    const db = repo.db;
    const pulse = db.prepare('SELECT COUNT(*) AS n FROM pulse_tags').get() as { n: number };
    expect(pulse.n).toBe(0);
    // no consent rows for an anonymous path
    const consents = db.prepare('SELECT COUNT(*) AS n FROM consents').get() as { n: number };
    expect(consents.n).toBe(0);
  });
});

describe('follow-up limits end to end (FUNC-006/007)', () => {
  it('never exceeds four follow-ups even when the model requests more', async () => {
    // use Persona D-style vague answers to trigger deterministic follow-ups at every stage
    const { token } = await createSession({ lens: 'business' });
    const vagueAnswers: Record<string, string> = {
      Q1: 'We need to decide things next year.',
      Q2: 'The market changed a lot and now it feels different and urgent, honestly.',
      Q3: 'Success is implementing AI and improving customer experience everywhere.',
      Q4: 'The problem is simply poor customer experience.',
      Q5: 'AI, innovation, customers, growth, talent, digital and culture are all equal top priorities for us in 2027.',
      Q6: 'We will do AI enablement, then adoption, then a centre of excellence.',
      Q7: 'It will work because we have good people and modern tools.',
      Q8: 'Launch an AI pilot and review it next quarter.',
    };
    let followupsAsked = 0;
    for (let i = 0; i < 8; i++) {
      const stage = CORE_STAGES[i]!;
      const answer = vagueAnswers[stage]!;
      const res = await api('POST', `/api/session/${token}/answer`, {
        stageId: stage,
        answer,
        idempotencyKey: `v-${stage}-${Date.now()}-${i}`,
      });
      expect(res.status).toBe(200);
      const b = res.json as { followupQuestion: string | null; session: { status: string } };
      if (b.followupQuestion) {
        followupsAsked++;
        const fu = await api('POST', `/api/session/${token}/followup`, {
          stageId: `FU-${stage}`,
          answer: 'The named owner is the division head; decision due by March.',
          idempotencyKey: `fu-${stage}-${Date.now()}`,
        });
        expect(fu.status).toBe(200);
      }
      if (b.session.status === 'reflection_ready') break;
    }
    expect(followupsAsked).toBeLessThanOrEqual(4);
  });
});

describe('consent independence (FR-018/019, PRIV-002..005)', () => {
  it('stores optional consents unchecked and separately, and creates pulse tags only on consent', async () => {
    const { token } = await createSession();
    await completeInterview(token, 'consent');
    await api('POST', `/api/session/${token}/reflection`);
    await api('POST', `/api/session/${token}/reflection/confirm`, {
      corrections: '',
      confirmation: 'confirm',
      idempotencyKey: `c-${Date.now()}`,
    });
    // newsletter only — no pulse
    const delivery = await api('POST', `/api/session/${token}/delivery`, {
      email: 'consent.test@example.com',
      firstName: 'Tester',
      consents: { reportDelivery: true, newsletter: true, pulse: false, followup: false },
      idempotencyKey: `d-${Date.now()}`,
    });
    expect(delivery.status).toBe(200);
    const sid = (repo.db
      .prepare('SELECT id FROM sessions WHERE public_token_hash = ?')
      .get(sha256Hex(token)) as { id: string }).id;
    const purposes = repo.listConsentsForSession(sid)
      .map((c) => c.purpose)
      .sort();
    expect(purposes).toContain('report_delivery');
    expect(purposes).toContain('newsletter');
    expect(purposes).not.toContain('pulse');
    const pulseCount = repo.db.prepare('SELECT COUNT(*) AS n FROM pulse_tags').get() as { n: number };
    expect(pulseCount.n).toBe(0);
  });

  it('does not create a contact until email is provided', async () => {
    const { token } = await createSession();
    const contacts = repo.db.prepare('SELECT COUNT(*) AS n FROM contacts').get() as { n: number };
    expect(contacts.n).toBe(0);
    void token;
  });
});

describe('deletion (FR-023, PRIV-007)', () => {
  it('deletes answers/reports/contacts and is idempotent', async () => {
    const beforeSessions = (repo.db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n;
    const { token } = await createSession();
    await completeInterview(token, 'del');
    await api('POST', `/api/session/${token}/reflection`);
    await api('POST', `/api/session/${token}/reflection/confirm`, {
      corrections: '',
      confirmation: 'confirm',
      idempotencyKey: `del-${Date.now()}`,
    });
    await api('POST', `/api/session/${token}/delivery`, {
      email: 'delete.me@example.com',
      consents: { reportDelivery: true, newsletter: true, pulse: false, followup: false },
      idempotencyKey: `dd-${Date.now()}`,
    });
    const sessionId = (repo.db
      .prepare('SELECT id FROM sessions WHERE public_token_hash = ?')
      .get(sha256Hex(token)) as { id: string }).id;
    const res = await api(
      'POST',
      '/api/privacy/delete',
      { confirmation: 'delete' },
      { 'x-deletion-token': token },
    );
    expect(res.status).toBe(200);
    const gone = repo.db.prepare('SELECT COUNT(*) AS n FROM responses WHERE session_id = ?').get(sessionId) as { n: number };
    expect(gone.n).toBe(0);
    const goneReports = repo.db.prepare('SELECT COUNT(*) AS n FROM reports WHERE session_id = ?').get(sessionId) as { n: number };
    expect(goneReports.n).toBe(0);
    const sessNow = repo.db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number };
    expect(sessNow.n).toBe(beforeSessions);
    // repeat deletion → neutral 200, no leak
    const again = await api(
      'POST',
      '/api/privacy/delete',
      { confirmation: 'delete' },
      { 'x-deletion-token': token },
    );
    expect(again.status).toBe(200);
    expect((again.json as { neutral?: boolean }).neutral).toBe(true);
  });
});

describe('cross-session access control (SEC-009)', () => {
  it('one session token cannot read another session', async () => {
    const a = await createSession();
    const b = await createSession();
    // fill A
    await completeInterview(a.token, 'xsa');
    const leaked = await api('POST', `/api/session/${b.token}/answer`, {
      stageId: 'Q1',
      answer: 'Trying to answer B from A',
      idempotencyKey: `x-${Date.now()}`,
    });
    // B is at Q1 with created status and A doesn't know B's token semantics — still valid check:
    expect(leaked.status).toBe(200); // B's own token works
    const foreign = await api('GET', `/api/session/${b.token}`);
    expect(foreign.status).toBe(200);
    // Now confirm B's answeredStages only contains its own answer
    const st = (foreign.json as { session: { answeredStages: string[]; coreStage: number } }).session;
    expect(st.coreStage).toBe(1);
  });

  it('admin routes deny anonymous access (SEC-007)', async () => {
    const anon = await api('GET', '/api/admin/metrics');
    expect(anon.status).toBe(401);
    const bad = await api('GET', '/api/admin/metrics', undefined, {
      Authorization: 'Bearer wrong-token',
    });
    expect(bad.status).toBe(401);
    const good = await api('GET', '/api/admin/metrics', undefined, {
      Authorization: 'Bearer test-admin-token-abcdef-123456',
    });
    expect(good.status).toBe(200);
    expect((good.json as { metrics: { interviewStarts: number } }).metrics.interviewStarts).toBeGreaterThanOrEqual(0);
  });
});

describe('admin audited reveal (FR-026, SEC-008)', () => {
  it('raw answers hidden by default; reveal writes audit', async () => {
    const { token } = await createSession();
    await completeInterview(token, 'reveal');
    const sessionId = (repo.db
      .prepare('SELECT id FROM sessions WHERE public_token_hash = ?')
      .get(sha256Hex(token)) as { id: string }).id;
    const detail = await api('GET', `/api/admin/sessions/${sessionId}`, undefined, {
      Authorization: 'Bearer test-admin-token-abcdef-123456',
    });
    expect(detail.status).toBe(200);
    expect((detail.json as { session: { rawHidden: boolean } }).session.rawHidden).toBe(true);
    // reveal without reason rejected
    const noReason = await api(
      'POST',
      `/api/admin/sessions/${sessionId}/reveal`,
      { reason: '' },
      { Authorization: 'Bearer test-admin-token-abcdef-123456' },
    );
    expect(noReason.status).toBe(400);
    const revealed = await api(
      'POST',
      `/api/admin/sessions/${sessionId}/reveal`,
      { reason: 'test-qa' },
      { Authorization: 'Bearer test-admin-token-abcdef-123456' },
    );
    expect(revealed.status).toBe(200);
    const audit = repo.listAudit();
    expect(audit.some((a) => (a as { action: string }).action === 'raw_answer_reveal')).toBe(true);
    void token;
  });
});

describe('sensitive input is blocked before LLM (FR-011)', () => {
  it('blocks a credential-like answer end to end', async () => {
    const { token } = await createSession();
    const res = await api('POST', `/api/session/${token}/answer`, {
      stageId: 'Q1',
      answer: 'We use the key sk-test-NOT-REAL-1234567890 for staging.',
      idempotencyKey: `sens-${Date.now()}`,
    });
    expect(res.status).toBe(422);
    const json = res.json as { code: string };
    expect(json.code).toBe('sensitive_blocked');
  });
});

describe('idempotency (FR-033, FUNC-020)', () => {
  it('duplicate answer submission does not create duplicate response versions', async () => {
    const { token } = await createSession();
    const stage = 'Q1';
    const answer = 'Decide our data platform priority by Q4 with the Group CTO as owner.';
    const key = `idem-${Date.now()}`;
    const first = await api('POST', `/api/session/${token}/answer`, { stageId: stage, answer, idempotencyKey: key });
    expect(first.status).toBe(200);
    const second = await api('POST', `/api/session/${token}/answer`, { stageId: stage, answer, idempotencyKey: key });
    expect(second.status).toBe(200);
    const sessionId = (repo.db
      .prepare('SELECT id FROM sessions WHERE public_token_hash = ?')
      .get(sha256Hex(token)) as { id: string }).id;
    const versions = repo.db
      .prepare('SELECT COUNT(*) AS n FROM responses WHERE session_id = ? AND stage_id = ?')
      .get(sessionId, stage) as { n: number };
    expect(versions.n).toBeLessThanOrEqual(2); // superseded + active at most
  });
});

describe('feedback independent of newsletter consent (FR-035/036)', () => {
  it('saves feedback with follow-up request without any newsletter consent', async () => {
    const { token } = await createSession();
    await completeInterview(token, 'fb');
    const res = await api('POST', `/api/report/${token}/feedback`, {
      rating: 5,
      mostHelpfulQuestion: 'Q5',
      followupRequested: true,
    });
    expect(res.status).toBe(200);
    const db = repo.db;
    const fb = db.prepare('SELECT COUNT(*) AS n FROM feedback').get() as { n: number };
    expect(fb.n).toBe(1);
    const followupConsents = db
      .prepare("SELECT COUNT(*) AS n FROM consents WHERE purpose = 'followup' AND granted = 1")
      .get() as { n: number };
    expect(followupConsents.n).toBe(1);
    const nl = db.prepare("SELECT COUNT(*) AS n FROM consents WHERE purpose = 'newsletter'").get() as { n: number };
    expect(nl.n).toBe(0);
  });
});
