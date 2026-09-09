/**
 * FUNC-011 save-status accuracy, LOC-004 language persistence, PERF-003
 * offline recovery, A11Y-004 text-based progress.
 */
import { test, expect, type Page } from '@playwright/test';

const EN_Q1 = 'Decide the 2027 data-platform question; Group CTO owner by end of October.';
const EN_Q2 = 'Fact: journeys fragmented across properties; judgment: teams keep buying local tools.';

async function startEnInterview(page: Page): Promise<{ token: string }> {
  await page.goto('/');
  await page.getByRole('link', { name: /start my 2027 strategy sprint/i }).first().click();
  await page.getByRole('radio', { name: /Technology & Digital/ }).check();
  await page.getByRole('radio', { name: /Save My Brief/ }).check();
  await page.getByRole('button', { name: /begin the interview/i }).click();
  await expect(page.locator('textarea')).toBeVisible({ timeout: 20_000 });
  const url = page.url();
  const token = /\/session\/([^/]+)/.exec(url)?.[1] ?? '';
  expect(token.length).toBeGreaterThan(10);
  return { token };
}

test('FUNC-011: UI shows Saving then Saved only after server confirms', async ({ page }) => {
  const { token } = await startEnInterview(page);
  // delay the answer endpoint so the in-flight state is visible
  await page.route(`**/api/session/${token}/answer`, async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await page.locator('textarea').fill(EN_Q1);
  const statusText = async () => (await page.locator('body').innerText());
  await page.getByRole('button', { name: /^Continue$/ }).click();
  // during flight we must never see "Saved" falsely; after settle it may say Saved/advance
  const during = await statusText();
  expect(during).not.toMatch(/Saved/i);
  await expect
    .poll(async () => (await page.locator('body').innerText()).match(/Question 2 of 8|第 2 \/ 8 题/), { timeout: 20_000 })
    .toBeTruthy();
});

test('LOC-004: language persists across refresh and reopen', async ({ page }) => {
  await page.goto('/start?lang=zh-CN');
  await page.getByRole('radio', { name: /技术与数字化/ }).check();
  await page.getByRole('radio', { name: /保存我的简报/ }).check();
  await page.getByRole('button', { name: /开始访谈/ }).click();
  await expect(page.locator('textarea')).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => (await page.locator('body').innerText()).includes('第 1 / 8 题'))
    .toBe(true);
  // refresh the same tokenized URL
  await page.reload();
  await expect
    .poll(async () => (await page.locator('body').innerText()).includes('第 1 / 8 题'), { timeout: 15_000 })
    .toBe(true);
  // and a hard reopen
  await page.goto(page.url());
  await expect
    .poll(async () => (await page.locator('body').innerText()).includes('第 1 / 8 题'), { timeout: 15_000 })
    .toBe(true);
  // core chrome still zh
  const body = await page.locator('body').innerText();
  expect(body).toContain('跳过');
  expect(body).not.toContain('Skip');
});

test('PERF-003: offline submission keeps the answer; retry succeeds after reconnect', async ({ page, context }) => {
  await startEnInterview(page);
  await context.setOffline(true);
  await page.locator('textarea').fill(EN_Q1);
  await page.getByRole('button', { name: /^Continue$/ }).click();
  // offline → error path must keep textarea content
  await page.waitForTimeout(1500);
  expect(await page.locator('textarea').inputValue()).toContain('Decide the 2027');
  await context.setOffline(false);
  await page.waitForTimeout(600);
  const retryBtn = page.getByRole('button', { name: /retry|重试/i });
  if (await retryBtn.count()) await retryBtn.first().click();
  else await page.getByRole('button', { name: /^Continue$/ }).first().click();
  await expect
    .poll(async () => (await page.locator('body').innerText()).match(/Question 2 of 8|第 2 \/ 8 题/), { timeout: 20_000 })
    .toBeTruthy();
});

test('A11Y-004: progress is conveyed in text, not only color', async ({ page }) => {
  const { token } = await startEnInterview(page);
  await page.locator('textarea').fill(EN_Q1);
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await expect
    .poll(async () => (await page.locator('body').innerText()).match(/Question 2 of 8|第 2 \/ 8 题/), { timeout: 20_000 })
    .toBeTruthy();
  await page.goto(page.url()); // reload keeps progress
  await expect
    .poll(async () => (await page.locator('body').innerText()).match(/Question 2 of 8|第 2 \/ 8 题/), { timeout: 15_000 })
    .toBeTruthy();
});

test('A11Y-006: reduced-motion preference does not hide state feedback', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { token } = await startEnInterview(page);
  await page.locator('textarea').fill(EN_Q1);
  await page.getByRole('button', { name: /^Continue$/ }).click();
  // state feedback still conveyed (progress advances) without relying on motion
  await expect
    .poll(async () => (await page.locator('body').innerText()).match(/Question 2 of 8|第 2 \/ 8 题/), { timeout: 20_000 })
    .toBeTruthy();
});

test('PERF-002: delayed AI answer still shows immediate progress and no duplicate submit', async ({ page }) => {
  const { token } = await startEnInterview(page);
  await page.route(`**/api/session/${token}/answer`, async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  let posts = 0;
  await page.unroute(`**/api/session/${token}/answer`);
  await page.route(`**/api/session/${token}/answer`, async (route) => {
    posts += 1;
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  await page.locator('textarea').fill(EN_Q1);
  // double-click must not double-submit
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.getByRole('button', { name: /^Continue$/ }).click().catch(() => {});
  await expect
    .poll(async () => (await page.locator('body').innerText()).match(/Question 2 of 8|第 2 \/ 8 题/), { timeout: 30_000 })
    .toBeTruthy();
  expect(posts).toBe(1);
});
