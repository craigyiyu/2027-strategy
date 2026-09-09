/**
 * Follow-up quality fixtures (AI-001..007). Runs the LIVE assess adapter with
 * crafted gap answers for each stage gate and verifies the follow-up is
 * targeted (keyword heuristics), one question, no invented data. Evidence
 * recorded under test-evidence/ai-evaluations/followups/. Opt-in live run.
 * Usage: pnpm --filter @2027strategy/server eval:followups
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createLlmProvider } from '../src/llm';
import { loadEnv } from '../src/env';
import { STAGE_CONTENT } from '@2027strategy/shared';

interface Scenario {
  id: string; // AI-001..007
  stage: string;
  answer: string;
  keywords: string[]; // follow-up must contain one+ of these (case-insensitive)
  reason: string;
}

const SCENARIOS: Scenario[] = [
  { id: 'AI-001', stage: 'Q1', answer: 'We need to decide our strategy direction next year.', keywords: ['owner', 'who', 'decide', 'decision', 'when', 'by when', '负责'], reason: 'missing decision owner/scope → asks who owns / by when' },
  { id: 'AI-002', stage: 'Q3', answer: 'Success means implementing AI across the company.', keywords: ['result', 'observable', 'outcome', 'measure', 'metric', 'target', 'measurable', 'change', '数字', '指标', '结果'], reason: 'activity-only outcome → asks observable result' },
  { id: 'AI-003', stage: 'Q4', answer: 'The problem is simply poor customer experience.', keywords: ['mechanism', 'alternative', 'cause', 'explanation', 'why', 'other', '机制', '替代', '原因'], reason: 'symptom stated as cause → mechanism + alternative' },
  { id: 'AI-004', stage: 'Q5', answer: 'Our top priorities are AI, innovation, customers, growth, talent, digital, culture, and brand — all eight are equally important.', keywords: ['which', 'single', 'one', 'priority', 'obstacle', 'stop', 'not do', 'exclude', 'defer', '哪一个', '单一', '不做', '停止', '延后', '排除'], reason: 'eight equal priorities → force pivotal + exclusion' },
  { id: 'AI-005', stage: 'Q6', answer: 'We will first do AI enablement, then AI adoption, then a centre of excellence.', keywords: ['approach', 'option', 'alternative', 'policy', 'different', 'trade', 'segment', 'capability', 'stop', 'deprioritize', '方案', '选项', '路径', '取舍', '不同', '细分', '能力'], reason: 'task variants presented as options → require different guiding policy' },
  { id: 'AI-006', stage: 'Q7', answer: 'It will work because we have good people and modern tools.', keywords: ['assumption', 'assume', 'evidence', 'must be true', 'what if', 'verify', '假设', '证据', '必须成立', '成立'], reason: 'claim without evidence → ask consequential assumptions/evidence' },
  { id: 'AI-007', stage: 'Q8', answer: 'We will launch an AI pilot and review it next quarter.', keywords: ['continue', 'adjust', 'pause', 'stop', 'threshold', 'evidence', 'result', 'what would', 'criterion', '继续', '调整', '暂停', '停止', '阈值', '什么结果'], reason: 'action without decision threshold → ask continue/adjust/pause/stop condition' },
];

async function main() {
  const env = loadEnv();
  if (env.LLM_MODE !== 'live' && !env.DEEPSEEK_API_KEY) {
    console.error('eval:followups requires LLM_MODE=live with DEEPSEEK_API_KEY');
    process.exit(1);
  }
  const llm = createLlmProvider(env);
  const results: unknown[] = [];
  for (const sc of SCENARIOS) {
    const stageKey = sc.stage as keyof typeof STAGE_CONTENT;
    const ctx = {
      language: 'en' as const,
      stage: sc.stage,
      questionText: STAGE_CONTENT[stageKey].question.en,
      answer: sc.answer,
      lens: 'business',
      industry: 'other',
      followupCountUsed: 0,
      followupsThisStage: 0,
      previousExtracted: [],
    };
    let record: Record<string, unknown> = { scenario: sc.id, stage: sc.stage, expectedReason: sc.reason };
    try {
      const a = await llm.assess(ctx);
      const fu = a.followup_question ?? '';
      const matched = sc.keywords.some((k) => fu.toLowerCase().includes(k.toLowerCase()));
      const hasNumber = /[0-9%]/.test(fu);
      record = {
        ...record,
        quality: a.answer_quality,
        needsFollowup: a.needs_followup,
        followup: fu,
        targetedMatch: matched,
        isSingleQuestion: (fu.match(/\?/g) ?? []).length <= 1,
        passes: a.needs_followup && fu.length > 10 && matched && !/[0-9%]/.test(fu.slice(0, 60)),
      };
      console.log(`[${sc.id}] needs_followup=${a.needs_followup} targeted=${matched} q=${a.answer_quality}`);
      console.log('   FU:', (fu || '(none)').slice(0, 220));
    } catch (err) {
      record.error = err instanceof Error ? err.message.slice(0, 200) : String(err);
    }
    results.push(record);
  }
  const dir = 'test-evidence/ai-evaluations/followups';
  mkdirSync(dir, { recursive: true });
  const file = `${dir}/followups-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(file, JSON.stringify({ provider: llm.meta.provider, results }, null, 2));
  console.log(`Written: ${file}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
