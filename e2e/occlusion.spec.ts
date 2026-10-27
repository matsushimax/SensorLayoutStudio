import { test, expect, type Page } from '@playwright/test';

const pose = (x: number, y = 0, z = 1.5) => ({
  positionM: [x, y, z],
  quaternionXYZW: [0, 0, 0, 1],
});
function scene() {
  return {
    schemaVersion: '0.1.0',
    unit: 'm',
    baseFrame: 'base_link',
    name: 'Occlusion / wall study',
    sensors: [
      {
        id: 'front',
        name: 'front_camera',
        parentFrame: 'base_link',
        pose: pose(2.5),
        params: { kind: 'camera', horizontalFovDeg: 60, verticalFovDeg: 40, nearM: 0.1, farM: 6 },
        color: '#078f9f',
        visible: true,
        opacity: 0.17,
      },
    ],
    primitives: [
      {
        id: 'wall',
        name: 'wall',
        shape: 'box',
        pose: pose(4),
        dimensionsM: [0.2, 10, 3],
        visible: true,
      },
    ],
  };
}
async function open(page: Page, data: unknown) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'occlusion.scene.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await page.getByRole('button', { name: 'front_camera', exact: true }).click();
}

test('camera preview stops at a wall, updates when moved/hidden, and can show the full FOV', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await open(page, scene());
  await expect(page.getByLabel('Nearest surface hit', { exact: true })).toHaveText('1.400 m');
  await expect(page.getByLabel('Clipped ray samples', { exact: true })).toHaveText('1617 / 1617');
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/screenshots/occlusion-wall.png', fullPage: true });
  await page.getByRole('button', { name: 'Hide wall', exact: true }).click();
  await expect(page.getByLabel('Clipped ray samples', { exact: true })).not.toHaveText(
    '1617 / 1617',
  );
  await page.getByRole('button', { name: 'Show wall', exact: true }).click();
  await expect(page.getByLabel('Nearest surface hit', { exact: true })).toHaveText('1.400 m');
  await page.getByRole('button', { name: 'wall', exact: true }).click();
  const x = page.getByLabel('Position X', { exact: true });
  await x.fill('5');
  await x.press('Enter');
  await page.getByRole('button', { name: 'front_camera', exact: true }).click();
  await expect(page.getByLabel('Nearest surface hit', { exact: true })).toHaveText('2.400 m');
  await page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true }).click();
  await page.getByRole('button', { name: 'front_camera', exact: true }).click();
  await expect(page.getByLabel('Nearest surface hit', { exact: true })).toHaveText('1.400 m');
  await page.getByRole('button', { name: 'Toggle occlusion', exact: true }).click();
  await expect(page.getByLabel('Stop rays at surfaces', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Nearest surface hit', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Toggle occlusion', exact: true }).click();
  await expect(page.getByLabel('Nearest surface hit', { exact: true })).toHaveText('1.400 m');
  expect(errors).toEqual([]);
});

test('relinked GLB blocks rays and its transform and scale update the clipping', async ({
  page,
}) => {
  await page.goto('/');
  const data = {
    ...scene(),
    primitives: [],
    model: { fileName: 'calibration-box.glb', poseInBase: pose(4), scaleFactor: 1, visible: true },
  };
  await open(page, data);
  const choose = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Locate model' }).click();
  await (await choose).setFiles('examples/calibration-box.glb');
  await page.getByRole('button', { name: 'front_camera', exact: true }).click();
  await expect(page.getByLabel('Nearest surface hit', { exact: true })).toHaveText('0.500 m');
  await page.getByRole('button', { name: /calibration-box.glb GLB/ }).click();
  const x = page.getByLabel('Position X', { exact: true });
  await x.fill('5');
  await x.press('Enter');
  const scale = page.getByLabel('Scale factor', { exact: true });
  await scale.fill('2');
  await scale.press('Enter');
  await page.getByRole('button', { name: 'front_camera', exact: true }).click();
  await expect(page.getByLabel('Nearest surface hit', { exact: true })).toHaveText('0.500 m');
});
