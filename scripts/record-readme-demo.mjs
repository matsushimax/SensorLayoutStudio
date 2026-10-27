import { chromium, expect } from '@playwright/test';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';

await mkdir('docs/recording', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-webgl'] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  recordVideo: { dir: 'docs/recording', size: { width: 1440, height: 960 } },
});
const page = await context.newPage();
const videoStart = Date.now();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const pause = (ms) => page.waitForTimeout(ms);
const edit = async (label, value) => {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
  await expect(field).toHaveValue(String(value));
};
try {
  await page.goto('http://127.0.0.1:1420');
  await page.getByRole('button', { name: 'roof_lidar', exact: true }).click();
  await edit('Elevation min', -45);
  await edit('Far distance', 5);
  await page.getByRole('button', { name: 'Select all visible sensors', exact: true }).click();
  await page.getByRole('button', { name: 'Common coverage', exact: true }).click();
  await page.getByRole('button', { name: 'front_camera', exact: true }).click();
  await page.getByLabel('Highlight blind spots', { exact: true }).check();
  await expect(page.getByLabel('Highlight blind spots', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Move (W)', exact: true }).click();
  await edit('Vertical FOV', 60);
  await page.locator('.inspector').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.mouse.move(1120, 210);
  await pause(1500);
  // Captions exist only in the recording. All geometry and edits use the real app.
  await page.evaluate(() => {
    const caption = document.createElement('div');
    caption.id = 'demo-caption';
    caption.textContent = '01  Move camera · purple: shared / red: blind spots';
    caption.style.cssText =
      'position:fixed;left:250px;top:240px;z-index:20;padding:12px 18px;border-radius:8px;background:#193c32;color:#f6f9e9;font:600 17px system-ui;box-shadow:0 3px 14px #12251e22;pointer-events:none';
    document.body.append(caption);
  });
  const title = (text) =>
    page.locator('#demo-caption').evaluate((el, text) => {
      el.textContent = text;
    }, text);
  await title('01  Move camera · purple: shared / red: blind spots');
  const start = (Date.now() - videoStart) / 1000;
  await pause(1000);
  await page.screenshot({ path: 'docs/recording/start.png' });
  const before = await page.getByLabel('Position X', { exact: true }).inputValue();
  for (const value of [1.85, 2.05, 2.25, 2.45]) {
    await edit('Position X', value);
    await pause(180);
  }
  await expect(page.getByLabel('Position X', { exact: true })).not.toHaveValue(before);
  await page.screenshot({ path: 'docs/recording/moved.png' });
  await pause(300);
  await title('02  Camera FOV · compare shared visibility and blind spots');
  for (const value of [80, 90, 100, 110, 100, 90, 80, 70]) {
    await edit('Horizontal FOV', value);
    await pause(150);
  }
  await page.screenshot({ path: 'docs/recording/fov.png' });
  await title('03  Camera range · inspect overlap and occlusion');
  for (const value of [4.5, 4, 3.5, 3, 3.5, 4, 4.5, 5]) {
    await edit('Far distance', value);
    await pause(150);
  }
  await page.screenshot({ path: 'docs/recording/range.png' });
  await pause(300);
  await edit('Position X', before);
  await page.getByRole('button', { name: 'roof_lidar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Common coverage', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await title('04  Move LiDAR · shared visibility and blind spots shift');
  for (const value of [0.3, 0.6, 0.9, 1.2]) {
    await edit('Position Y', value);
    await pause(180);
  }
  await page.screenshot({ path: 'docs/recording/lidar-moved.png' });
  await pause(300);
  await title('05  LiDAR range · expand and shrink shared visibility');
  for (const value of [4.5, 4, 3.5, 3, 3.5, 4, 4.5, 5]) {
    await edit('Far distance', value);
    await pause(150);
    if (value === 3) await page.screenshot({ path: 'docs/recording/lidar-short-range.png' });
  }
  await page.screenshot({ path: 'docs/recording/lidar-range.png' });
  await pause(500);
  await edit('Position Y', 0);
  await page.getByRole('button', { name: 'front_camera', exact: true }).click();
  await page.locator('.inspector').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.mouse.move(1120, 210);
  await title('01  Move camera · purple: shared / red: blind spots');
  await pause(700);
  const duration = (Date.now() - videoStart) / 1000 - start;
  expect(errors).toEqual([]);
  const video = page.video();
  await context.close();
  await copyFile(await video.path(), 'docs/recording/raw.webm');
  await writeFile('docs/recording/timing.json', JSON.stringify({ start, duration }, null, 2));
  console.log(JSON.stringify({ start, duration, raw: 'docs/recording/raw.webm' }));
} finally {
  await browser.close();
}
