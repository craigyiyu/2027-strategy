/**
 * AI fixture evaluation — deterministic engine runs of Personas A–E assert the
 * application-enforced AI quality thresholds (AI-008/009/010/011/012/017/020,
 * REPORT-003) without live-model credits.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, migrate } from '../../src/db';
import { Repo } from '../../src/repo';
import { FieldCipher } from '../../src/security';
import { Orchestrator } from '../../src/orchestrator';
import { DeterministicProvider } from '../../src/llm/deterministic';
import { PERSONAS, CORE_STAGES } from '@2027strategy/shared';
import { reportOutput } from '@2027strategy/shared';

function setup() {
  const db = openDatabase();
  migrate(db);
  const repo = new Repo(db, new FieldCipher('', 'ai-fixture-secret-24-char-min'));
  const orch = new Orchestrator(repo, new DeterministicProvider());
  return { db, repo, orch };
}

async function runPersona(orch: Orchestrator, repo: Repo, id: 'A' | 'B' | 'C' | 'D' | 'E') {
  const p = PERSONAS[id];
  const row = repo.createSession({
    tokenHash: `fixture-${id}-${Math.random()}`,
    language: p.language,
    lens: p.lens,
    roleBand: p.roleBand as never,
    industryBand: p.industryBand as never,
    privacyMode: 'private',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  let session = row;
  let stageId: string | null = 'Q1';
  const guard = new Set<string>();
  while (stageId && !guard.has(stageId)) {
    guard.add(stageId);
    session = repo.getSessionById(session.id)!;
    const a = (p.answers as Record<string, { text: string; skip?: boolean } | undefined>)[stageId];
    if (!a) { stageId = orch.currentCoreStageId(session); continue; }
    if (a.skip) { const r = await orch.skipStage(session); stageId = r.nextCoreStage; continue; }
    const res = await orch.submitCoreAnswer(session, stageId as never, a.text);
    if (res.followupQuestion) {
      session = repo.getSessionById(session.id)!;
      const fu = await orch.submitFollowupAnswer(session, 'The named owner is the accountable executive; threshold defined.');
      stageId = fu.nextCoreStage;
    } else stageId = res.nextCoreStage;
  }
  return { repo, sessionId: session.id, orch, session };
}

describe('AI fixture thresholds (deterministic)', () => {
  it('AI-012: full persona runs produce ≤3 priorities + Stop/Defer; provenance valid (AI-008/009/020)', async () => {
    for (const id of ['A', 'B', 'C'] as const) {
      const s = setup();
      const { repo, sessionId } = await runPersona(s.orch, s.repo, id);
      const session = s.repo.getSessionById(sessionId)!;
      await s.orch.generateReflection(session);
      const session2 = s.repo.getSessionById(sessionId)!;
      await s.orch.confirmReflection(session2, '');
      const session3 = s.repo.getSessionById(sessionId)!;
      const report = await s.orch.ensureReport(session3);
      const parsed = reportOutput.parse(report);
      expect(parsed.actionPortfolio.length).toBeLessThanOrEqual(3);
      expect(parsed.stopDefer.length).toBeGreaterThanOrEqual(1);
      // provenance labels only from the allowed set and no unlabelled statement
      const valid = new Set(['user_fact', 'user_assumption', 'ai_inference', 'needs_validation', 'human_decision']);
      const statements: Array<{ label?: string }> = [
        ...parsed.evidenceBase,
        ...parsed.stopDefer,
        parsed.decisionBrief.decision,
        parsed.challengeDiagnosis.confirmedDiagnosis,
      ];
      expect(statements.length).toBeGreaterThan(0);
      for (const st of statements) expect(valid.has(st.label!), `bad label ${st.label}`).toBe(true);
      // AI-011: no fabricated citations/statistics/named-company benchmark patterns
      const json = JSON.stringify(parsed).toLowerCase();
      expect(json).not.toMatch(/hbr\.org|harvard|forbes|gartner|mckinsey|accenture|\$[\d,]{6,}|\b\d+% market\b|study shows/i);
    }
  });

  it('AI-010: contradictions surfaced on reflection, never silently reconciled (Persona E)', async () => {
    const s = setup();
    const { sessionId } = await runPersona(s.orch, s.repo, 'E');
    const session = s.repo.getSessionById(sessionId)!;
    const reflection = await s.orch.generateReflection(session);
    expect(reflection.conflicts.length).toBeGreaterThanOrEqual(1);
    const all = reflection.conflicts.concat(reflection.missing_evidence).join(' ').toLowerCase();
    expect(all).toMatch(/validation|consistent|check/i);
  });

  it('AI-017: refuses report when too few substantive answers exist', async () => {
    const s = setup();
    const row = s.repo.createSession({
      tokenHash: 'insufficient-fixture-token',
      language: 'en',
      lens: 'business',
      roleBand: 'owner',
      industryBand: 'other',
      privacyMode: 'private',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const SUFF = 'A sufficiently detailed answer with owner, deadline and measurable outcome by Q4 with numbers.';
    let session = row;
    for (let i = 0; i < 8; i++) {
      session = s.repo.getSessionById(session.id)!;
      const stage = CORE_STAGES[i]!;
      if (i < 4) {
        await s.orch.submitCoreAnswer(session, stage, SUFF);
      } else {
        await s.orch.skipStage(session);
      }
    }
    const final = s.repo.getSessionById(row.id)!;
    await expect(s.orch.generateReflection(final)).rejects.toMatchObject({ code: 'insufficient_input' });
    await expect(s.orch.ensureReport(final)).rejects.toMatchObject({ code: 'insufficient_input' });
  });
});
