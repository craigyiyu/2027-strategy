import { describe, expect, it } from 'vitest';
import * as sm from '../../src/stateMachine';
import {
  MAX_CORE,
  MAX_FOLLOWUPS_PER_SESSION,
  MAX_FOLLOWUPS_PER_STAGE,
} from '../../src/stateMachine';

function base(): sm.InterviewContext {
  return {
    coreStage: 0,
    followupCount: 0,
    currentStageId: 'Q1',
    followupsThisStage: 0,
    substantiveCoreCount: 0,
    reflectionState: 'none',
    hasActiveReport: false,
  };
}

describe('state machine: eight core stages', () => {
  it('advances Q1..Q8 and reaches reflection_ready only after Q8', () => {
    let ctx = base();
    for (let i = 1; i <= 8; i++) {
      const outcome = sm.decideAfterCoreAnswer(ctx, false, null);
      expect(outcome.type).toBe('advance');
      ctx = outcome.context;
      if (i < 8) {
        expect(ctx.currentStageId).toBe(`Q${i + 1}`);
        expect(ctx.coreStage).toBe(i);
      }
    }
    expect(ctx.currentStageId).toBeNull();
    expect(ctx.coreStage).toBe(MAX_CORE);
    expect(ctx.reflectionState).toBe('ready');
  });
});

describe('state machine: follow-up budgets (FR-006)', () => {
  it('grants at most one follow-up per stage', () => {
    let ctx = base(); // on Q1
    const first = sm.decideAfterCoreAnswer(ctx, true, 'Who owns the decision?');
    expect(first.type).toBe('followup');
    ctx = (first as Extract<typeof first, { type: 'followup' }>).context;
    expect(ctx.followupsThisStage).toBe(1);
    // second follow-up on same stage is refused -> advance
    const second = sm.decideAfterCoreAnswer(ctx, true, 'Another question?');
    expect(second.type).toBe('advance');
    expect(second.context.coreStage).toBe(1);
  });

  it('grants at most four follow-ups across a session', () => {
    let ctx = base();
    let followups = 0;
    let answered = 0;
    // ask a follow-up at stages 1..8
    for (let s = 1; s <= 8 && answered < 8; s++) {
      const o1 = sm.decideAfterCoreAnswer(ctx, true, `Follow-up ${s}`);
      if (o1.type === 'followup') {
        followups++;
        const after = sm.decideAfterFollowupAnswer(o1.context);
        ctx = after.context;
        answered = ctx.coreStage;
      } else {
        ctx = o1.context;
        answered = ctx.coreStage;
      }
    }
    expect(followups).toBeLessThanOrEqual(MAX_FOLLOWUPS_PER_SESSION);
    expect(followups).toBeLessThanOrEqual(8);
    expect(answered).toBe(MAX_CORE);
  });

  it('never grants a follow-up when per-stage budget exhausted', () => {
    const ctx = { ...base(), followupsThisStage: MAX_FOLLOWUPS_PER_STAGE };
    const o = sm.decideAfterCoreAnswer(ctx, true, 'again?');
    expect(o.type).toBe('advance');
  });

  it('never grants a follow-up when session budget exhausted', () => {
    const ctx = { ...base(), followupCount: MAX_FOLLOWUPS_PER_SESSION };
    const o = sm.decideAfterCoreAnswer(ctx, true, 'again?');
    expect(o.type).toBe('advance');
  });
});

describe('state machine: skip semantics', () => {
  it('skip advances and counts toward completion', () => {
    let ctx = base();
    for (let i = 1; i <= 8; i++) {
      const o = sm.decideAfterSkip(ctx);
      expect(o.type).toBe('advance');
      ctx = o.context;
    }
    expect(ctx.coreStage).toBe(MAX_CORE);
    expect(ctx.reflectionState).toBe('ready');
  });
});

describe('qualityOfAnswer heuristics', () => {
  it('flags activity-only Q3 answers', () => {
    expect(sm.qualityOfAnswer('Our success will be to implement AI this year.', 'Q3')).toBe(
      'activity_not_outcome',
    );
  });
  it('flags too-many-priorities Q5 answers', () => {
    expect(
      sm.qualityOfAnswer('All of AI, customers, talent, growth, digital and culture are top priority 2027 items for us all.', 'Q5'),
    ).toBe('too_many_priorities');
  });
  it('passes sufficiently specific answers', () => {
    expect(
      sm.qualityOfAnswer('By Q4 2027, two journey pilots reach 80% consented identity coverage with named owners.', 'Q3'),
    ).toBe('sufficient');
  });
});

describe('reflection gating (AI-017)', () => {
  it('requires all 8 stages + 5 substantive', () => {
    expect(
      sm.canGenerateReflection({ coreStage: 7, substantiveCoreCount: 7 }),
    ).toBe(false);
    expect(
      sm.canGenerateReflection({ coreStage: 8, substantiveCoreCount: 4 }),
    ).toBe(false);
    expect(
      sm.canGenerateReflection({ coreStage: 8, substantiveCoreCount: 5 }),
    ).toBe(true);
  });
});
