import { describe, expect, it } from 'vitest';
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { Ray } from 'three';
import { collectOcclusionMeshes } from './occlusion';
import { mergeOcclusionTriangles } from './visibilityMesh';

describe('world-space visibility triangle snapshot', () => {
  it('keeps full thin-blocker geometry instead of reducing it to angular samples', () => {
    const mesh = new Mesh(new BoxGeometry(0.01, 0.02, 10), new MeshBasicMaterial());
    mesh.position.set(2, 0.05078125, 0);
    mesh.userData.occluder = true;
    const geometry = mergeOcclusionTriangles(collectOcclusionMeshes(mesh));
    const tree = new MeshBVH(geometry);
    const direction = new Vector3(4, 0.1015625, 0).normalize();
    expect(tree.raycastFirst(new Ray(new Vector3(), direction))).not.toBeNull();
    expect(geometry.getAttribute('position').count).toBe(36);
  });
  it('bakes nested transforms and instances without changing source buffers', () => {
    const root = new Group();
    root.position.x = 5;
    root.scale.set(2, 3, 4);
    root.userData.occluder = true;
    const source = new BoxGeometry(1, 1, 1),
      before = Array.from(source.getAttribute('position').array);
    const instances = new InstancedMesh(source, new MeshBasicMaterial(), 2);
    instances.setMatrixAt(0, new Matrix4().makeTranslation(2, 0, 0));
    instances.setMatrixAt(1, new Matrix4().makeTranslation(5, 0, 0));
    root.add(instances);
    const geometry = mergeOcclusionTriangles(collectOcclusionMeshes(root));
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.x).toBeCloseTo(8, 6);
    expect(geometry.boundingBox!.max.x).toBeCloseTo(16, 6);
    expect(Array.from(source.getAttribute('position').array)).toEqual(before);
  });
  it('honors draw ranges and ignores invisible ancestors and untagged helpers', () => {
    const root = new Group(),
      blocker = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    blocker.userData.occluder = true;
    blocker.geometry.setDrawRange(0, 3);
    root.add(blocker);
    root.add(new Mesh(new BoxGeometry(100, 100, 100), new MeshBasicMaterial()));
    const hidden = new Group();
    hidden.visible = false;
    hidden.userData.occluder = true;
    hidden.add(new Mesh(new BoxGeometry(100, 100, 100), new MeshBasicMaterial()));
    root.add(hidden);
    const geometry = mergeOcclusionTriangles(collectOcclusionMeshes(root));
    expect(geometry.getAttribute('position').count).toBe(3);
  });
});
