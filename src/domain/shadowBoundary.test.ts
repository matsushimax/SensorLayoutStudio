import { describe, expect, it } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { createSensor } from './scene';
import { identityPose } from './types';
import { collectOcclusionMeshes } from './occlusion';
import { mergeOcclusionTriangles } from './visibilityMesh';
import { shadowBoundaryGeometry, shadowEdges } from './shadowBoundary';
import { poseMatrix, rpyToQuaternion } from './pose';

function fixture() {
  const blocker = new Mesh(new BoxGeometry(0.2, 1, 1), new MeshBasicMaterial());
  blocker.position.x = 2;
  blocker.userData.occluder = true;
  const geometry = mergeOcclusionTriangles(collectOcclusionMeshes(blocker));
  const sensor = createSensor('camera', 'test');
  sensor.pose = identityPose();
  if (sensor.params.kind !== 'camera') throw new Error();
  Object.assign(sensor.params, { horizontalFovDeg: 90, verticalFovDeg: 90, nearM: 0.1, farM: 4 });
  return { geometry, sensor };
}

describe('silhouette shadow boundary', () => {
  it('joins the actual box silhouette to its analytic far-plane projection', () => {
    const { geometry, sensor } = fixture();
    const boundary = shadowBoundaryGeometry(sensor, shadowEdges(geometry));
    const position = boundary.getAttribute('position');
    expect(position.count).toBe(24); // Four planar quads; no internal box diagonals.
    const nearX = 2 - Math.fround(0.1);
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i),
        y = position.getY(i),
        z = position.getZ(i);
      expect(x).toBeGreaterThanOrEqual(nearX - 1e-6);
      expect(x).toBeLessThanOrEqual(4 + 1e-6);
      expect(Math.max(Math.abs(y / x), Math.abs(z / x))).toBeCloseTo(0.5 / nearX, 6);
    }
    expect(Array.from(position.array).some((_, i) => i % 3 === 0 && position.array[i] === 4)).toBe(
      true,
    );
  });
  it('clips shadow sides at near even when the caster is before near', () => {
    const { geometry, sensor } = fixture();
    sensor.params.nearM = 3;
    const boundary = shadowBoundaryGeometry(sensor, shadowEdges(geometry));
    boundary.computeBoundingBox();
    expect(boundary.boundingBox!.min.x).toBeCloseTo(3, 6);
    expect(boundary.boundingBox!.max.x).toBeCloseTo(4, 6);
  });
  it('preserves the projected shape under a common rigid transform', () => {
    const { geometry, sensor } = fixture();
    const reference = shadowBoundaryGeometry(sensor, shadowEdges(geometry));
    sensor.pose = { positionM: [7, -2, 4], quaternionXYZW: rpyToQuaternion([20, -10, 37]) };
    const transform = poseMatrix(sensor.pose);
    geometry.applyMatrix4(transform);
    const boundary = shadowBoundaryGeometry(sensor, shadowEdges(geometry));
    const inverse = transform.clone().invert();
    const points = (source: typeof boundary, toLocal = false) => {
      const p = source.getAttribute('position'),
        result: Vector3[] = [];
      for (let i = 0; i < p.count; i++) {
        const v = new Vector3().fromBufferAttribute(p, i);
        if (toLocal) v.applyMatrix4(inverse);
        result.push(v);
      }
      return result;
    };
    const actual = points(boundary, true),
      expected = points(reference);
    expect(actual.length).toBe(expected.length);
    actual.forEach((value) =>
      expect(expected.some((point) => point.distanceTo(value) < 1e-5)).toBe(true),
    );
  });
});
