import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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
await page.waitForLoadState('domcontentloaded');
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
try {
  for (const extension of ['stl', 'step']) {
    const data = Array.from(await readFile(`examples/calibration-block.${extension}`));
    // Stub only the file picker/read boundary. The release UI, WASM worker,
    // Tauri asset protocol/CSP, triangulation and renderer remain real.
    await page.evaluate(
      ({ data, extension }) => {
        window.__cadOriginalFetch ??= window.fetch;
        window.fetch = (input, options) => {
          const url = decodeURIComponent(input instanceof Request ? input.url : String(input));
          let value;
          if (url.includes('plugin:dialog|open'))
            value = `C:\\test\\calibration-block.${extension}`;
          else if (url.includes('plugin:fs|stat')) value = { size: data.length };
          else if (url.includes('plugin:fs|read_file')) value = data;
          else return window.__cadOriginalFetch.call(window, input, options);
          return Promise.resolve(
            new Response(JSON.stringify(value), {
              headers: { 'Content-Type': 'application/json', 'Tauri-Response': 'ok' },
            }),
          );
        };
      },
      { data, extension },
    );
    await page.getByRole('button', { name: 'Import 3D model', exact: true }).click();
    await expect(page.locator('.status-bar [role="status"]')).toContainText(
      `Imported calibration-block.${extension}`,
      { timeout: 30000 },
    );
    await expect(page.getByLabel('Scale factor', { exact: true })).toHaveValue(
      extension === 'stl' ? '0.001' : '1',
    );
    await page.getByLabel('Position X', { exact: true }).fill('3');
    await page.getByLabel('Position X', { exact: true }).press('Enter');
    await page.getByRole('button', { name: 'front_camera', exact: true }).click();
    await expect(page.getByLabel('Nearest surface hit', { exact: true })).toHaveText('1.350 m');
    await page.screenshot({ path: `docs/screenshots/import-${extension}.png` });
  }
  expect(errors).toEqual([]);
  console.log(
    'Native STL/STEP: release WASM/CSP, default units, pose editing and occlusion passed (file IO stubbed).',
  );
} finally {
  await page.evaluate(() => {
    if (window.__cadOriginalFetch) window.fetch = window.__cadOriginalFetch;
  });
  await browser.close();
}
