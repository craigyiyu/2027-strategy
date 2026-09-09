import { test } from '@playwright/test';
test('find horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.waitForTimeout(1000);
  const wide = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('*').forEach((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.right > document.documentElement.clientWidth + 1 || r.left < -1) {
        const cls = (el as HTMLElement).className?.toString().slice(0, 60);
        const tag = el.tagName.toLowerCase();
        out.push(`${tag}.${cls} right=${Math.round(r.right)} w=${Math.round(r.width)}`);
      }
    });
    return out.slice(0, 15);
  });
  console.log('WIDE ELEMENTS:', JSON.stringify(wide, null, 1));
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  console.log('scrollWidth', sw);
});
