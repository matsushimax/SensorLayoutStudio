import { expect, test } from '@playwright/test';

test('common coverage checks every selected sensor in world space including occlusion and mixed sensor poses', async ({
  page,
}) => {
  await page.goto('/');
  const pixels = await page.evaluate(async () => {
    const path = '/e2e/common-visibility-fixture.ts';
    return (await import(path)).renderCommonVisibility();
  });
  for (const key of ['shared', 'identical', 'occlusionOff', 'blockerHidden', 'mixed']) {
    const [r, g, b, alpha] = pixels[key];
    expect(r, key).toBeGreaterThan(g);
    expect(b, key).toBeGreaterThan(r);
    expect(alpha, key).toBeGreaterThan(120);
  }
  for (const key of ['onlyA', 'notAllThree', 'projectedOnly', 'blockedForB', 'rotatedAway']) {
    const [r, g, , alpha] = pixels[key];
    expect(g, key).toBeGreaterThan(r);
    expect(alpha, key).toBeLessThan(60);
    expect(alpha, key).toBeGreaterThan(0);
  }
  expect(pixels.outsideA[3]).toBe(0);
});

test('multiple selection focuses FOVs and preserves the comparison while editing a sensor', async ({
  page,
}) => {
  await page.goto('/');
  const a = page.getByRole('checkbox', {
    name: 'Include front_camera in sensor selection',
    exact: true,
  });
  const b = page.getByRole('checkbox', {
    name: 'Include roof_lidar in sensor selection',
    exact: true,
  });
  await expect(a).toBeChecked();
  await expect(b).not.toBeChecked();
  await page.getByRole('button', { name: 'Selected sensors', exact: true }).click();
  await page.waitForTimeout(500);
  const single = await page.locator('canvas').screenshot();
  await b.check();
  await expect(a).toBeChecked();
  await expect(b).toBeChecked();
  await page.waitForTimeout(200);
  expect(await page.locator('canvas').screenshot()).not.toEqual(single);
  await page.getByRole('button', { name: 'Common coverage', exact: true }).click();
  await page.getByRole('button', { name: 'roof_lidar', exact: true }).click();
  await expect(a).toBeChecked();
  await expect(b).toBeChecked();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('roof_lidar');
  await page.screenshot({ path: 'docs/screenshots/common-coverage.png' });
  await page.getByRole('button', { name: 'Hide roof_lidar', exact: true }).click();
  await expect(
    page.getByText('Select at least 2 visible sensors for common coverage.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Show roof_lidar', exact: true }).click();
  await page.getByRole('button', { name: 'Clear sensor selection', exact: true }).click();
  await expect(a).not.toBeChecked();
  await expect(b).not.toBeChecked();
  await expect(
    page.getByText('Select a visible sensor to display its FOV.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'All sensors', exact: true }).click();
  await expect(page.getByRole('button', { name: 'All sensors', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
