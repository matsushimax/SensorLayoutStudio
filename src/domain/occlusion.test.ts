import { describe, expect, it } from 'vitest';
import {
  BoxGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import { LineSegments2, LineSegmentsGeometry, LineMaterial } from 'three-stdlib';
import { collectOcclusionMeshes, createOcclusionWorld } from './occlusion';
import { mergeOcclusionTriangles } from './visibilityMesh';
import { createSensor } from './scene';
import { identityPose } from './types';
import { rpyToQuaternion } from './pose';
import { occludedFovGeometry } from '../viewer/occludedGeometry';

const origin = new Vector3(),
  forward = new Vector3(1, 0, 0);
function box(x: number, size = 1): Mesh {
  const mesh = new Mesh(new BoxGeometry(size, size, size), new MeshBasicMaterial());
  mesh.position.x = x;
  mesh.userData.occluder = true;
  return mesh;
}
function root(...objects: Mesh[]) {
  const group = new Group();
  group.add(...objects);
  return group;
}
describe('first-surface occlusion', () => {
  it('excludes mesh-based display strokes under tagged solids in both CPU and GPU snapshots', () => {
    const obstacle = box(3);
    const geometry = new LineSegmentsGeometry().setPositions([0, 0, 0, 1, 1, 1]);
    const outline = new LineSegments2(geometry, new LineMaterial());
    // Exactly the hierarchy produced by Drei <Edges> on each obstacle/rover part.
    obstacle.add(outline);
    expect(outline).toBeInstanceOf(Mesh);
    const meshes = collectOcclusionMeshes(obstacle);
    expect(meshes).toHaveLength(1);
    expect(meshes[0].geometry).toBe(obstacle.geometry);
    const snapshot = mergeOcclusionTriangles(meshes);
    expect(snapshot.getAttribute('position').count / 3).toBe(12);
    const world = createOcclusionWorld(obstacle);
    // This misses the real box but used to hit the stroke's template at z=0.
    expect(world.firstHit(new Vector3(2.25, 1.5, 2), new Vector3(0, 0, -1), 4)).toBeNull();
    expect(world.firstHit(origin, forward, 10)).toBeCloseTo(2.5, 7);
    snapshot.dispose();
    geometry.dispose();
    outline.material.dispose();
  });
  it('stops at the nearest surface regardless of blocker insertion order', () => {
    const world = createOcclusionWorld(root(box(7), box(3)));
    expect(world.firstHit(origin, forward, 10)).toBeCloseTo(2.5, 7);
    expect(world.firstHit(origin, forward, 2)).toBeNull();
  });
  it('ignores untagged gizmos/sensors and invisible blocker ancestors', () => {
    const sensor = box(1);
    sensor.userData.occluder = false;
    const hidden = root(box(2));
    hidden.visible = false;
    const group = root(sensor, box(5));
    group.add(hidden);
    const world = createOcclusionWorld(group);
    expect(world.meshCount).toBe(1);
    expect(world.firstHit(origin, forward, 10)).toBeCloseTo(4.5, 7);
  });
  it('inherits an imported-model tag and handles nested transforms/non-uniform scale', () => {
    const model = new Group();
    model.userData.occluder = true;
    model.position.set(6, 2, 1);
    model.scale.set(2, 3, 4);
    const mesh = box(0);
    mesh.userData.occluder = false;
    model.add(mesh);
    const index = Array.from(mesh.geometry.index!.array),
      side = (mesh.material as MeshBasicMaterial).side;
    const bounds = mesh.geometry.boundingBox;
    const world = createOcclusionWorld(model);
    expect(world.firstHit(new Vector3(0, 2, 1), forward, 10)).toBeCloseTo(5, 7);
    expect(Array.from(mesh.geometry.index!.array)).toEqual(index);
    expect((mesh.material as MeshBasicMaterial).side).toBe(side);
    expect(mesh.geometry.boundingBox).toBe(bounds);
    expect(side).not.toBe(DoubleSide);
  });
  it('handles very small valid model scales', () => {
    const mesh = box(0);
    mesh.scale.setScalar(1e-6);
    mesh.position.x = 1;
    expect(createOcclusionWorld(root(mesh)).firstHit(origin, forward, 2)).toBeCloseTo(
      1 - 0.5e-6,
      7,
    );
  });
  it('does not add an index to an unindexed source geometry', () => {
    const mesh = box(3);
    mesh.geometry = mesh.geometry.toNonIndexed();
    expect(createOcclusionWorld(root(mesh)).firstHit(origin, forward, 10)).toBeCloseTo(2.5, 7);
    expect(mesh.geometry.index).toBeNull();
  });
  it('clips against the imported static morph pose without changing source vertices', () => {
    const mesh = box(3),
      position = mesh.geometry.getAttribute('position');
    const morph = position.clone();
    for (let i = 0; i < morph.count; i++) morph.setX(i, morph.getX(i) + 1);
    mesh.geometry.morphAttributes.position = [morph];
    mesh.updateMorphTargets();
    mesh.morphTargetInfluences![0] = 1;
    expect(createOcclusionWorld(root(mesh)).firstHit(origin, forward, 10)).toBeCloseTo(3.5, 7);
    expect(mesh.geometry.getAttribute('position')).toBe(position);
  });
  it('hits backfaces from inside a body without mutating material sidedness', () => {
    const mesh = box(0, 2);
    expect(createOcclusionWorld(root(mesh)).firstHit(origin, forward, 10)).toBeCloseTo(1, 7);
  });
  it('handles instanced imported meshes independently', () => {
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), 2);
    mesh.userData.occluder = true;
    mesh.setMatrixAt(0, new Matrix4().makeTranslation(8, 0, 0));
    mesh.setMatrixAt(1, new Matrix4().makeTranslation(3, 0, 0));
    expect(createOcclusionWorld(root(mesh)).firstHit(origin, forward, 10)).toBeCloseTo(2.5, 7);
  });
  it('rebuilds transforms and visibility after moving or hiding an obstacle', () => {
    const obstacle = box(3),
      scene = root(obstacle);
    expect(createOcclusionWorld(scene).firstHit(origin, forward, 10)).toBeCloseTo(2.5, 7);
    obstacle.position.x = 6;
    expect(createOcclusionWorld(scene).firstHit(origin, forward, 10)).toBeCloseTo(5.5, 7);
    obstacle.visible = false;
    expect(createOcclusionWorld(scene).firstHit(origin, forward, 10)).toBeNull();
  });
});

