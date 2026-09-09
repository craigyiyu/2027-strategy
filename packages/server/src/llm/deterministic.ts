/**
 * Deterministic, no-key synthesizer — a fully offline provider that produces
 * schema-valid outputs from user content WITHOUT an LLM. Used when
 * LLM_MODE=deterministic (privacy-first default) and as the fallback when the
 * live model is unavailable. It never invents facts: anything synthesized
 * beyond the user's own words is labelled needs_validation or ai_inference
 * with an explicit note.
 */
import { CORE_STAGE_ORDER, STAGE_CONTENT } from '@2027strategy/shared';
import type { AssessAnswerOutput, ReflectionOutput, ReportOutput } from '@2027strategy/shared';
import { qualityOfAnswer } from '../stateMachine';
import type { AssessContext, ReflectContext, ReportContext } from './types';

const FOLLOWUP_BANK: Record<string, { en: string; 'zh-CN': string }> = {
  Q1: {
    en: 'You named a decision area — who owns the final decision, and by when must it be made?',
    'zh-CN': '你提到了要做的决定——最终由谁拍板，最迟什么时候必须作出？',
  },
  Q2: {
    en: 'Which parts of what you described are facts you can verify, and which are your judgment?',
    'zh-CN': '你刚才说的内容里，哪些是可核实的事实，哪些是你的判断？',
  },
  Q3: {
    en: 'What observable result would show real progress by the end of 2027 — not an activity like launching or implementing?',
    'zh-CN': '到 2027 年底，什么可观察的结果才算实质进展——而不是「上线」「实施」这类活动？',
  },
  Q4: {
    en: 'What mechanism do you believe is creating that problem, and what alternative explanation could also be true?',
    'zh-CN': '你认为是什么机制造成了这个问题？还有哪些替代解释也可能成立？',
  },
  Q5: {
    en: 'If resources do not increase, which single obstacle comes first — and what important work will you deliberately not do now?',
    'zh-CN': '如果资源不增加，哪个障碍放在第一位？你又会有意暂不处理哪件重要事项？',
  },
  Q6: {
    en: 'What you listed reads like different tasks. What genuinely different approaches — with different trade-offs — are you weighing?',
    'zh-CN': '你列出的看起来像不同任务。你真正在权衡的、取舍不同的方案是什么？',
  },
  Q7: {
    en: 'Which assumptions must be true for your preferred option to work, and what evidence do you have for each?',
    'zh-CN': '要让首选方案成立，哪些假设必须为真？每一条你现在有什么证据？',
  },
  Q8: {
    en: 'What result in the next 90 days would make you continue, adjust, pause or stop — and who owns the decision?',
    'zh-CN': '未来 90 天里，什么结果会让你继续、调整、暂停或停止？谁为此负责？',
  },
};

const NOTE_EN = 'Synthesized locally without a live model; treat as direction only and validate before use.';
const NOTE_ZH = '本地无模型合成，仅供方向参考，使用前请验证。';

export class DeterministicProvider {
  readonly meta = {
    modelId: 'deterministic-local',
    promptVersion: 'no-key-synthesizer-1.0',
    provider: 'deterministic',
  } as const;

  async assess(ctx: AssessContext): Promise<AssessAnswerOutput> {
    const q = qualityOfAnswer(ctx.answer, ctx.stage as never);
    const needsFollowup = q !== 'sufficient';
    const followup = needsFollowup
      ? FOLLOWUP_BANK[ctx.stage]?.[ctx.language] ?? 'Could you add one concrete detail?'
      : null;
    return {
      acknowledgment:
        ctx.language === 'zh-CN' ? '已收到，继续。' : 'Understood — noted.',
      answer_quality: q,
      needs_followup: needsFollowup,
      followup_question: followup,
      extracted_items: extractItems(ctx.answer, ctx.stage, ctx.language),
      sensitivity_flags: ['none'],
    };
  }

