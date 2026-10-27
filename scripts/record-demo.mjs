import { chromium } from '@playwright/test';
import { copyFile, mkdir, unlink } from 'node:fs/promises';

await mkdir('docs/recording', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-webgl'] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  recordVideo: { dir: 'docs/recording', size: { width: 1440, height: 960 } },
});
const page = await context.newPage();
const start = Date.now();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const edit = async (label, value) => {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press('Enter');
  await pause(900);
};
await page.goto('http://127.0.0.1:1420');
await pause(2200);
await edit('Position X', '1.9');
await edit('Horizontal FOV', '95');
await edit('Far distance', '6');
await page.getByRole('button', { name: 'roof_lidar', exact: true }).click();
await pause(1000);
await edit('Azimuth span', '270');
await edit('Far distance', '4');
await page.getByRole('button', { name: 'Select all visible sensors', exact: true }).click();
await page.getByRole('button', { name: 'Common coverage', exact: true }).click();
await pause(1800);
await page.getByRole('button', { name: 'Top', exact: true }).click();
await pause(1800);
await page.getByRole('button', { name: 'Target / crate', exact: true }).click();
await edit('Position Y', '2.5');
await pause(1000);
await edit('Position Y', '0.4');
await page.getByRole('button', { name: 'Perspective', exact: true }).click();
await pause(1400);
await page.getByRole('button', { name: 'All sensors', exact: true }).click();
const exported = page.waitForEvent('download');
await page.getByRole('button', { name: 'Export transforms' }).click();
await exported;
await pause(1200);
const saved = page.waitForEvent('download');
await page.getByRole('button', { name: 'Save scene' }).click();
await saved;
await page.getByRole('button', { name: 'front_camera', exact: true }).click();
await pause(Math.max(1000, 30000 - (Date.now() - start)));
const video = page.video();
await context.close();
const videoPath = await video.path();
await browser.close();
// Copy also works when a Windows preview holds the destination open for reading.
await copyFile(videoPath, 'docs/demo.webm');
await unlink(videoPath);
console.log('Recorded docs/demo.webm (application walkthrough)');
