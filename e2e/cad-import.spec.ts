import { expect, test } from '@playwright/test';

for (const extension of ['stl', 'step']) {
  test(`${extension} imports at metric size, blocks sensor rays, and relinks saved alignment`, async ({
    page,
  }) => {
    await page.goto('/');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import 3D model', exact: true }).click();
    await (await chooser).setFiles(`examples/calibration-block.${extension}`);
    await expect(page.getByRole('heading', { name: 'Imported model', exact: true })).toBeVisible({
      timeout: 30000,
    });
    if (extension === 'stl') {
      await expect(page.getByLabel('STL units')).toHaveValue('0.001');
      await page.getByLabel('STL units').selectOption('0.0254');
      await expect(page.getByLabel('Scale factor', { exact: true })).toHaveValue('0.0254');
      await page.getByLabel('STL units').selectOption('0.001');
    }
    const measured = await page.evaluate(async () => {
      const path = '/src/state/store.ts';
      const s = (await import(path)).useStudio.getState();
      const three = '/node_modules/.vite/deps/three.js';
      const { Box3, Vector3 } = await import(three);
      const size = new Box3().setFromObject(s.modelObject).getSize(new Vector3());
      return {
        size: size.toArray(),
        rotation: s.scene.model.poseInBase.quaternionXYZW,
      };
    });
    expect(measured.size).toEqual([1, 2, 3]);
    expect(measured.rotation).toEqual([0, 0, 0, 1]);
    // Move the front face in front of the camera; the imported block must occlude.
    await page.getByLabel('Position X', { exact: true }).fill('3');
    await page.getByLabel('Position X', { exact: true }).press('Enter');
    await page.getByRole('button', { name: 'front_camera', exact: true }).click();
    await expect(page.getByLabel('Nearest surface hit', { exact: true })).toHaveText('1.350 m');
    await page.screenshot({ path: `test-results/import-${extension}.png` });
    const sceneText = await page.evaluate(async () => {
      const path = '/src/state/store.ts';
      return JSON.stringify((await import(path)).useStudio.getState().scene);
    });
    page.on('dialog', (dialog) => dialog.accept());
    const open = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await (
      await open
    ).setFiles({
      name: 'scene.json',
      mimeType: 'application/json',
      buffer: Buffer.from(sceneText),
    });
    const relink = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Locate model', exact: true }).click();
    await (await relink).setFiles(`examples/calibration-block.${extension}`);
    await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('3', {
      timeout: 30000,
    });
    await expect(page.getByRole('button', { name: 'Locate model', exact: true })).toHaveCount(0);
  });
}

test('failed STEP and cancelled conversion preserve the existing scene', async ({ page }) => {
  await page.goto('/');
  const original = await page.evaluate(async () => {
    const path = '/src/state/store.ts';
    return JSON.stringify((await import(path)).useStudio.getState().scene);
  });
  const choose = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import 3D model', exact: true }).click();
  await (
    await choose
  ).setFiles({
    name: 'broken.step',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('invalid STEP'),
  });
  await expect(page.locator('.status-bar [role="status"]')).toContainText('STEP', {
    timeout: 30000,
  });
  await expect(page.locator('.busy-overlay')).toHaveCount(0, { timeout: 30000 });
  expect(
    await page.evaluate(async () => {
      const path = '/src/state/store.ts';
      return JSON.stringify((await import(path)).useStudio.getState().scene);
    }),
  ).toBe(original);
  await page.route('**/vendor/occt/occt-import-js.wasm', () => {});
  const retry = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import 3D model', exact: true }).click();
  await (await retry).setFiles('examples/calibration-block.step');
  await page.getByRole('button', { name: 'Cancel STEP import', exact: true }).click();
  await expect(page.locator('.status-bar [role="status"]')).toContainText('cancelled');
  await expect(page.locator('.busy-overlay')).toHaveCount(0, { timeout: 30000 });
  expect(
    await page.evaluate(async () => {
      const path = '/src/state/store.ts';
      return JSON.stringify((await import(path)).useStudio.getState().scene);
    }),
  ).toBe(original);
});
