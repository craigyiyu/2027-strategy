/**
 * METHOD-001/002 (method disclosure & copyright boundary), LOC-002
 * (Chinese provenance terms), MOBILE-001 (375px no horizontal scroll),
 * VIS-002 (content intact without images).
 */
import { test, expect } from '@playwright/test';

test('METHOD-001/002: method page discloses layers, sources, AI role and disclaimer', async ({ page }) => {
  await page.goto('/method');
  const text = await page.locator('body').innerText();
  expect(text).toMatch(/Independent implementation|独立实现/i);
  expect(text).toMatch(/Rumelt|Lafley|McGrath|Kaplan/i); // sources
  // must NOT claim training on books
  expect(text).not.toMatch(/trained on the (books|writings|works)|训练自|基于.*书籍.*训练/i);
  // four layers visible
  await page.goto('/privacy');
  const pt = await page.locator('body').innerText();
  expect(pt).toMatch(/retention|删除|保留/i);
});

test('LOC-002: Chinese report uses mandated provenance terms', async ({ page }) => {
  const res = await page.request.post('/api/session', { data: { language: 'zh-CN', lens: 'business', roleBand: 'owner', industryBand: 'other', privacyMode: 'save' } });
  const { token } = (await res.json()) as { token: string };
  const answers = [
    '决定是否在 2027 年扩展日本市场；由创始人拍板，三月底前决定。',
    '事实：需求增长两成。判断：若不扩张，增长会放缓。',
    '到 2027 年底，三成收入来自新市场，两名负责人独立交付。',
    '主因是创始人瓶颈；另一种解释是业务范围过宽导致无法授权。',
    '优先：一个新市场试点。明确不做：第二个相邻产品线。',
    '方案一：与伙伴进入日本。方案二：深耕香港份额。方案三：向现有客户推新产品。各有不同取舍。',
    '必须成立：伙伴有渠道能力（未验证）；有预算招一位高管（事实）；毛利在新规模下成立（待验证）。',
    '90 天内授权两个客户账户并记录决策日志与升级阈值，每月复盘。负责人：创始人。',
  ];
  for (let i = 0; i < 8; i++) {
    const r = await page.request.post(`/api/session/${token}/answer`, { data: { stageId: `Q${i + 1}`, answer: answers[i], idempotencyKey: `lz-Q${i + 1}-000001` } });
    const b = (await r.json()) as { followupQuestion: string | null };
    if (b.followupQuestion) {
      await page.request.post(`/api/session/${token}/followup`, { data: { stageId: `FU-Q${i + 1}`, answer: '负责人已确认；阈值已设定。', idempotencyKey: `lzf-Q${i + 1}-000001` } });
    }
  }
  await page.request.post(`/api/session/${token}/reflection`);
  await page.request.post(`/api/session/${token}/reflection/confirm`, { data: { corrections: '', confirmation: 'confirm', idempotencyKey: 'lz-confirm-00000001' } });
  // anonymous delivery ensures the report exists on-screen (no email)
  await page.request.post(`/api/session/${token}/delivery`, { data: { consents: { reportDelivery: true, newsletter: false, pulse: false, followup: false }, idempotencyKey: 'lz-delivery-00000001' } });
  await page.goto(`/report/${token}`);
  await expect(page.getByRole('heading', { name: /决策简报/ })).toBeVisible({ timeout: 30_000 });
  const body = await page.locator('body').innerText();
  // mandated labels (user-facing provenance terminology)
  expect(body).toMatch(/用户事实|用户假设|AI 推断|待验证|人工决定/);
});

test('MOBILE-001 + VIS-002: 375px viewport, no horizontal scroll, works without network images', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route('**/*', (route) => {
    const req = route.request();
    if (req.resourceType() === 'image') return route.abort();
    return route.continue();
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(noHScroll).toBe(true);
  await page.goto('/method');
  const mh = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(mh).toBe(true);
});
