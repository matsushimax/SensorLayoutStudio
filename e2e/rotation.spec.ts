import { expect, test } from '@playwright/test';

for (const name of ['front_camera', 'roof_lidar']) {
  test(`${name} rotates around X/Y/Z with mouse rings and preserves position and undo`, async ({
    page,
  }) => {
    await page.goto('/');
    // Exercise input independently of software GPU BVH shading costs.
    await page.getByLabel('Stop rays at surfaces').uncheck();
    for (const [index, axis] of ['X', 'Y', 'Z'].entries()) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.getByRole('button', { name: 'Move + Rotate', exact: true }).click();
      await expect(page.getByLabel('Rotation gizmo guide')).toBeVisible();
      await page.waitForTimeout(250);
      expect(
        await page.evaluate(async () => {
          const path = '/e2e/rotation-fixture.ts';
          return (await import(path)).gizmoRatio();
        }),
      ).toBeCloseTo(0.5, 2);
      if (index === 0) await page.screenshot({ path: `test-results/combined-${name}.png` });
      const before = await page.evaluate(async () => {
        const path = '/e2e/rotation-fixture.ts';
        return (await import(path)).rotationState();
      });
      const drag = await page.evaluate(async (axis) => {
        const path = '/e2e/rotation-fixture.ts';
        return (await import(path)).rotationDrag(axis);
      }, axis);
      await page.mouse.move(drag.x, drag.y);
      await page.mouse.down();
      await page.mouse.move(drag.endX, drag.endY, { steps: 8 });
      await page.mouse.up();
      const after = await page.evaluate(async () => {
        const path = '/e2e/rotation-fixture.ts';
        return (await import(path)).rotationState();
      });
      expect(after.pose.positionM).toEqual(before.pose.positionM);
      expect(Math.abs(after.pose.quaternionXYZW[index])).toBeGreaterThan(0.01);
      for (let i = 0; i < 3; i++)
        if (i !== index) expect(Math.abs(after.pose.quaternionXYZW[i])).toBeLessThan(1e-5);
      expect(after.history).toBe(before.history + 1);
      await page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true }).click();
      await page.getByRole('button', { name, exact: true }).click();
      const restored = await page.evaluate(async () => {
        const path = '/e2e/rotation-fixture.ts';
        return (await import(path)).rotationState();
      });
      expect(restored.pose).toEqual(before.pose);
    }
    await page.keyboard.press('w');
    await expect(page.getByLabel('Rotation gizmo guide')).toHaveCount(0);
    await page.keyboard.press('e');
    await expect(page.getByLabel('Rotation gizmo guide')).toBeVisible();
  });
}
