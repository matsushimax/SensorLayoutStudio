import { expect, test } from '@playwright/test';
test('all camera far-plane pixels agree with analytic box and ground occlusion even with mesh-based outlines', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/e2e/visibility-oracle.ts';
    return (await import(path)).compareVisibilityPixels();
  });
  expect(result.blocked).toBeGreaterThan(1000);
  expect(result.mismatches).toBe(0);
});
