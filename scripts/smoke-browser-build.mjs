import { chromium, expect } from '@playwright/test';

const url = process.argv[2] || 'http://127.0.0.1:4173/SensorLayoutStudio/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-webgl'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(url);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('front_camera');
  await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Select all visible sensors', exact: true }).click();
  await page.getByRole('button', { name: 'Common coverage', exact: true }).click();
  await expect(page.getByLabel('Highlight blind spots', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'roof_lidar', exact: true }).click();
  await page.getByLabel('Far distance', { exact: true }).fill('4');
  await page.getByLabel('Far distance', { exact: true }).press('Enter');
  await expect(page.getByLabel('Far distance', { exact: true })).toHaveValue('4');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import 3D model', exact: true }).click();
  await (await chooser).setFiles('examples/calibration-block.step');
  await expect(page.getByRole('heading', { name: 'Imported model', exact: true })).toBeVisible({
    timeout: 60000,
  });
  expect(errors).toEqual([]);
  console.log(
    `Built browser app passed: ${url} (render, common coverage, LiDAR edit, STEP/WASM import)`,
  );
} finally {
  await browser.close();
}
