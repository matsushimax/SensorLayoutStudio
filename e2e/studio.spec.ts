import { test, expect } from '@playwright/test';

test('demo renders, edits, exports and restores a scene', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('front_camera');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'docs/screenshots/studio.png', fullPage: true });
  const x = page.getByLabel('Position X', { exact: true });
  await x.fill('2.25');
  await x.press('Enter');
  await expect(x).toHaveValue('2.25');
  const fov = page.getByLabel('Horizontal FOV', { exact: true });
  await fov.fill('90');
  await fov.press('Enter');
  await expect(fov).toHaveValue('90');
  const transformsDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export transforms' }).click();
  const transformPath = await (await transformsDownload).path();
  const { readFile } = await import('node:fs/promises');
  const transforms = JSON.parse(await readFile(transformPath!, 'utf8'));
  expect(transforms.sensors[0].translationM[0]).toBe(2.25);
  expect(transforms.sensors[0].matrix[3]).toBe(2.25);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save scene' }).click();
  const scenePath = await (await downloadPromise).path();
  const sceneText = await readFile(scenePath!, 'utf8');
  expect(JSON.parse(sceneText).sensors[0].params.horizontalFovDeg).toBe(90);
  await page.getByRole('button', { name: 'Add sensor', exact: true }).click();
  await page.getByRole('button', { name: 'LiDAR', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('lidar');
  page.on('dialog', (dialog) => dialog.accept());
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await (
    await chooser
  ).setFiles({ name: 'scene.json', mimeType: 'application/json', buffer: Buffer.from(sceneText) });
  await expect(page.locator('.status-bar [role="status"]')).toContainText('Opened scene.json');
  await page
    .getByRole('button', { name: /front_camera/ })
    .first()
    .click();
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('2.25');
  await expect(page.getByLabel('Horizontal FOV', { exact: true })).toHaveValue('90');
  expect(errors).toEqual([]);
});

test('invalid input is rejected and history is reversible', async ({ page }) => {
  await page.goto('/');
  const far = page.getByLabel('Far distance', { exact: true });
  await far.fill('-1');
  await far.press('Enter');
  await expect(page.locator('.status-bar [role="status"]')).toContainText('Far');
  await expect(far).toHaveValue('5');
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('front_camera_2');
  await page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'front_camera_2', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo (Ctrl+Shift+Z)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'front_camera_2', exact: true })).toHaveCount(1);
});

test('imports GLB, restores alignment, and prompts for external model reselection', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import 3D model', exact: true }).click();
  await (await chooser).setFiles('examples/calibration-box.glb');
  await expect(page.getByLabel('Inspector')).toContainText('Imported model');
  await expect(page.getByLabel('Roll', { exact: true })).toHaveValue('90');
  const pos = page.getByLabel('Position X', { exact: true });
  await pos.fill('1.5');
  await pos.press('Enter');
  const save = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save scene' }).click();
  const { readFile } = await import('node:fs/promises');
  const contents = await readFile((await (await save).path())!, 'utf8');
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await (
    await picker
  ).setFiles({
    name: 'model.scene.json',
    mimeType: 'application/json',
    buffer: Buffer.from(contents),
  });
  await expect(page.getByRole('button', { name: 'Locate model' })).toBeVisible();
  const relink = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Locate model' }).click();
  await (await relink).setFiles('examples/calibration-box.glb');
  await expect(page.getByRole('button', { name: 'Locate model' })).toHaveCount(0);
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('1.5');
  expect(errors).toEqual([]);
});

test('translation gizmo updates coordinates and a single undo restores the pose', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForTimeout(1600);
  const initial = await page.getByLabel('Position X', { exact: true }).inputValue();
  const before = await page.evaluate(async () => {
    const path = '/e2e/rotation-fixture.ts';
    return (await import(path)).rotationState();
  });
  // The visible red X-axis arrow in the fixed 1440 × 960 test viewport.
  await page.mouse.move(700, 555);
  await page.mouse.down();
  await page.mouse.move(750, 575, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByLabel('Position X', { exact: true })).not.toHaveValue(initial);
  const after = await page.evaluate(async () => {
    const path = '/e2e/rotation-fixture.ts';
    return (await import(path)).rotationState();
  });
  expect(after.pose.quaternionXYZW).toEqual(before.pose.quaternionXYZW);
  expect(after.history).toBe(before.history + 1);
  await page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true }).click();
  await page.getByRole('button', { name: 'front_camera', exact: true }).click();
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue(initial);
});
