import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import type { OcclusionMesh } from './occlusion';

/** World-space triangle snapshot for per-fragment tests; source buffers stay untouched. */
export function mergeOcclusionTriangles(meshes: OcclusionMesh[]): BufferGeometry {
  const positions: number[] = [],
    point = new Vector3();
  for (const { geometry, matrixWorld } of meshes) {
    const source = geometry.getAttribute('position'),
      index = geometry.index;
    const count = index?.count ?? source.count;
    const start = geometry.drawRange.start;
    const end = Math.min(count, start + geometry.drawRange.count);
    // Rendered group ranges can have gaps; never turn an unrendered face into a blocker.
    const ranges = geometry.groups.length ? geometry.groups : [{ start: 0, count }];
    for (const range of ranges) {
      const first = Math.max(start, range.start),
        last = Math.min(end, range.start + range.count);
      for (let triangle = first; triangle + 2 < last; triangle += 3) {
        for (let corner = 0; corner < 3; corner++) {
          const i = index ? index.getX(triangle + corner) : triangle + corner;
          point.fromBufferAttribute(source, i).applyMatrix4(matrixWorld);
          positions.push(point.x, point.y, point.z);
        }
      }
    }
  }
  const result = new BufferGeometry();
  result.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return result;
}