  async reflect(ctx: ReflectContext): Promise<ReflectionOutput> {
    const lang = ctx.language;
    const g = (en: string, zh: string) => (lang === 'zh-CN' ? zh : en);
    const get = (stage: string) =>
      ctx.answers.find((a) => a.stageId === stage)?.text ?? '';
    const facts = ctx.priorExtracted
      .filter((e) => e.type === 'user_fact')
      .map((e) => e.statement)
      .slice(0, 12);
    const assumptions = ctx.priorExtracted
      .filter((e) => e.type === 'user_assumption' || e.type === 'user_preference')
      .map((e) => e.statement)
      .slice(0, 12);
    const decision = get('Q1') || g('Decision not yet specified.', '尚未明确决定。');
    const q5 = get('Q5');
    return {
      decision,
      facts: facts.length ? facts : [g('No separable facts recorded yet.', '暂未记录可分离的事实。')],
      assumptions: assumptions.length
        ? assumptions
        : [g('No assumptions recorded yet.', '暂未记录假设。')],
      candidate_diagnoses: [
        {
          diagnosis: get('Q4') || g('Mechanism not yet specified.', '尚未说明机制。'),
          support: q5 ? [q5] : [],
          counter_evidence: [g('Needs validation — no counter-evidence supplied.', '待验证——未提供反证。')],
        },
      ],
      proposed_crux:
        q5.split(/[.;。；]/)[0] || g('Crux not yet specified.', '关键障碍尚未明确。'),
      conflicts: [g('Needs validation — check whether the outcome, causes and choices are consistent.', '待验证——请检查结果、原因与选择之间是否一致。')],
      missing_evidence: [g('Needs validation — validate facts, thresholds and owners before use.', '待验证——使用前请核实事实、阈值与负责人。')],
    };
  }

