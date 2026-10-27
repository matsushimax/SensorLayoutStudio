import { chromium, expect } from '@playwright/test';

await expect
  .poll(
    async () => {
      try {
        return (await fetch('http://127.0.0.1:9223/json/version')).ok;
      } catch {
        return false;
      }
    },
    { timeout: 10000 },
  )
  .toBe(true);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = browser.contexts()[0].pages()[0];
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await page.waitForLoadState('domcontentloaded');
await expect(page.getByLabel('Name', { exact: true })).toHaveValue('front_camera');
await expect(page.locator('.header-center')).toContainText('DESKTOP');
await expect(page.getByLabel('Occlusion preview', { exact: true })).toContainText('PER-PIXEL');
const blindSpots = page.getByRole('checkbox', { name: 'Highlight blind spots', exact: true });
await expect(blindSpots).toBeChecked();
await blindSpots.uncheck();
await expect(page.getByText('Occluded / blind spot', { exact: true })).toHaveCount(0);
await blindSpots.check();
await expect(page.getByText('Occluded / blind spot', { exact: true })).toBeVisible();
await expect(page.getByLabel('Clipped ray samples', { exact: true })).toHaveText(/\d+ \/ \d+/);
await expect(page.getByLabel('Nearest surface hit', { exact: true })).not.toHaveText('—');
await page.getByRole('button', { name: 'Toggle occlusion', exact: true }).click();
await expect(page.getByLabel('Stop rays at surfaces', { exact: true })).not.toBeChecked();
await page.getByRole('button', { name: 'Toggle occlusion', exact: true }).click();
await expect(page.getByLabel('Clipped ray samples', { exact: true })).toHaveText(/\d+ \/ \d+/);
await page.waitForTimeout(1500);
await page.screenshot({ path: 'docs/screenshots/desktop.png' });
await page.screenshot({ path: 'docs/screenshots/blind-spots.png' });
const field = page.getByLabel('Position X', { exact: true });
await field.fill('2.1');
await field.press('Enter');
await expect(field).toHaveValue('2.1');
await page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true }).click();
await page.getByRole('button', { name: 'front_camera', exact: true }).click();
await expect(field).toHaveValue('1.65');
await page.getByLabel('Edit relative to').selectOption({ label: 'roof_lidar' });
await expect(page.getByLabel('Position Z', { exact: true })).toHaveValue('-0.85');
await page.getByLabel('Edit relative to').selectOption('base_link');
await page.getByRole('button', { name: 'Preview transforms', exact: true }).click();
await page.getByLabel('Preview reference').selectOption({ label: 'roof_lidar' });
await expect(page.getByLabel('Relative position', { exact: true })).toHaveText('1.65, 0, -0.85');
await page.screenshot({ path: 'docs/screenshots/transform-preview.png' });
await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
await page.getByRole('button', { name: 'Move + Rotate', exact: true }).click();
await expect(page.getByLabel('Rotation gizmo guide')).toBeVisible();
await page.waitForTimeout(500);
await page.screenshot({ path: 'docs/screenshots/rotation-gizmo.png' });
await page.getByRole('button', { name: 'Move (W)', exact: true }).click();
await page.getByRole('button', { name: 'Select all visible sensors', exact: true }).click();
await page.getByRole('button', { name: 'Common coverage', exact: true }).click();
await page.getByRole('button', { name: 'roof_lidar', exact: true }).click();
await expect(
  page.getByRole('checkbox', { name: 'Include front_camera in sensor selection', exact: true }),
).toBeChecked();
await expect(
  page.getByRole('checkbox', { name: 'Include roof_lidar in sensor selection', exact: true }),
).toBeChecked();
await expect(page.getByRole('button', { name: 'Common coverage', exact: true })).toHaveAttribute(
  'aria-pressed',
  'true',
);
await page.waitForTimeout(1000);
await page.screenshot({ path: 'docs/screenshots/common-coverage.png' });
if (errors.length) throw new Error(errors.join('\n'));
console.log(
  'Native WebView2: desktop mode, blind-spot toggle, numeric edit/undo and multiple-sensor common coverage passed.',
);
await browser.close();
