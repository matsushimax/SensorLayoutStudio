import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('relative editing keeps placement on switch, composes model axes, and previews exact export', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const path = '/src/state/store.ts';
    const { useStudio } = await import(path);
    const s = useStudio.getState();
    s.toggleOcclusion();
    s.commit({
      ...s.scene,
      model: {
        fileName: 'reference.glb',
        scaleFactor: 100,
        visible: true,
        poseInBase: { positionM: [10, 20, 30], quaternionXYZW: [0, 0, Math.SQRT1_2, Math.SQRT1_2] },
      },
    });
  });
  const read = () =>
    page.evaluate(async () => {
      const path = '/src/state/store.ts';
      const s = (await import(path)).useStudio.getState();
      return { scene: s.scene, history: s.past.length };
    });
  const before = await read();
  await page.getByLabel('Edit relative to').selectOption('model');
  expect(await read()).toEqual(before);
  const x = page.getByLabel('Position X', { exact: true });
  await x.fill('2');
  await x.press('Enter');
  const after = await read();
  expect(after.scene.sensors[0].pose.positionM[1]).toBeCloseTo(22, 8);
  expect(after.scene.sensors[0].pose.positionM[0]).toBeCloseTo(
    before.scene.sensors[0].pose.positionM[0],
    8,
  );
  expect(after.history).toBe(before.history + 1);
  await page.getByLabel('Edit relative to').selectOption(`sensor:${before.scene.sensors[1].id}`);
  const sensorRelative = await read();
  expect(sensorRelative).toEqual(after);
  await page.getByRole('button', { name: 'Preview transforms', exact: true }).click();
  await page.getByLabel('Preview reference').selectOption(`sensor:${before.scene.sensors[1].id}`);
  await expect(page.getByLabel('Relative position', { exact: true })).toHaveText('1.65, 22, -0.85');
  await page.screenshot({ path: 'test-results/transform-preview.png' });
  await page.getByText('Exact export JSON · all sensor transforms', { exact: true }).click();
  const json = await page.getByLabel('Export JSON preview').inputValue();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save transforms JSON', exact: true }).click();
  expect(JSON.parse(await readFile((await (await download).path())!, 'utf8'))).toEqual(
    JSON.parse(json),
  );
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  expect(await read()).toEqual(sensorRelative);
  await page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true }).click();
  expect((await read()).scene).toEqual(before.scene);
});

test('untouched numeric fields preserve full precision and duplicate names get numbered', async ({
  page,
}) => {
  await page.goto('/');
  const before = await page.evaluate(async () => {
    const path = '/src/state/store.ts';
    const { useStudio } = await import(path);
    const s = useStudio.getState();
    s.toggleOcclusion();
    s.updatePose(s.scene.sensors[0].id, {
      positionM: [1.234567, 0, 1.1],
      quaternionXYZW: [0, 0, 0, 1],
    });
    return useStudio.getState().past.length;
  });
  const field = page.getByLabel('Position X', { exact: true });
  await field.focus();
  await field.press('Tab');
  expect(
    await page.evaluate(async () => {
      const path = '/src/state/store.ts';
      const s = (await import(path)).useStudio.getState();
      return { x: s.scene.sensors[0].pose.positionM[0], history: s.past.length };
    }),
  ).toEqual({ x: 1.234567, history: before });
  await page.getByLabel('Name', { exact: true }).fill('roof_lidar');
  await page.getByLabel('Name', { exact: true }).press('Enter');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('roof_lidar_2');
  await expect(page.getByRole('button', { name: 'roof_lidar', exact: true })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('roof_lidar');
  await page.getByLabel('Name', { exact: true }).press('Enter');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('roof_lidar_2');
});
