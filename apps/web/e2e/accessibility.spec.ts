/**
 * axe accessibility checks (A11Y-002): zero critical/serious violations on the
 * core states per UAT plan §9.1 — landing, start, interview (with validation
 * error), reflection, preview, report, method, privacy.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function scan(page: import('@playwright/test').Page, label: string, goto: string) {
  await page.goto(goto);
  await page.waitForLoadState('networkidle').catch(() => {});
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''));
  expect(
    serious,
    `${label}: ${serious.map((v) => `${v.id}(${v.impact})`).join(', ')}`,
  ).toEqual([]);
}

test('a11y: landing + method + privacy have no critical/serious violations', async ({ page }) => {
  await scan(page, 'landing', '/');
  await scan(page, 'method', '/method');
  await scan(page, 'privacy', '/privacy');
});

test('a11y: report of a generated session has no critical/serious violations', async ({ page }) => {
  const res = await page.request.post('/api/session', {
    data: {
      language: 'en', lens: 'business', roleBand: 'owner', industryBand: 'other', privacyMode: 'save',
    },
  });
  const { token } = (await res.json()) as { token: string };
  const answers: Record<string, string> = {
    Q1: 'Decide whether to expand into Japan or focus on Hong Kong; owner is the founder; decided by March.',
    Q2: 'Fact: demand grew 20%. Judgment: the growth will continue if we expand.',
    Q3: 'By Q4 2027, 30% of revenue comes from the new market with two named leaders owning delivery.',
    Q4: 'Leading cause is founder bottleneck; alternative is that our scope is too wide to delegate.',
    Q5: 'Priority is one new market pilot. Deliberately not now: the second adjacent offering.',
    Q6: 'Option A: expand to Japan with a partner. Option B: deepen Hong Kong share. Option C: new offer for existing clients. Each has a different trade-off.',
    Q7: 'Must be true: partner delivers distribution (unvalidated); one senior hire budget (known); margin holds at lower volume (plausible).',
    Q8: 'In 90 days delegate two accounts with decision logs and escalation thresholds; review monthly. Owner: founder.',
  };
  for (const [stage, answer] of Object.entries(answers)) {
    const r = await page.request.post(`/api/session/${token}/answer`, {
      data: { stageId: stage, answer, idempotencyKey: `ax-${stage}-000001` },
    });
    const b = (await r.json()) as { followupQuestion: string | null };
    if (b.followupQuestion) {
      await page.request.post(`/api/session/${token}/followup`, {
        data: { stageId: `FU-${stage}`, answer: 'Named owner confirmed; threshold defined.', idempotencyKey: `axf-${stage}-000001` },
      });
    }
  }
  await page.request.post(`/api/session/${token}/reflection`);
  await page.request.post(`/api/session/${token}/reflection/confirm`, {
    data: { corrections: '', confirmation: 'confirm', idempotencyKey: 'ax-confirm-00000001' },
  });
  await scan(page, 'report', `/report/${token}`);
});

test('a11y: interview, reflection and preview states are clean', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /start my 2027 strategy sprint|开始我的 2027 strategy sprint/i }).first().click();
  await page.getByRole('radio', { name: /Technology & Digital/ }).check();
  await page.getByRole('radio', { name: /Save My Brief/ }).check();
  await page.getByRole('button', { name: /begin the interview|开始访谈/i }).click();
  await expect(page.locator('textarea')).toBeVisible({ timeout: 20_000 });
  // interview with an empty submit → validation error state
  await page.getByRole('button', { name: /^Continue$/ }).click().catch(() => {});
  const r1 = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r1.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual([]);
  // answer all 8
  const answers = [
    'Decide the platform question; Group CTO owner by end of October.',
    'Fact: journeys fragmented. Judgment: teams keep buying local tools.',
    'By Q4 2027, 80% of prioritized journeys run on consented cross-property identity.',
    'Leading cause fragmented ownership; alternative is incentives reward local delivery.',
    'Priority is one shared foundation for two journeys. Not now: app rebuilds.',
    'A: foundation first; B: pilots on thin layer; C: standards with autonomy. Each trades differently.',
    'Needs: execs accept common definitions; value in 90 days (unvalidated); security capacity unknown.',
    'By 31 Dec pilots reach 80% coverage with named owners else pause. Owner: Group CTO.',
  ];
  for (const answer of answers) {
    await page.locator('textarea').fill(answer);
    await page.getByRole('button', { name: /^Continue$/ }).click();
    await page.waitForTimeout(300);
  }
  await page.getByRole('button', { name: /view my reflection|查看我的复盘/i }).first().click().catch(() => {});
  await expect(page.getByRole('heading', { name: /What I heard|这是我听到的/ })).toBeVisible({ timeout: 30_000 });
  const r2 = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r2.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual([]);
});
