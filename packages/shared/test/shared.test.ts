import { describe, expect, it } from 'vitest';
import { scanSensitive } from '../src/sensitive';
import { PERSONA_F_SENSITIVE } from '../src/fixtures';
import { assessAnswerOutput, sessionCreateInput } from '../src/schemas';
import { CORE_STAGE_ORDER, STAGE_CONTENT } from '../src/questions';

describe('sensitive scanner (SEC-001..003, Persona F)', () => {
  it('hard-blocks synthetic API keys', () => {
    const r = scanSensitive(PERSONA_F_SENSITIVE.apiToken);
    expect(r.state).toBe('blocked');
    expect(r.category).toBe('credential');
  });

  it('hard-blocks password-like strings', () => {
    const r = scanSensitive(`login with ${PERSONA_F_SENSITIVE.password}`);
    expect(r.state).toBe('blocked');
  });

  it('warns on synthetic passport/guest records', () => {
    const r = scanSensitive(PERSONA_F_SENSITIVE.guestRecord);
    expect(r.state).toBe('warning');
    expect(r.category).toBe('personal_data');
  });

  it('warns on exploitable security detail', () => {
    const r = scanSensitive(PERSONA_F_SENSITIVE.securityDetail);
    expect(r.state).toBe('warning');
    expect(r.category).toBe('security_detail');
  });

  it('passes clean executive text', () => {
    const r = scanSensitive(
      'We should decide our 2027 data-platform priority by end of October.',
    );
    expect(r.state).toBe('clear');
    expect(r.category).toBe('none');
  });
});

describe('schema contracts', () => {
  it('accepts a valid session-create input and rejects identity-requiring input', () => {
    const ok = sessionCreateInput.safeParse({
      language: 'en',
      lens: 'technology',
      roleBand: 'c_suite',
      industryBand: 'integrated_resort_hospitality',
      privacyMode: 'private',
    });
    expect(ok.success).toBe(true);
    const bad = sessionCreateInput.safeParse({
      language: 'fr',
      lens: 'technology',
      roleBand: 'c_suite',
      industryBand: 'integrated_resort_hospitality',
      privacyMode: 'private',
    });
    expect(bad.success).toBe(false);
  });

  it('requires followup_question null when needs_followup false', () => {
    const ok = assessAnswerOutput.safeParse({
      acknowledgment: 'Understood.',
      answer_quality: 'sufficient',
      needs_followup: false,
      followup_question: null,
      extracted_items: [],
      sensitivity_flags: ['none'],
    });
    expect(ok.success).toBe(true);
    const bad = assessAnswerOutput.safeParse({
      acknowledgment: 'Understood.',
      answer_quality: 'sufficient',
      needs_followup: false,
      followup_question: 'Any question at all?',
      extracted_items: [],
      sensitivity_flags: ['none'],
    });
    expect(bad.success).toBe(false);
  });
});

describe('stage content integrity', () => {
  it('has exactly eight core stages with bilingual copy and lens hints', () => {
    expect(CORE_STAGE_ORDER).toHaveLength(8);
    for (const id of CORE_STAGE_ORDER) {
      const s = STAGE_CONTENT[id];
      expect(s).toBeDefined();
      expect(s.question.en.length).toBeGreaterThan(10);
      expect(s.question['zh-CN'].length).toBeGreaterThan(5);
      expect(s.lensHint.technology.en.length).toBeGreaterThan(0);
      expect(s.lensHint.leadership['zh-CN'].length).toBeGreaterThan(0);
    }
  });
});
