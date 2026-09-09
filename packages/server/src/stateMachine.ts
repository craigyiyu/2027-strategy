/**
 * Server-owned interview state machine (PRD §11). Pure functions — no I/O.
 *
 * Semantics:
 * - session.current_stage  = the core stage currently presented (Q1 at start).
 * - session.core_stage     = number of core stages completed (0..8).
 * - Completing a stage = its core answer (when no follow-up is granted) OR its
 *   follow-up answer OR an explicit skip. A follow-up keeps the user on the
 *   same stage; it never double-counts.
 * - After the 8th stage the machine sets status reflection_ready.
 *
 * The model may only *recommend* a follow-up; the machine enforces one per
 * stage, four per session, eight stages max (FR-005/006).
 */
import { CORE_STAGES } from '@2027strategy/shared';
import type { CoreStageId, QualityLabel } from '@2027strategy/shared';

export const MAX_CORE = CORE_STAGES.length; // 8
export const MAX_FOLLOWUPS_PER_SESSION = 4;
export const MAX_FOLLOWUPS_PER_STAGE = 1;
export const MIN_SUBSTANTIVE_FOR_REFLECTION = 5;
export const FIRST_STAGE: CoreStageId = 'Q1';

export interface InterviewContext {
  coreStage: number; // 0..8 completed
  followupCount: number; // 0..4 used in session
  currentStageId: CoreStageId | null; // stage presented; null when complete
  followupsThisStage: number; // 0/1 for the current stage
  substantiveCoreCount: number;
  reflectionState: 'none' | 'ready' | 'confirmed';
  hasActiveReport: boolean;
}

export function stageIndexOf(stage: CoreStageId): number {
  const i = CORE_STAGES.indexOf(stage);
  if (i === -1) throw new Error(`Unknown core stage ${stage}`);
  return i;
}

export function coreStageIdByIndex(idx: number): CoreStageId | null {
  return CORE_STAGES[idx] ?? null;
}

export function nextStageAfter(stage: CoreStageId): CoreStageId | null {
  return CORE_STAGES[stageIndexOf(stage) + 1] ?? null;
}

/** Heuristic pre-assessment quality label (deterministic fallback + pre-checks). */
export function qualityOfAnswer(answer: string, stage: CoreStageId): Exclude<QualityLabel, 'skipped'> {
  const text = (answer ?? '').trim();
  if (!text) return 'vague';
  const words = text.split(/\s+/).length;
  if (words < 6) return 'vague';
  if (
    stage === 'Q3' &&
    /(launch|implement|roll\s?out|上线|实施|推出)/i.test(text) &&
    !/[0-9%]/.test(text)
  ) {
    return 'activity_not_outcome';
  }
  if (stage === 'Q5' && /(top|priority|优先|all)/i.test(text)) {
    const separators = (text.match(/[、,;；]\s*/g) ?? []).length;
    const ands = (text.match(/\b(and|和)\b/gi) ?? []).length;
    const numbered = (text.match(/\b\d+[.)、,]/g) ?? []).length;
    if (separators + ands >= 4 || numbered >= 4) {
      return 'too_many_priorities';
    }
  }
  if (
    stage === 'Q6' &&
    /(option|方案|approach)/i.test(text) &&
    !/(trade|give up|放弃|取舍|not do|不做)/i.test(text)
  ) {
    return 'missing_tradeoff';
  }
  return 'sufficient';
}

export type SubmitOutcome =
  | { type: 'followup'; context: InterviewContext; followupQuestion: string }
  | { type: 'advance'; context: InterviewContext };

/** Advance past the current stage: +1 completed, move to next stage or finish. */
function advancePast(ctx: InterviewContext): InterviewContext {
  const newCore = ctx.coreStage + 1;
  if (ctx.currentStageId === null || newCore >= MAX_CORE) {
    return {
      ...ctx,
      coreStage: Math.min(newCore, MAX_CORE),
      currentStageId: null,
      followupsThisStage: 0,
      reflectionState: 'ready',
    };
  }
  return {
    ...ctx,
    coreStage: newCore,
    currentStageId: nextStageAfter(ctx.currentStageId),
    followupsThisStage: 0,
  };
}

/**
 * Decision after a core answer. (a) quality gap + budget → one follow-up
 * (coreStage NOT yet incremented; the stage completes when the follow-up is
 * answered or skipped). (b) otherwise advance.
 */
export function decideAfterCoreAnswer(
  ctx: InterviewContext,
  modelNeedsFollowup: boolean,
  followupQuestion: string | null,
): SubmitOutcome {
  const canFollowUp =
    ctx.currentStageId !== null &&
    modelNeedsFollowup &&
    followupQuestion !== null &&
    ctx.followupsThisStage < MAX_FOLLOWUPS_PER_STAGE &&
    ctx.followupCount < MAX_FOLLOWUPS_PER_SESSION;
  if (canFollowUp) {
    return {
      type: 'followup',
      followupQuestion: followupQuestion!,
      context: {
        ...ctx,
        followupCount: ctx.followupCount + 1,
        followupsThisStage: ctx.followupsThisStage + 1,
      },
    };
  }
  return { type: 'advance', context: advancePast(ctx) };
}

/** After a follow-up answer: the stage is complete → advance (no 2nd follow-up). */
export function decideAfterFollowupAnswer(ctx: InterviewContext): SubmitOutcome {
  return { type: 'advance', context: advancePast(ctx) };
}

/** Skip a core stage: recorded unknown; no AI call; advance. */
export function decideAfterSkip(ctx: InterviewContext): SubmitOutcome {
  return { type: 'advance', context: advancePast(ctx) };
}

export function canGenerateReflection(
  ctx: Pick<InterviewContext, 'coreStage' | 'substantiveCoreCount'>,
): boolean {
  return ctx.coreStage >= MAX_CORE && ctx.substantiveCoreCount >= MIN_SUBSTANTIVE_FOR_REFLECTION;
}

export function newContextFromSession(input: {
  coreStage: number;
  followupCount: number;
  currentStageId: string | null;
  followupUsedForStage: boolean;
  substantiveCoreCount: number;
  reflectionState: InterviewContext['reflectionState'];
  hasActiveReport: boolean;
}): InterviewContext {
  return {
    coreStage: input.coreStage,
    followupCount: input.followupCount,
    currentStageId: input.currentStageId === null ? FIRST_STAGE : (input.currentStageId as CoreStageId),
    followupsThisStage: input.followupUsedForStage ? 1 : 0,
    substantiveCoreCount: input.substantiveCoreCount,
    reflectionState: input.reflectionState,
    hasActiveReport: input.hasActiveReport,
  };
}
