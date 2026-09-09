/**
 * Live-model persona evaluation harness (opt-in; NEVER auto-run in CI).
 * Usage: pnpm --filter @2027strategy/server eval:live
 * Runs Personas A–E through the real LLM (or deterministic for a dry run with
 * LLM_MODE=deterministic) and prints rubric-relevant excerpts + writes JSON
 * under test-evidence/ for human scoring.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { openDatabase, migrate } from '../src/db';
import { Repo } from '../src/repo';
import { FieldCipher } from '../src/security';
import { Orchestrator } from '../src/orchestrator';
import { createLlmProvider } from '../src/llm';
import { loadEnv } from '../src/env';
import { PERSONAS } from '@2027strategy/shared';
import { CORE_STAGES } from '@2027strategy/shared';

const env = loadEnv();
const db = openDatabase(':memory:');
migrate(db);
const cipher = new FieldCipher(env.ENCRYPTION_KEY, env.APP_SECRET);
const repo = new Repo(db, cipher);
const llm = createLlmProvider(env);
const orch = new Orchestrator(repo, llm);

async function run() {
  const runs: unknown[] = [];
  const out: Record<string, unknown> = { provider: llm.meta.provider, modelId: llm.meta.modelId, runs };
  for (const p of [PERSONAS.A, PERSONAS.B, PERSONAS.C, PERSONAS.D, PERSONAS.E]) {
    const row = repo.createSession({
      tokenHash: `eval-${p.id}`,
      language: p.language,
      lens: p.lens,
      roleBand: p.roleBand as never,
      industryBand: p.industryBand as never,
      privacyMode: 'private',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    const log: Array<Record<string, unknown>> = [];
    let session = row;
    let stageId: string | null = 'Q1';
    const guard = new Set<string>();
    while (stageId && !guard.has(stageId)) {
      guard.add(stageId);
      session = repo.getSessionById(session.id)!;
      const a = (p.answers as Record<string, { text: string; skip?: boolean } | undefined>)[stageId];
      if (!a) { stageId = orch.currentCoreStageId(session); continue; }
      if (a.skip) {
        const r = await orch.skipStage(session);
        log.push({ stage: stageId, action: 'skip', next: r.nextCoreStage });
        stageId = r.nextCoreStage;
        continue;
      }
      try {
        const res = await orch.submitCoreAnswer(session, stageId as never, a.text);
        log.push({ stage: stageId, quality: res.assessment.answer_quality, followup: res.followupQuestion, next: res.nextCoreStage });
        if (res.followupQuestion) {
          // real client answers the follow-up, then machine advances
          session = repo.getSessionById(session.id)!;
          const fu = await orch.submitFollowupAnswer(session, 'The named owner is the accountable executive; the decision threshold is defined.');
          log.push({ stage: stageId, action: 'followup-answer', next: fu.nextCoreStage });
          stageId = fu.nextCoreStage;
        } else {
          stageId = res.nextCoreStage;
        }
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        log.push({ stage: stageId, error: m.slice(0, 200) });
        break;
      }
    }
    let reflection = null;
    let report = null;
    try {
      session = repo.getSessionById(session.id)!;
      reflection = await orch.generateReflection(session);
      session = repo.getSessionById(session.id)!;
      await orch.confirmReflection(session, '');
      session = repo.getSessionById(session.id)!;
      report = await orch.ensureReport(session);
    } catch (err) {
      log.push({ finalError: err instanceof Error ? err.message.slice(0, 240) : String(err) });
    }
    runs.push({ persona: p.id, name: p.name, log, reflectionKeys: reflection ? Object.keys(reflection) : [], reportKeys: report ? Object.keys(report) : [], thesis: report?.strategyThesis, limitations: report?.limitations });
    console.log(`[${p.id}] done${report ? ' — thesis: ' + report.strategyThesis.slice(0, 160) : ''}`);
  }
  const dir = 'test-evidence/ai-evaluations';
  mkdirSync(dir, { recursive: true });
  const file = `${dir}/personas-${llm.meta.provider}-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`\nWritten: ${file}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