describe('occluded camera and LiDAR geometry', () => {
  function wall() {
    const mesh = box(3);
    mesh.scale.set(0.2, 20, 20);
    return mesh;
  }
  it('clips every camera ray to a wall and never emits line endpoints beyond it', () => {
    const sensor = createSensor('camera', 'camera');
    sensor.pose = identityPose();
    const result = occludedFovGeometry(sensor, createOcclusionWorld(root(wall())));
    expect(result.stats.blocked).toBe(result.stats.samples);
    expect(result.stats.nearestHitM).toBeCloseTo(2.9, 6);
    for (const geometry of [result.lines, result.rays, result.surface]) {
      const positions = geometry.getAttribute('position');
      expect(positions.count).toBeGreaterThan(0);
      for (let i = 0; i < positions.count; i++)
        expect(positions.getX(i)).toBeLessThanOrEqual(2.90001);
    }
  });
  it('allows the unblocked angular samples around a small obstacle to continue', () => {
    const sensor = createSensor('camera', 'camera');
    sensor.pose = identityPose();
    const result = occludedFovGeometry(sensor, createOcclusionWorld(root(box(3, 0.6))));
    expect(result.stats.blocked).toBeGreaterThan(0);
    expect(result.stats.blocked).toBeLessThan(result.stats.samples);
    const positions = result.rays.getAttribute('position');
    expect(
      Array.from({ length: positions.count }, (_, i) => positions.getX(i)).some((x) => x > 4.9),
    ).toBe(true);
  });
  it('does not let a wall inside the near zone become invisible to occlusion', () => {
    const sensor = createSensor('camera', 'camera');
    sensor.pose = identityPose();
    sensor.params.nearM = 1;
    const obstacle = wall();
    obstacle.position.x = 0.5;
    const result = occludedFovGeometry(sensor, createOcclusionWorld(root(obstacle)));
    expect(result.stats.blocked).toBe(result.stats.samples);
    expect(result.rays.getAttribute('position').count).toBe(0);
    expect(result.surface.getAttribute('position').count).toBe(0);
  });
  it('keeps camera near/far as axial planes when there is no blocker', () => {
    const sensor = createSensor('camera', 'camera');
    sensor.pose = identityPose();
    const result = occludedFovGeometry(sensor, createOcclusionWorld(new Group()));
    expect(result.stats.blocked).toBe(0);
    const positions = result.rays.getAttribute('position');
    for (let i = 0; i < positions.count; i += 2) {
      expect(positions.getX(i)).toBeCloseTo(sensor.params.nearM, 5);
      expect(positions.getX(i + 1)).toBeCloseTo(sensor.params.farM, 5);
    }
  });
  it('clips 360-degree LiDAR in every direction and preserves the near cavity', () => {
    const sensor = createSensor('lidar', 'lidar');
    sensor.pose = identityPose();
    const shell = new Mesh(new SphereGeometry(2, 64, 32), new MeshBasicMaterial());
    shell.userData.occluder = true;
    const result = occludedFovGeometry(sensor, createOcclusionWorld(root(shell)));
    expect(result.stats.blocked).toBe(result.stats.samples);
    const positions = result.rays.getAttribute('position');
    for (let i = 0; i < positions.count; i += 2) {
      expect(Math.hypot(positions.getX(i), positions.getY(i), positions.getZ(i))).toBeCloseTo(
        sensor.params.nearM,
        5,
      );
      expect(
        Math.hypot(positions.getX(i + 1), positions.getY(i + 1), positions.getZ(i + 1)),
      ).toBeLessThanOrEqual(2.00001);
    }
  });
  it('keeps the unobstructed wide-angle camera far cap complete', () => {
    const sensor = createSensor('camera', 'wide');
    sensor.pose = identityPose();
    if (sensor.params.kind !== 'camera') throw new Error();
    sensor.params.horizontalFovDeg = 179;
    const result = occludedFovGeometry(sensor, createOcclusionWorld(new Group()));
    const positions = result.surface.getAttribute('position');
    const expectedWidth = sensor.params.farM * Math.tan((179 * Math.PI) / 360);
    expect(
      Array.from({ length: positions.count }, (_, i) => positions.getY(i)).some(
        (y) => Math.abs(y - expectedWidth) < 0.001,
      ),
    ).toBe(true);
  });
  it('transforms sensor directions correctly and clips downward rays at the ground', () => {
    const sensor = createSensor('camera', 'camera');
    sensor.pose = { positionM: [0, 0, 1], quaternionXYZW: rpyToQuaternion([0, 90, 0]) };
    const ground = new Mesh(new PlaneGeometry(100, 100), new MeshBasicMaterial());
    ground.userData.occluder = true;
    const result = occludedFovGeometry(sensor, createOcclusionWorld(root(ground)));
    expect(result.stats.blocked).toBe(result.stats.samples);
    expect(result.stats.nearestHitM).toBeCloseTo(1, 6);
  });
});