  async report(ctx: ReportContext): Promise<ReportOutput> {
    const lang = ctx.language;
    const g = (en: string, zh: string) => (lang === 'zh-CN' ? zh : en);
    const get = (stage: string) =>
      ctx.answers.find((a) => a.stageId === stage)?.text ?? '';
    const q = (stage: string) =>
      ctx.answers.find((a) => a.stageId === stage) ?? null;

    const priorities = splitBullets(get('Q5')).slice(0, 3);
    const alternatives = splitBullets(get('Q6')).slice(0, 3);
    const stopDeferText =
      get('Q5').split(/(?:deliberately not|stop|defer|暂缓|不做|停止)/i).pop() ||
      g('Explicit Stop / Defer decision required from the user.', '需要用户给出明确的停止/延后决定。');

    const out: ReportOutput = {
      schemaVersion: '1.0',
      language: lang,
      modelId: this.meta.modelId,
      promptVersion: this.meta.promptVersion,
      generatedAt: new Date().toISOString(),
      strategyThesis: trunc(get('Q3') || get('Q1'), 380) || g('Thesis pending — needs validation.', '主张待定——待验证。'),
      decisionBrief: {
        decision: stmt(get('Q1'), q('Q1')?.stageId ?? null, g('The decision to make.', '待作出的决定。')),
        scope: [stmt(get('Q3'), q('Q3')?.stageId ?? null, g('Target outcome.', '目标结果。'))],
        deadline: extractDeadline(get('Q1')) || g('Deadline not stated — confirm with owner.', '未说明时限——请与负责人确认。'),
        approver: extractOwner(get('Q1')) || g('Decision owner not stated.', '未说明决定负责人。'),
        hardConstraints: [stmt(get('Q2'), q('Q2')?.stageId ?? null, g('Context and constraints.', '背景与约束。'))],
      },
      evidenceBase: [
        ...ctx.reflection.facts.slice(0, 12).map((f) => ({
          text: f,
          label: 'user_fact' as const,
          sourceStage: null,
          sourceResponseId: null,
          note: null,
        })),
        ...ctx.reflection.assumptions.slice(0, 12).map((a) => ({
          text: a,
          label: 'user_assumption' as const,
          sourceStage: null,
          sourceResponseId: null,
          note: null,
        })),
        ...(ctx.reflection.missing_evidence.slice(0, 4).map((m) => ({
          text: m,
          label: 'needs_validation' as const,
          sourceStage: null,
          sourceResponseId: null,
          note: null,
        })) as ReportOutput['evidenceBase']),
      ],
      challengeDiagnosis: {
        symptoms: [stmt(get('Q4'), q('Q4')?.stageId ?? null, g('Stated symptom.', '所述症状。'))],
        candidateDiagnoses: [
          {
            diagnosis: trunc(get('Q4'), 600) || g('Candidate diagnosis pending.', '候选诊断待定。'),
            support: [],
            counter_evidence: [g('Needs validation.', '待验证。')],
          },
        ],
        confirmedDiagnosis: stmt(
          trunc(get('Q5'), 600) || g('Diagnosis pending confirmation.', '诊断待确认。'),
          q('Q5')?.stageId ?? null,
          g('Pivotal obstacle chosen by the user.', '用户选定的关键障碍。'),
        ),
      },
      crux: {
        cruxStatement: stmt(trunc(get('Q5'), 600), q('Q5')?.stageId ?? null, g('Chosen crux.', '选定的关键障碍。')),
        whyNow: [stmt(get('Q2'), q('Q2')?.stageId ?? null, g('Why this matters now.', '为何此刻重要。'))],
        alternativesConsidered: [g('See strategic alternatives section.', '见战略备选方案章节。')],
      },
      strategicAlternatives: alternatives.length >= 2
        ? alternatives.slice(0, 4).map((a) => ({
            name: trunc(a, 110),
            guidingPolicy: trunc(a, 400),
            whereToPlay: g('Needs validation — where-to-play not extracted.', '待验证——未提取「在哪里参与」。'),
            howToWin: g('Needs validation — how-to-win not extracted.', '待验证——未提取「如何取胜」。'),
            tradeoffs: [stmt(g('Trade-off needs validation.', '取舍待验证。'), null, null)],
          }))
        : [
            ...(alternatives.length === 1
              ? [
                  {
                    name: trunc(alternatives[0]!, 110),
                    guidingPolicy: trunc(alternatives[0]!, 400),
                    whereToPlay: g('Needs validation — where-to-play not extracted.', '待验证——未提取「在哪里参与」。'),
                    howToWin: g('Needs validation — how-to-win not extracted.', '待验证——未提取「如何取胜」。'),
                    tradeoffs: [stmt(g('Trade-off needs validation.', '取舍待验证。'), null, null)],
                  },
                ]
              : []),
            {
              name: g('Alternative A', '方案 A'),
              guidingPolicy: get('Q6') || g('Needs validation.', '待验证。'),
              whereToPlay: g('Needs validation.', '待验证。'),
              howToWin: g('Needs validation.', '待验证。'),
              tradeoffs: [stmt(g('Trade-off needs validation.', '取舍待验证。'), null, null)],
            },
            {
              name: g('Alternative B', '方案 B'),
              guidingPolicy: g('Needs validation — a second, genuinely different approach is required.', '待验证——需要第二条真正不同的路径。'),
              whereToPlay: g('Needs validation.', '待验证。'),
              howToWin: g('Needs validation.', '待验证。'),
              tradeoffs: [stmt(g('Trade-off needs validation.', '取舍待验证。'), null, null)],
            },
          ],
      choiceContract: {
        winningAspiration: stmt(trunc(get('Q3'), 500), q('Q3')?.stageId ?? null, g('Winning aspiration.', '取胜抱负。')),
        whereToPlay: stmt(get('Q5'), q('Q5')?.stageId ?? null, g('Where to play.', '在哪里参与。')),
        howToWin: stmt(get('Q7'), q('Q7')?.stageId ?? null, g('How to win.', '如何取胜。')),
        requiredCapabilities: [stmt(get('Q7'), q('Q7')?.stageId ?? null, g('Required capabilities.', '必备能力。'))],
        managementSystems: [stmt(g('Needs validation — management systems not described.', '待验证——未描述管理系统。'), null, null)],
      },
      assumptionRegister: [
        {
          assumption: trunc(get('Q7'), 500) || g('Assumptions pending.', '假设待定。'),
          label: 'needs_validation',
          sourceResponseId: q('Q7')?.stageId ?? null,
          sourceStage: q('Q7')?.stageId ?? null,
          importance: 'critical',
          evidenceState: 'unvalidated',
        },
      ],
      reverseEconomics: {
        mustBeTrueForValue: [g('Needs validation — define the business result that must hold.', '待验证——请定义必须成立的业务结果。')],
        mustBeTrueForCost: [g('Needs validation — define the cost structure that must hold.', '待验证——请定义必须成立的成本结构。')],
        statements: [],
      },
      evidenceGates: [
        {
          owner: extractOwner(get('Q8')) || g('Owner not stated.', '未说明负责人。'),
          test: trunc(get('Q8'), 500) || g('90-day test pending.', '90 天验证待定。'),
          threshold: g('Needs validation — define the decision threshold.', '待验证——请定义决定阈值。'),
          reviewDate: extractDeadline(get('Q8')) || g('Review date not stated.', '未说明复盘日期。'),
          decisionRule: 'adjust',
          measure: g('Needs validation — define the measure.', '待验证——请定义衡量指标。'),
        },
      ],
      actionPortfolio: priorities.map((p, i) => ({
        action: p,
        owner: extractOwner(get('Q8')) || g('Owner not stated.', '未说明负责人。'),
        milestone: g('First 90-day milestone.', '首个 90 天里程碑。'),
        supportsPriority: g(`Priority ${i + 1}.`, `优先事项 ${i + 1}。`),
      })),
      stopDefer: [stmt(stopDeferText.trim() || g('No exclusion stated — user must decide what will not be done.', '未说明排除项——用户须决定本轮不做什么。'), q('Q5')?.stageId ?? null, g('Stop / Defer.', '停止 / 延后。'))],
      executionMeasures: [
        {
          measure: g('Outcome measure from Q3.', '来自 Q3 的结果指标。'),
          kind: 'outcome',
          dataSource: g('Needs validation — name the data source.', '待验证——请指明数据来源。'),
          owner: extractOwner(get('Q8')) || g('Owner not stated.', '未说明负责人。'),
          cadence: g('Monthly review.', '每月复盘。'),
        },
      ],
      riskReviews: [
        {
          risk: g('Regulatory / privacy / security / capital review required if the plan touches guest data, cyber resilience or major capital commitments.', '若方案涉及宾客数据、网络安全韧性或重大资本投入，须进行监管/隐私/安全/资本评审。'),
          area: 'regulatory',
          requiresHumanApproval: true,
          reviewOwner: g('Named human owner required.', '需要具名负责人。'),
          label: 'needs_validation',
          sourceStage: null,
          sourceResponseId: null,
        },
      ],
      decisionRecord: {
        confirmedDecision: stmt(trunc(get('Q1'), 500), q('Q1')?.stageId ?? null, g('Decision under review.', '评审中的决定。')),
        pendingOwnerDecisions: [g('Confirm the decision, owner and Stop / Defer list.', '请确认决定、负责人与停止/延后清单。')],
        revisitTriggers: [g('Revisit when 90-day evidence arrives or assumptions change.', '当 90 天证据出现或假设变化时重审。')],
        reviewCadence: g('Monthly during the first quarter.', '首个季度每月复盘。'),
        approvedBy: [],
      },
      readinessSnapshot: [
        { dimension: 'diagnosis_clarity', level: get('Q4') ? 'amber' : 'red', explanation: g('Based on the stated diagnosis; validate mechanisms.', '基于所述诊断；请验证机制。') },
        { dimension: 'choice_clarity', level: priorities.length > 0 && priorities.length <= 3 ? 'amber' : 'red', explanation: g('Priorities limited to three; trade-offs need validation.', '优先事项已限制为三项以内；取舍待验证。') },
        { dimension: 'evidence_readiness', level: 'red', explanation: g('No external evidence supplied; assumptions unvalidated.', '未提供外部证据；假设未验证。') },
        { dimension: 'execution_ownership', level: extractOwner(get('Q8')) ? 'amber' : 'red', explanation: g('Owner present only if stated by the user.', '仅当用户说明负责人时才算具备。') },
        { dimension: 'risk_governance', level: 'amber', explanation: g('Human review is required for high-impact areas.', '高影响领域需要人工评审。') },
      ],
      limitations: [
        g('Generated in no-key deterministic mode.', '在无密钥的本地模式下生成。'),
        NOTE_EN,
        NOTE_ZH,
      ],
      stopDeferExplicit: true,
      preview: undefined,
    };
    // localize English default notes for zh-CN output (LOC-001)
    if (lang === 'zh-CN') {
      const fix = (o: unknown): void => {
        if (Array.isArray(o)) { o.forEach(fix); return; }
        if (o && typeof o === 'object') {
          const rec = o as Record<string, unknown>;
          if (typeof rec.note === 'string') {
            if (rec.note === 'Needs validation.') rec.note = '待验证。';
            else if (rec.note === 'AI inference — needs validation') rec.note = 'AI 推断——待验证。';
          }
          for (const k of Object.keys(rec)) fix(rec[k]);
        }
      };
      fix(out);
    }
    return out;
  }
}

