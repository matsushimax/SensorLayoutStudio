import { expect, test } from '@playwright/test';

test('camera and LiDAR color only blocked FOV regions red, including pre-near blockers', async ({
  page,
}) => {
  await page.goto('/');
  const pixels = await page.evaluate(async () => {
    const path = '/e2e/blind-spot-fixture.ts';
    return (await import(path)).renderBlindSpots();
  });
  for (const pixel of [pixels.cameraBlind, pixels.lidarBlind]) {
    expect(pixel[3]).toBeGreaterThan(0);
    expect(pixel[0]).toBeGreaterThan(pixel[1] * 2);
    expect(pixel[0]).toBeGreaterThan(pixel[2] * 2);
  }
  for (const pixel of [pixels.cameraVisible, pixels.lidarVisible, pixels.cleared]) {
    expect(pixel[3]).toBeGreaterThan(0);
    expect(pixel[1]).toBeGreaterThan(pixel[0] * 2);
  }
  for (const pixel of [
    pixels.cameraOutside,
    pixels.lidarOutside,
    pixels.hidden,
    pixels.transparent,
  ])
    expect(pixel[3]).toBe(0);
});

test('blind-spot highlighting defaults on and toggles the idle viewport without changing the study', async ({
  page,
}) => {
  await page.goto('/');
  const toggle = page.getByRole('checkbox', { name: 'Highlight blind spots', exact: true });
  await expect(toggle).toBeChecked();
  await expect(page.getByText('Occluded / blind spot', { exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  const highlighted = await page.locator('canvas').screenshot();
  await toggle.uncheck();
  await expect(page.getByText('Occluded / blind spot', { exact: true })).toHaveCount(0);
  await page.waitForTimeout(200);
  expect(await page.locator('canvas').screenshot()).not.toEqual(highlighted);
  await toggle.check();
  await page.getByRole('button', { name: 'Toggle occlusion', exact: true }).click();
  await expect(toggle).toBeDisabled();
  await expect(page.getByText('Occluded / blind spot', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Toggle occlusion', exact: true }).click();
  await expect(toggle).toBeEnabled();
  await expect(toggle).toBeChecked();
  await expect(page.getByText('Occluded / blind spot', { exact: true })).toBeVisible();
  const state = await page.evaluate(async () => {
    const path = '/src/state/store.ts';
    const store = (await import(path)).useStudio.getState();
    return { dirty: JSON.stringify(store.scene) !== store.saved, history: store.past.length };
  });
  expect(state).toEqual({ dirty: false, history: 0 });
});
