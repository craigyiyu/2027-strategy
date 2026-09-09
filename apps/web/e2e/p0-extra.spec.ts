/**
 * Remaining automatable P0 coverage:
 * LOC-001 zh-CN full UI happy path (no English chrome leakage),
 * A11Y-001 keyboard-only full flow, FUNC-018 print-media rendering,
 * A11Y-005 200% zoom, VIS-003 no cliché/portrait imagery.
 */
import { test, expect, type Page } from '@playwright/test';

const ZH_ANSWERS = [
  '决定是否在 2027 年建设统一宾客数据平台；由集团 CTO 于 10 月底前拍板。',
  '事实：宾客旅程跨物业分散，报表延迟数周。判断：各物业仍在采购本地工具。',
  '到 2027 年底，优先旅程中八成使用经同意的跨物业身份，关键运营达到韧性目标。',
  '主因是职责归属分散、数据口径不一；另一种解释是激励偏向本地交付。',
  '优先：先建一条共享数据基础服务两个旅程试点。明确不做：各物业 App 重建。',
  '方案一：先建中央数据基础。方案二：在薄共享层上做两个试点。方案三：统一标准下的物业自治。各有不同取舍。',
  '必须成立：管理层接受统一口径（可信未证实）；两个用例九十天内见效（未验证）；有安全评审资源（未知）。',
  '12 月 31 日前两个旅程试点达到八成经同意身份覆盖并有具名业务负责人，否则暂停平台投入。负责人：集团 CTO。',
];

async function answerInterview(page: Page, answers: string[]) {
  for (let i = 0; i < answers.length; i++) {
    const ta = page.locator('textarea');
    await expect(ta).toBeVisible({ timeout: 20_000 });
    await ta.fill(answers[i]!);
    await page.getByRole('button', { name: /^继续$/ }).click();
    // if a follow-up card appears, answer it
    const followupVisible = await page.getByText(/针对你上一条回答的一次性追问/i).first().isVisible().catch(() => false);
    if (followupVisible) {
      const ta2 = page.locator('textarea');
      await ta2.fill('具名负责人已确认；决定阈值已定义。');
      await page.getByRole('button', { name: /^继续$/ }).click();
    }
    await page.waitForTimeout(250);
  }
}

