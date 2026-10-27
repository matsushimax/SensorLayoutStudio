import { expect, test } from '@playwright/test';

test('box/cylinder display outlines leave camera and LiDAR boundaries unchanged in four views', async ({
  page,
}) => {
  await page.goto('/');
  const results = await page.evaluate(async () => {
    const path = '/e2e/outline-visibility.ts';
    return (await import(path)).compareDecoratedBoundaries();
  });
  for (const result of results) {
    expect(result.visiblePixels).toBeGreaterThan(100);
    expect(result.changedPixels, JSON.stringify(result)).toBe(0);
  }
});
