import { expect, test } from '@playwright/test';

test('per-fragment visibility catches a thin blocker missed by the old angular grid', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/e2e/gpu-render-fixture.ts';
    const fixture = await import(path);
    return fixture.renderThinBlockerFixture();
  });
  expect(result.shaderErrors).toEqual([]);
  expect(result.sampledBlocked).toBe(0);
  expect(result.blockedPixelAlpha).toBe(0);
  expect(result.leftPixelAlpha).toBeGreaterThan(100);
  expect(result.rightPixelAlpha).toBeGreaterThan(100);
});

test('demo-height receiving surfaces do not speckle at coplanar or grazing incidence', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/e2e/gpu-render-fixture.ts';
    return (await import(path)).renderGrazingSurfaceFixture();
  });
  expect(result.coplanar).toBe(0);
  expect(result.reference).toBeGreaterThan(100);
  expect(result.grazing).toBe(result.reference);
});

test('silhouette side walls close the shadow and overlapping shadows remove interior walls', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/e2e/gpu-render-fixture.ts';
    return (await import(path)).renderShadowSideFixture();
  });
  expect(result.sideAlpha).toBeGreaterThan(100);
  expect(result.beforeNearAlpha).toBe(0);
  expect(result.outsideShadowAlpha).toBe(0);
  expect(result.hiddenSideAlpha).toBe(0);
});

test('first-contact overlay respects FOV limits and blockers before the near plane', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/e2e/gpu-render-fixture.ts';
    const fixture = await import(path);
    return fixture.renderContactFixture();
  });
  expect(result.holes).toBe(0);
  expect(result.contactAlpha).toBeGreaterThan(100);
  expect(result.preNearShadowAlpha).toBe(0);
  expect(result.outsideVerticalFovAlpha).toBe(0);
  expect(result.coplanarPixels).toBe(0);
  expect(result.lidarContactAlpha).toBeGreaterThan(100);
  expect(result.lidarOutsideElevationAlpha).toBe(0);
});