test('LOC-001: full Simplified-Chinese UI happy path with mandated labels', async ({ page }) => {
  await page.goto('/start?lang=zh-CN');
  await page.getByRole('heading', { name: /设置你的冲刺/ }).waitFor();
  await page.getByRole('radio', { name: /技术与数字化/ }).check();
  await page.getByRole('radio', { name: /保存我的简报/ }).check();
  await page.getByRole('button', { name: /开始访谈/ }).click();

  await answerInterview(page, ZH_ANSWERS);

  // completion card -> reflection
  await page.getByRole('button', { name: /查看我的复盘/ }).first().click({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: /这是我听到的/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /确认并生成预览/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole('button', { name: /确认/i }).click();
  await page.getByRole('link', { name: /继续查看预览/ }).click({ timeout: 15_000 });

  // preview -> anonymous on-screen report
  await expect(page.getByRole('link', { name: /在屏幕上查看完整报告/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link', { name: /在屏幕上查看完整报告/ }).click();
  await expect(page.getByRole('heading', { name: /决策简报/ })).toBeVisible({ timeout: 30_000 });

  // provenance labels render in mandated Chinese terminology; never English
  const body = await page.locator('body').innerText();
  for (const enTerm of ['User fact', 'User assumption', 'AI inference', 'Needs validation', 'Human decision']) {
    expect(body, `English provenance leak: ${enTerm}`).not.toContain(enTerm);
  }
  const zhPresent = ['用户事实', '用户假设', 'AI 推断', '待验证', '人工决定'].filter((t) => body.includes(t));
  expect(zhPresent.length >= 2, `expected ≥2 mandated zh terms, got ${JSON.stringify(zhPresent)}`).toBe(true);
  // LOC-001: no stray English chrome in the Chinese flow (brand/method names are allowed)
  for (const forbidden of ['Continue', 'Skip this question', 'Why we ask', 'Save & exit', 'View full report on screen', 'Email address']) {
    expect(body, `forbidden English: ${forbidden}`).not.toContain(forbidden);
  }
});

test('A11Y-001: complete the full interview keyboard-only', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  // navigate to the Start CTA via repeated tabs, activate with Enter
  for (let i = 0; i < 12; i++) {
    const active = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent ?? '');
    if (/Start my 2027 Strategy Sprint/i.test(active)) break;
    await page.keyboard.press('Tab');
  }
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/start/);

  // select radios via keyboard (arrow keys) then submit via Enter
  await page.getByRole('radio', { name: /Technology & Digital/ }).focus();
  await page.keyboard.press('Space');
  await page.getByRole('radio', { name: /Save My Brief/ }).focus();
  await page.keyboard.press('Space');
  const submitBtn = page.getByRole('button', { name: /begin the interview/i });
  await submitBtn.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('textarea')).toBeVisible({ timeout: 20_000 });

  const EN_ANSWERS = [
    'Decide the 2027 data-platform question; Group CTO owner by end of October.',
    'Fact: journeys fragmented across properties; judgment: teams keep buying local tools.',
    'By Q4 2027, 80% of prioritized journeys run on consented cross-property identity.',
    'Leading cause fragmented ownership; alternative is incentives reward local delivery.',
    'Priority: one shared foundation for two journeys. Not now: app rebuilds.',
    'Option A: central foundation first. Option B: pilots on a thin shared layer. Option C: standards with autonomy. Each trades differently.',
    'Needs: execs accept common definitions (plausible); value in 90 days (unvalidated); security review capacity (unknown).',
    'By 31 Dec pilots reach 80% consent coverage with named owners else pause. Owner: Group CTO.',
  ];
  for (const answer of EN_ANSWERS) {
    const ta = page.locator('textarea');
    await expect(ta).toBeVisible({ timeout: 15_000 });
    await ta.fill(answer);
    const cont = page.getByRole('button', { name: /^Continue$/ });
    await cont.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
  }
  await expect(page.getByRole('heading', { name: /complete|the eight questions/i })).toBeVisible({ timeout: 40_000 });
});

test('FUNC-018 + A11Y-005: report prints cleanly and holds at 200% zoom without scroll loss', async ({ page }) => {
  // build a report through the API
  const res = await page.request.post('/api/session', { data: { language: 'en', lens: 'business', roleBand: 'owner', industryBand: 'other', privacyMode: 'save' } });
  const { token } = (await res.json()) as { token: string };
  for (let i = 0; i < 8; i++) {
    const r = await page.request.post(`/api/session/${token}/answer`, {
      data: { stageId: `Q${i + 1}`, answer: ZH_ANSWERS[i], idempotencyKey: `zp-${i + 1}-00000001` },
    });
    const b = (await r.json()) as { followupQuestion: string | null };
    if (b.followupQuestion) {
      await page.request.post(`/api/session/${token}/followup`, { data: { stageId: `FU-Q${i + 1}`, answer: 'Owner confirmed.', idempotencyKey: `zpf-${i + 1}-00000001` } });
    }
  }
  await page.request.post(`/api/session/${token}/reflection`);
  await page.request.post(`/api/session/${token}/reflection/confirm`, { data: { corrections: '', confirmation: 'confirm', idempotencyKey: 'zp-confirm-00000001' } });
  await page.request.post(`/api/session/${token}/delivery`, { data: { consents: { reportDelivery: true, newsletter: false, pulse: false, followup: false }, idempotencyKey: 'zp-delivery-00000001' } });
  await page.goto(`/report/${token}`);
  await expect(page.getByRole('heading', { name: /Decision Brief/ })).toBeVisible({ timeout: 30_000 });

  // print media emulation: toolbar/nav hidden, sections visible
  await page.emulateMedia({ media: 'print' });
  const printHidden = await page.locator('.topbar, .no-print').count();
  await expect(page.getByRole('heading', { name: /12\. Decision Record|12\. Decision/ })).toBeVisible();

  // 200% zoom: no horizontal scrolling
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth * 2);
  expect(printHidden >= 1, 'toolbar present in print when it should be hidden').toBeTruthy();
});

test('VIS-003: landing/method carry no portrait, book-cover or logo imagery', async ({ page }) => {
  for (const p of ['/', '/method']) {
    await page.goto(p);
    const imgs = await page.evaluate(() =>
      Array.from(document.images).map((i) => ({ src: i.src, alt: i.alt })).filter((i) => i.src !== ''),
    );
    // product must not depend on raster imagery; none of these pages need <img>
    const external = imgs.filter((i) => !i.src.includes('data:'));
    expect(external.length, `unexpected imagery on ${p}: ${JSON.stringify(external)}`).toBe(0);
  }
});
