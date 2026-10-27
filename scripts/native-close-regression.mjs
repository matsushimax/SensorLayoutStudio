import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

const executable = resolve(
  process.env.SENSOR_LAYOUT_TEST_EXE || 'src-tauri/target/release/sensor-layout-studio.exe',
);
const reproduce = process.argv.includes('--expect-blocked');
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

async function withApp(port, test) {
  const app = spawn(executable, [], {
    windowsHide: true,
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
    stdio: 'ignore',
  });
  let exited = false;
  app.once('exit', () => {
    exited = true;
  });
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 100 && !exited; i++) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {}
      await pause(100);
    }
    if (!ready) throw new Error('Native test app did not start its test-only debugging endpoint.');
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const page = browser.contexts()[0].pages()[0];
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('front_camera');
    await expect(page.locator('.header-center')).toContainText('DESKTOP');
    // The close listener is registered asynchronously at mount.
    await pause(400);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const requestClose = async () => {
      try {
        // Window.close emits the same CloseRequested event as the title-bar X.
        await page.evaluate(() =>
          window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'main' }),
        );
      } catch (error) {
        if (!page.isClosed()) throw error;
      }
    };
    await test({ page, requestClose, hasExited: () => exited, errors });
  } finally {
    await browser?.close().catch(() => {});
    if (!exited) app.kill(); // Only the app instance created by this test.
  }
}

await withApp(9224, async ({ requestClose, hasExited, errors }) => {
  await requestClose();
  if (reproduce) {
    await pause(1200);
    expect(hasExited()).toBe(false);
    expect(errors.join('\n')).toContain('destroy not allowed');
    console.log('Reproduced: an unchanged study stays open because window.destroy is denied.');
    return;
  }
  await expect.poll(hasExited, { timeout: 8000 }).toBe(true);
  expect(errors).toEqual([]);
  console.log('PASS: unchanged study closes and its native process exits.');
});

if (!reproduce) {
  await withApp(9225, async ({ page, requestClose, hasExited, errors }) => {
    let browserPrompts = 0;
    page.on('dialog', (dialog) => {
      browserPrompts++;
      void dialog.dismiss();
    });
    // Stub only the dialog answer, keeping the actual native close event,
    // frontend handler, SDK destroy command and capability checks in use.
    await page.evaluate(() => {
      const original = window.fetch;
      window.__closeTest = { answer: 'No', prompts: 0 };
      // Tauri's invoke property is immutable; intercept only the dialog's
      // transport response instead of trying to replace the native bridge.
      window.fetch = (input, options) => {
        const url = decodeURIComponent(input instanceof Request ? input.url : String(input));
        if (url.includes('plugin:dialog|message')) {
          window.__closeTest.prompts++;
          return Promise.resolve(
            new Response(JSON.stringify(window.__closeTest.answer), {
              headers: { 'Content-Type': 'application/json', 'Tauri-Response': 'ok' },
            }),
          );
        }
        return original.call(window, input, options);
      };
    });
    const position = page.getByLabel('Position X', { exact: true });
    await position.fill('2.5');
    await position.press('Enter');
    await requestClose();
    await expect.poll(() => page.evaluate(() => window.__closeTest.prompts)).toBe(1);
    await expect(position).toHaveValue('2.5');
    expect(hasExited()).toBe(false);
    expect(browserPrompts).toBe(0);
    console.log('PASS: cancelling discard preserves the edited study and keeps the app open.');
    await page.evaluate(() => {
      window.__closeTest.answer = 'Yes';
    });
    await requestClose();
    await expect.poll(hasExited, { timeout: 8000 }).toBe(true);
    expect(browserPrompts).toBe(0);
    expect(errors).toEqual([]);
    console.log(
      'PASS: confirming discard exits, without a recursive close or browser unload prompt.',
    );
  });
}
