import { describe, expect, it } from 'vitest';
import { buildReportEmail } from '../../src/email/types';

describe('transactional report email content (FR-024, EMAIL-001/002)', () => {
  it('includes thesis, secure report link, expiry and deletion link; no raw answer content', () => {
    const { subject, text, html } = buildReportEmail({
      to: 'owner@example.com',
      firstName: 'Craig',
      language: 'en',
      thesis: 'Resolve the customer-data choice with one shared foundation.',
      reportUrl: 'https://example.test/report/TOKEN123',
      deleteUrl: 'https://example.test/delete/TOKEN123',
      expiryDateIso: '2026-12-08T00:00:00.000Z',
    });
    expect(subject).toContain('2027 Strategy Brief');
    expect(text).toContain('Craig');
    expect(text).toContain('Resolve the customer-data choice');
    expect(text).toContain('https://example.test/report/TOKEN123');
    expect(text).toContain('https://example.test/delete/TOKEN123');
    expect(text.toLowerCase()).toContain('expires');
    expect(text).not.toContain('Fragmented ownership'); // no raw answers
    expect(html).toContain('report/TOKEN123');
  });

  it('does not promote a newsletter when consent is absent', () => {
    const { text } = buildReportEmail({
      to: 'a@example.com',
      language: 'en',
      thesis: 'thesis',
      reportUrl: 'https://x/report/T',
      deleteUrl: 'https://x/delete/T',
      expiryDateIso: '2026-12-08T00:00:00.000Z',
    });
    // mentions newsletter only to say it is separate — no signup call-to-action
    expect(text).not.toMatch(/subscribe|enrol now|sign up|click here to subscribe/i);
  });
});
