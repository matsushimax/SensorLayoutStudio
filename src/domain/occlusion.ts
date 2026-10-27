import {
  DoubleSide,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  Object3D,
  Ray,
  Vector3,
  type BufferGeometry,
} from 'three';
import { MeshBVH, type MeshBVHOptions } from 'three-mesh-bvh';

const trees = new WeakMap<BufferGeometry, MeshBVH>();
const posedGeometry = new WeakMap<Mesh, BufferGeometry>();
const EPSILON_M = 1e-6;
type Blocker = { tree: MeshBVH; inverse: Matrix4 };
export type OcclusionMesh = { geometry: BufferGeometry; matrixWorld: Matrix4 };
export type OcclusionStats = { samples: number; blocked: number; nearestHitM: number | null };

export type OcclusionWorld = {
  /** Nearest surface along a normalized world-space ray, measured in meters. */
  firstHit: (origin: Vector3, direction: Vector3, maxDistance: number) => number | null;
  meshCount: number;
};

function staticGeometry(mesh: Mesh): BufferGeometry {
  if (
    !('isSkinnedMesh' in mesh && mesh.isSkinnedMesh) &&
    !mesh.morphTargetInfluences?.some((value) => value !== 0)
  )
    return mesh.geometry;
  let geometry = posedGeometry.get(mesh);
  if (!geometry) {
    // The app does not play animations. Capture the imported static skin/morph
    // pose without changing the render geometry or the shared source buffers.
    geometry = mesh.geometry.clone();
    const position = mesh.geometry.getAttribute('position'),
      vertices: number[] = [],
      point = new Vector3();
    for (let i = 0; i < position.count; i++) {
      mesh.getVertexPosition(i, point);
      vertices.push(...point.toArray());
    }
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.boundingBox = null;
    geometry.boundingSphere = null;
    posedGeometry.set(mesh, geometry);
  }
  return geometry;
}

/**
 * Snapshot only explicitly tagged blockers. The sensor meshes, gizmos, grid,
 * outlines and FOV overlays never participate. Do not mutate source geometry,
 * materials, or render transforms: the BVH uses indirect triangle indexing.
 */
export function collectOcclusionMeshes(root: Object3D): OcclusionMesh[] {
  root.updateMatrixWorld(true);
  const meshes: OcclusionMesh[] = [];
  const visit = (node: Object3D, tagged = false) => {
    if (!node.visible) return;
    // Drei Edges/Line use LineSegments2, which extends Mesh. Its position
    // buffer is a screen-space stroke template, NOT world-space triangles.
    // Inheriting a parent's occluder tag used to cast phantom rectangle shadows.
    if ('isLineSegments2' in node && node.isLineSegments2) return;
    const blocking = tagged || node.userData.occluder === true;
    if (blocking && node instanceof Mesh) {
      if ('isInstancedMesh' in node && node.isInstancedMesh) {
        const instance = node as import('three').InstancedMesh;
        const matrix = new Matrix4();
        for (let i = 0; i < instance.count; i++) {
          instance.getMatrixAt(i, matrix);
          meshes.push({
            geometry: instance.geometry,
            matrixWorld: node.matrixWorld.clone().multiply(matrix),
          });
        }
      } else {
        meshes.push({ geometry: staticGeometry(node), matrixWorld: node.matrixWorld.clone() });
      }
    }
    for (const child of node.children) visit(child, blocking);
  };
  visit(root);
  return meshes.filter(
    (mesh) => mesh.geometry.getAttribute('position') && mesh.matrixWorld.determinant() !== 0,
  );
}

export function createOcclusionWorld(root: Object3D): OcclusionWorld {
  const blockers: Blocker[] = collectOcclusionMeshes(root).map(({ geometry, matrixWorld }) => {
    let tree = trees.get(geometry);
    if (!tree) {
      // 0.8.x supports indirect indexing at runtime but omits it from its typings.
      const options: MeshBVHOptions & { indirect: boolean } = {
        indirect: true,
        setBoundingBox: false,
      };
      tree = new MeshBVH(geometry, options);
      trees.set(geometry, tree);
    }
    return { tree, inverse: matrixWorld.clone().invert() };
  });
  const ray = new Ray(),
    local = new Ray(),
    scaleDirection = new Vector3();
  return {
    meshCount: blockers.length,
    firstHit(origin, direction, maxDistance) {
      ray.set(origin, direction);
      let closest = maxDistance,
        found = false;
      for (const blocker of blockers) {
        const e = blocker.inverse.elements;
        scaleDirection.set(
          e[0] * direction.x + e[4] * direction.y + e[8] * direction.z,
          e[1] * direction.x + e[5] * direction.y + e[9] * direction.z,
          e[2] * direction.x + e[6] * direction.y + e[10] * direction.z,
        );
        const localUnitsPerMeter = scaleDirection.length();
        local.copy(ray).applyMatrix4(blocker.inverse);
        // Double-sided surfaces also stop rays when a sensor is inside a body.
        // Start at the sensor, not its near plane: a near-zone wall still blocks.
        const hit = blocker.tree.raycastFirst(
          local,
          DoubleSide,
          EPSILON_M * localUnitsPerMeter,
          closest * localUnitsPerMeter,
        );
        if (hit) {
          closest = Math.min(closest, hit.distance / localUnitsPerMeter);
          found = true;
        }
      }
      return found ? closest : null;
    },
  };
}
