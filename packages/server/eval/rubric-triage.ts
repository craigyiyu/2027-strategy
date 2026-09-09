/**
 * AI-rubric triage (UAT plan §6.2/6.3). Runs Personas A–E (deterministic by
 * default; LLM_MODE=live uses DeepSeek), renders the full report bodies to
 * test-evidence/ai-evaluations/full-reports/, then asks a judge model to score
 * the nine-dimension rubric (1–5). Output is TRIAGE for a human release
 * authority — it cannot be the sole release gate (§6.1).
 * Usage: pnpm --filter @2027strategy/server eval:rubric
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PERSONAS, CORE_STAGES, PROVENANCE_LABELS_EN } from '@2027strategy/shared';
import { openDatabase, migrate } from '../src/db';
import { Repo } from '../src/repo';
import { FieldCipher } from '../src/security';
import { Orchestrator } from '../src/orchestrator';
import { createLlmProvider } from '../src/llm';
import { loadEnv } from '../src/env';

const RUBRIC_DIMENSIONS = [
  'Diagnosis specificity',
  'Crux quality',
  'Alternative quality',
  'Choice clarity',
  'Evidence traceability',
  'Assumption quality',
  'Action coherence',
  'Execution testability',
  'Governance integrity',
];

const RULE_SYSTEM =
  'You are a strict reviewer of an executive strategy report produced by an AI copilot. ' +
  'Score each rubric dimension 1-5 using this scale: 1 unacceptable, 3 adequate, 5 excellent. ' +
  'Return pure JSON only: {"scores":{"<dimension>":<1-5>},"justifications":{"<dimension>":"..."},' +
  '"fabricated_claims":<count>,"traceable_statements":<count>,"material_statements_sampled":<count>,' +
  '"missing_unknowns_handled":true|false,"max_priorities":<n>,"has_stop_defer":true|false,' +
  '"hard_risks_require_human":true|false,"notes":"..."}. ' +
  'Never exceed score 5; do not award 5 unless fully evidenced in the report text.';

async function main() {
  const env = loadEnv();
  const db = openDatabase(':memory:');
  migrate(db);
  const repo = new Repo(db, new FieldCipher(env.ENCRYPTION_KEY, env.APP_SECRET));
  const llm = createLlmProvider(env);
  const orch = new Orchestrator(repo, llm);

  const reportDir = join(process.cwd(), '../../test-evidence/ai-evaluations/full-reports');
  mkdirSync(reportDir, { recursive: true });
  const triageDir = join(process.cwd(), '../../test-evidence/ai-evaluations/rubric-triage');
  mkdirSync(triageDir, { recursive: true });

  const runs: unknown[] = [];
  const summary: Record<string, unknown> = { judgeModel: env.LLM_FAST_MODEL, runs };
  const reportBodies: Array<{ persona: string; report: unknown }> = [];

  for (const id of ['A', 'B', 'C', 'D', 'E'] as const) {
    const p = PERSONAS[id];
    const row = repo.createSession({
      tokenHash: `rubric-${id}`,
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
    let report: unknown = null;
    let refusal: string | null = null;
    try {
      session = repo.getSessionById(session.id)!;
      await orch.generateReflection(session);
      session = repo.getSessionById(session.id)!;
      await orch.confirmReflection(session, '');
      session = repo.getSessionById(session.id)!;
      report = await orch.ensureReport(session);
    } catch (err) {
      refusal = err instanceof Error ? err.message.slice(0, 200) : String(err);
    }
    if (report) {
      const body = JSON.stringify(report, null, 1);
      writeFileSync(join(reportDir, `persona-${id}-${llm.meta.provider}.json`), body);
      reportBodies.push({ persona: id, report });
    }
    console.log(`[${id}] report=${!!report}${refusal ? ' refusal=' + refusal : ''}`);
  }

  // Judge pass over report bodies (LLM judge assists triage; human decides).
  for (const { persona, report } of reportBodies) {
    const target = report as {
      evidenceBase?: unknown[];
      actionPortfolio?: unknown[];
      stopDefer?: unknown[];
      riskReviews?: unknown[];
      limitations?: unknown[];
      language?: string;
    };
    const traceable = (target.evidenceBase ?? []).length;
    const userPrompt =
      `Persona ${persona}. Report JSON follows. Score the nine-dimension rubric. ` +
      `Rubric dimensions: ${RUBRIC_DIMENSIONS.join('; ')}.\n` +
      JSON.stringify(report).slice(0, 30_000);
    let judge: Record<string, unknown> | null = null;
    try {
      const raw = await judgeChat(llm.meta.provider === 'live' ? env : null, RULE_SYSTEM, userPrompt);
      judge = JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      judge = { judge_error: err instanceof Error ? err.message.slice(0, 160) : String(err) };
    }
    runs.push({
      persona,
      provider: llm.meta.provider,
      judge,
      reportedLimitations: target.limitations,
      maxPriorities: target.actionPortfolio?.length ?? null,
      hasStopDefer: (target.stopDefer?.length ?? 0) > 0,
    });
    const scoreFile = join(triageDir, `persona-${persona}-rubric-triage.json`);
    writeFileSync(scoreFile, JSON.stringify({ persona, judge, reportSummary: { maxPriorities: target.actionPortfolio?.length, evidenceStatements: traceable, riskReviews: target.riskReviews?.length } }, null, 2));
    console.log(`[judge] persona ${persona} done`);
  }

  const triageFile = join(triageDir, `rubric-triage-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(triageFile, JSON.stringify(summary, null, 2));
  console.log(`Written: ${triageFile}`);
}

async function judgeChat(env: unknown, system: string, user: string): Promise<string> {
  // Judge model runs only when a live key exists; otherwise echo a deterministic placeholder.
  const e = env as { DEEPSEEK_API_KEY?: string; LLM_BASE_URL?: string; LLM_FAST_MODEL?: string } | null;
  if (!e?.DEEPSEEK_API_KEY) return JSON.stringify({ triage: 'deterministic-no-judge' });
  const res = await fetch(`${(e.LLM_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: e.LLM_FAST_MODEL ?? 'deepseek-chat',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.0,
      response_format: { type: 'json_object' },
    }),
  });
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return j.choices?.[0]?.message?.content ?? '';
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
