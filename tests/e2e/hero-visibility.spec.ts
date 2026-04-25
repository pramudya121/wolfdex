import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Asserts that the given hero locator is *visually* visible.
 *
 * The TextGenerateEffect splits text into per-word <span> elements that
 * animate from opacity:0 to opacity:1. We wait for the animation to finish
 * (max ~1.2s for the longest copy) and then check that:
 *   1. the element occupies a non-zero box (width × height > 0)
 *   2. the resolved text content matches what we expect
 *   3. opacity of every word reached 1 (fully revealed, not stuck mid-anim)
 *
 * This is the contract: even with gradient `background-clip:text` and
 * `text-fill-color: transparent`, every word MUST end up rendered.
 */
async function expectHeroVisible(page: Page, hero: Locator, expectedText: string) {
  await expect(hero).toBeVisible();
  await expect(hero).toContainText(expectedText);

  // Wait for all animated words to complete (8 words × 0.08s + 0.6s + safety).
  await page.waitForTimeout(1500);

  const box = await hero.boundingBox();
  expect(box, 'hero must have a layout box').not.toBeNull();
  expect(box!.width).toBeGreaterThan(50);
  expect(box!.height).toBeGreaterThan(10);

  // Check every animated word has opacity 1 — guards against the gradient
  // regression where words rendered transparent.
  const wordOpacities = await hero.locator('.text-gen-word').evaluateAll(
    (nodes) => nodes.map((n) => parseFloat(window.getComputedStyle(n).opacity)),
  );
  expect(wordOpacities.length, 'hero should be split into word spans').toBeGreaterThan(0);
  for (const op of wordOpacities) {
    expect(op).toBeGreaterThanOrEqual(0.99);
  }
}

test.describe('Hero text & CTA visibility', () => {
  test('Home — "Trade with the Pack" hero + CTA visible', async ({ page }) => {
    await page.goto('/');
    const hero = page.locator('h1', { hasText: 'Trade with the Pack' }).first();
    await expectHeroVisible(page, hero, 'Trade with the Pack');

    // CTA button must be visible & enabled.
    const cta = page.getByRole('link', { name: /start swapping/i }).first();
    await expect(cta).toBeVisible();

    await page.screenshot({
      path: `playwright-report/screens/home-${test.info().project.name}.png`,
      fullPage: false,
    });
  });

  test('Swap — "Trade with the Pack" hero visible', async ({ page }) => {
    await page.goto('/swap');
    const hero = page.locator('h1', { hasText: 'Trade with the Pack' }).first();
    await expectHeroVisible(page, hero, 'Trade with the Pack');

    await page.screenshot({
      path: `playwright-report/screens/swap-${test.info().project.name}.png`,
      fullPage: false,
    });
  });

  test('Liquidity — "Provide Liquidity, Earn Fees" hero visible', async ({ page }) => {
    await page.goto('/liquidity');
    const hero = page.locator('h1', { hasText: 'Provide Liquidity' }).first();
    await expectHeroVisible(page, hero, 'Provide Liquidity, Earn Fees');

    await page.screenshot({
      path: `playwright-report/screens/liquidity-${test.info().project.name}.png`,
      fullPage: false,
    });
  });
});
