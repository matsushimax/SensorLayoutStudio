import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  exportTransforms,
  poseMatrix,
  quaternionToRpy,
  relativePose,
  rowMajor,
  rpyToQuaternion,
} from './pose';
import { createDemoScene, createPrimitive, createSensor, parseScene } from './scene';
import { identityPose, type Pose } from './types';
import { cameraCorners, intersectsFov } from './fov';

const closeArray = (a: number[], b: number[]) => {
  expect(a).toHaveLength(b.length);
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 8));
};
describe('coordinate contract', () => {
  it('exports identity and row-major translation', () => {
    expect(rowMajor(poseMatrix(identityPose()))).toEqual([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ]);
    const pose: Pose = { positionM: [1, 2, 3], quaternionXYZW: [0, 0, 0, 1] };
    expect(rowMajor(poseMatrix(pose))).toEqual([1, 0, 0, 1, 0, 1, 0, 2, 0, 0, 1, 3, 0, 0, 0, 1]);
  });
  it('rotates forward X into left Y for +90° yaw', () => {
    const q = rpyToQuaternion([0, 0, 90]);
    closeArray(
      new Vector3(1, 0, 0)
        .applyMatrix4(poseMatrix({ positionM: [0, 0, 0], quaternionXYZW: q }))
        .toArray(),
      [0, 1, 0],
    );
  });
  it('composes mixed fixed-axis RPY and round-trips the quaternion', () => {
    const q = rpyToQuaternion([25, -35, 70]);
    closeArray(quaternionToRpy(q), [25, -35, 70]);
    const r = (25 * Math.PI) / 180,
      p = (-35 * Math.PI) / 180,
      y = (70 * Math.PI) / 180;
    closeArray(
      new Vector3(1, 0, 0)
        .applyMatrix4(poseMatrix({ positionM: [0, 0, 0], quaternionXYZW: q }))
        .toArray(),
      [Math.cos(y) * Math.cos(p), Math.sin(y) * Math.cos(p), -Math.sin(p)],
    );
    const z = new Vector3(0, 0, 1).applyMatrix4(
      poseMatrix({ positionM: [0, 0, 0], quaternionXYZW: q }),
    );
    expect(z.z).toBeCloseTo(Math.cos(p) * Math.cos(r), 8);
  });
  it('calculates B coordinates in A with rotated and translated parents', () => {
    const a: Pose = { positionM: [1, 0, 0], quaternionXYZW: rpyToQuaternion([0, 0, 90]) };
    const b: Pose = { positionM: [1, 2, 0], quaternionXYZW: rpyToQuaternion([0, 0, 90]) };
    const relative = relativePose(a, b);
    closeArray(relative.positionM, [2, 0, 0]);
    closeArray(relative.quaternionXYZW, [0, 0, 0, 1]);
    closeArray(rowMajor(poseMatrix(a).multiply(poseMatrix(relative))), rowMajor(poseMatrix(b)));
  });
  it('exports every ordered sensor pair, units, storage, and matching poses', () => {
    const scene = createDemoScene();
    scene.sensors[0].pose = {
      positionM: [1.2, -0.3, 2],
      quaternionXYZW: rpyToQuaternion([20, 15, 45]),
    };
    const output = exportTransforms(scene);
    expect(output.relativeTransforms).toHaveLength(2);
    expect(output.convention.matrixStorage).toBe('row-major');
    closeArray(
      output.sensors[0].matrix,
      rowMajor(
        poseMatrix({
          positionM: output.sensors[0].translationM,
          quaternionXYZW: output.sensors[0].quaternionXYZW,
        }),
      ),
    );
    closeArray(output.sensors[0].translationM, [1.2, -0.3, 2]);
  });
});
describe('scene validation and round-trip', () => {
  it('preserves poses, settings, opacity and primitive dimensions', () => {
    const scene = createDemoScene();
    expect(parseScene(JSON.stringify(scene))).toEqual(scene);
  });
  it('normalizes quaternions and rejects zero quaternions', () => {
    const scene = createDemoScene();
    scene.sensors[0].pose.quaternionXYZW = [0, 0, 0, 2];
    expect(parseScene(JSON.stringify(scene)).sensors[0].pose.quaternionXYZW).toEqual([0, 0, 0, 1]);
    scene.sensors[0].pose.quaternionXYZW = [0, 0, 0, 0];
    expect(() => parseScene(JSON.stringify(scene))).toThrow('non-zero');
  });
  it('rejects duplicate ids, invalid ranges, unknown versions, and absolute model paths', () => {
    const scene = createDemoScene();
    scene.sensors[1].id = scene.sensors[0].id;
    expect(() => parseScene(JSON.stringify(scene))).toThrow('Duplicate');
    const bad = createDemoScene();
    bad.sensors[0].params.farM = 0;
    expect(() => parseScene(JSON.stringify(bad))).toThrow('Far');
    expect(() => parseScene(JSON.stringify({ ...createDemoScene(), schemaVersion: '99' }))).toThrow(
      'version',
    );
    const model = {
      fileName: 'C:\\private\\model.glb',
      poseInBase: identityPose(),
      scaleFactor: 1,
      visible: true,
    };
    expect(() => parseScene(JSON.stringify({ ...createDemoScene(), model }))).toThrow('path');
  });
  it('does not change the source scene when validation fails', () => {
    const scene = createDemoScene(),
      before = JSON.stringify(scene);
    expect(() => parseScene('{broken')).toThrow();
    expect(JSON.stringify(scene)).toBe(before);
  });
});
describe('conservative FOV intersection', () => {
  it('uses X-forward camera corners and rejects objects behind, outside and beyond', () => {
    const s = createSensor('camera', 'c');
    s.pose = identityPose();
    const p = createPrimitive('sphere', 'p');
    p.dimensionsM = [0.1, 0.1, 0.1];
    p.pose.positionM = [2, 0, 0];
    expect(intersectsFov(s, p)).toBe(true);
    for (const pos of [
      [-2, 0, 0],
      [2, 10, 0],
      [8, 0, 0],
      [0, 0, 0],
    ] as [number, number, number][]) {
      p.pose.positionM = pos;
      expect(intersectsFov(s, p)).toBe(false);
    }
    const corners = cameraCorners(s);
    expect(corners).toHaveLength(8);
    expect(corners[0][0]).toBe(s.params.nearM);
  });
  it('evaluates obstacles in the sensor local frame', () => {
    const s = createSensor('camera', 'c');
    s.pose = { positionM: [1, 2, 3], quaternionXYZW: rpyToQuaternion([0, 0, 90]) };
    const p = createPrimitive('sphere', 'p');
    p.dimensionsM = [0.1, 0.1, 0.1];
    p.pose.positionM = [1, 4, 3];
    expect(intersectsFov(s, p)).toBe(true);
    p.pose.positionM = [3, 2, 3];
    expect(intersectsFov(s, p)).toBe(false);
  });
  it('finds possible partial intersections even if a center is outside the camera', () => {
    const s = createSensor('camera', 'c');
    s.pose = identityPose();
    const p = createPrimitive('sphere', 'p');
    p.dimensionsM = [0.6, 0.6, 0.6];
    p.pose.positionM = [5.4, 0, 0];
    expect(intersectsFov(s, p)).toBe(true);
  });
  it('handles LiDAR 360°, near hole, elevations, and azimuth crossing ±180°', () => {
    const s = createSensor('lidar', 'l');
    s.pose = identityPose();
    const p = createPrimitive('sphere', 'p');
    p.dimensionsM = [0.01, 0.01, 0.01];
    p.pose.positionM = [-2, 0, 0];
    expect(intersectsFov(s, p)).toBe(true);
    p.pose.positionM = [0.1, 0, 0];
    expect(intersectsFov(s, p)).toBe(false);
    p.pose.positionM = [1, 0, 2];
    expect(intersectsFov(s, p)).toBe(false);
    if (s.params.kind !== 'lidar') throw new Error();
    s.params.azimuthStartDeg = 170;
    s.params.azimuthSpanDeg = 25;
    p.pose.positionM = [-2, -0.1, 0];
    expect(intersectsFov(s, p)).toBe(true);
    p.pose.positionM = [2, 0, 0];
    expect(intersectsFov(s, p)).toBe(false);
  });
});