/* ---------- helpers ---------- */

function stmt(
  text: string,
  sourceStage: string | null,
  note: string | null,
): ReportOutput['decisionBrief']['decision'] {
  return {
    text: trunc(text.trim(), 1900) || '—',
    label: sourceStage ? 'user_fact' : 'needs_validation',
    sourceResponseId: sourceStage,
    sourceStage,
    note: note ?? (sourceStage ? null : 'Needs validation.'),
  };
}

function splitBullets(text: string): string[] {
  return text
    .split(/\n|;|。|；|\.\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8)
    .slice(0, 6);
}

function trunc(s: string, n: number): string {
  if (!s) return '';
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function extractOwner(text: string): string | null {
  const m = text.match(/(?:owned by|owner[:：]?|负责人[:：]?)\s*([^,.;。]{2,60})/i);
  return m?.[1]?.trim() ?? null;
}

function extractDeadline(text: string): string | null {
  const m = text.match(/(?:by|due|before|截至|于|在|前)\s*([^,.;。]*?(?:october|november|december|january|月|日|q4|q1|2027|end of|月底|年底)[^,.;。]*)/i);
  return m?.[1]?.trim() ?? null;
}

function extractItems(
  answer: string,
  stage: string,
  language: string,
): AssessAnswerOutput['extracted_items'] {
  const facts = answer.match(/(?:fact|事实)[:：]\s*([^.。]{4,})/i)?.[1];
  const judgments = answer.match(/(?:judgment|判断|believe|认为|view)[:：]?\s*([^.。]{4,})/i)?.[1];
  const out: AssessAnswerOutput['extracted_items'] = [];
  if (facts) out.push({ statement: facts.trim(), type: 'user_fact', source_stage: stage, needs_validation: false });
  if (judgments) out.push({ statement: judgments.trim(), type: 'user_assumption', source_stage: stage, needs_validation: true });
  // whole answer as preference/constraint fallback for later stages
  if (!out.length) {
    out.push({ statement: trunc(answer.trim(), 1200), type: 'user_preference', source_stage: stage, needs_validation: false });
  }
  return out.slice(0, 24);
}
