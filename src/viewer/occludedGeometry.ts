import { BufferGeometry, Float32BufferAttribute, Quaternion, Vector3 } from 'three';
import { degToRad } from '../domain/pose';
import type { OcclusionStats, OcclusionWorld } from '../domain/occlusion';
import type { Sensor, Vec3 } from '../domain/types';

export type FovGeometry = {
  surface: BufferGeometry;
  lines: BufferGeometry;
  rays?: BufferGeometry;
  stats?: OcclusionStats;
};
export type SampledFov = FovGeometry & { rays: BufferGeometry; stats: OcclusionStats };

type Sample = { near: Vec3; far: Vec3; valid: boolean; hit: boolean; distance: number };

/** Angular ray samples end at the first physical surface, or the configured far plane. */
export function occludedFovGeometry(sensor: Sensor, world: OcclusionWorld): SampledFov {
  const p = sensor.params,
    camera = p.kind === 'camera';
  const columns = camera ? 48 : Math.max(4, Math.ceil(p.azimuthSpanDeg / 2));
  const rows = camera ? 32 : Math.max(2, Math.ceil((p.elevationMaxDeg - p.elevationMinDeg) / 2));
  const rotation = new Quaternion(...sensor.pose.quaternionXYZW).normalize();
  const origin = new Vector3(...sensor.pose.positionM);
  const direction = new Vector3(),
    worldDirection = new Vector3();
  const samples: Sample[][] = [];
  const stats: OcclusionStats = { samples: 0, blocked: 0, nearestHitM: null };
  for (let y = 0; y <= rows; y++) {
    const row: Sample[] = [];
    for (let x = 0; x <= columns; x++) {
      if (camera) {
        direction
          .set(
            1,
            ((2 * x) / columns - 1) * Math.tan(degToRad(p.horizontalFovDeg) / 2),
            ((2 * y) / rows - 1) * Math.tan(degToRad(p.verticalFovDeg) / 2),
          )
          .normalize();
      } else {
        const az = degToRad(p.azimuthStartDeg + (p.azimuthSpanDeg * x) / columns);
        const el = degToRad(
          p.elevationMinDeg + ((p.elevationMaxDeg - p.elevationMinDeg) * y) / rows,
        );
        direction.set(Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el));
      }
      const nearDistance = camera ? p.nearM / direction.x : p.nearM;
      const farDistance = camera ? p.farM / direction.x : p.farM;
      worldDirection.copy(direction).applyQuaternion(rotation);
      const hit = world.firstHit(origin, worldDirection, farDistance);
      stats.samples++;
      if (hit !== null) {
        stats.blocked++;
        stats.nearestHitM = stats.nearestHitM === null ? hit : Math.min(stats.nearestHitM, hit);
      }
      const end = hit ?? farDistance;
      row.push({
        near: direction.clone().multiplyScalar(nearDistance).toArray(),
        far: direction.clone().multiplyScalar(end).toArray(),
        valid: end >= nearDistance,
        hit: hit !== null,
        distance: end,
      });
    }
    samples.push(row);
  }
  const vertices: number[] = [],
    edges: number[] = [],
    rays: number[] = [];
  const triangle = (a: Vec3, b: Vec3, c: Vec3) => vertices.push(...a, ...b, ...c);
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => {
    triangle(a, b, c);
    triangle(a, c, d);
  };
  const line = (a: Vec3, b: Vec3) => edges.push(...a, ...b);
  // Do not stretch a far-surface triangle across a depth discontinuity. This
  // leaves an opening at shadow edges rather than a false illuminated curtain.
  const continuous = (cell: Sample[]) => {
    if (!cell.every((s) => s.valid)) return false;
    // The unoccluded camera cap is one axial plane even when wide-angle rays
    // have very different radial lengths. It must remain a complete surface.
    if (cell.every((s) => !s.hit)) return true;
    const distances = cell.map((s) => s.distance);
    return (
      Math.max(...distances) - Math.min(...distances) <=
      Math.max(0.15, Math.min(...distances) * 0.2)
    );
  };
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++) {
      const cell = [samples[y][x], samples[y][x + 1], samples[y + 1][x + 1], samples[y + 1][x]];
      if (continuous(cell)) quad(cell[0].far, cell[1].far, cell[2].far, cell[3].far);
      if (cell.every((s) => s.valid)) quad(cell[3].near, cell[2].near, cell[1].near, cell[0].near);
    }
  const boundary = (a: Sample, b: Sample) => {
    if (!a.valid || !b.valid) return;
    if (continuous([a, b])) {
      quad(a.near, a.far, b.far, b.near);
      line(a.far, b.far);
    }
    line(a.near, b.near);
  };
  for (let x = 0; x < columns; x++) {
    boundary(samples[0][x], samples[0][x + 1]);
    boundary(samples[rows][x], samples[rows][x + 1]);
  }
  if (camera || p.azimuthSpanDeg < 360)
    for (let y = 0; y < rows; y++) {
      boundary(samples[y][0], samples[y + 1][0]);
      boundary(samples[y][columns], samples[y + 1][columns]);
    }
  const strideX = Math.max(1, Math.round(columns / (camera ? 12 : 60)));
  const strideY = Math.max(1, Math.round(rows / (camera ? 8 : 8)));
  for (let y = 0; y <= rows; y++)
    for (let x = 0; x <= columns; x++) {
      const sample = samples[y][x];
      if (!sample.valid) continue;
      if ((x % strideX === 0 || x === columns) && (y % strideY === 0 || y === rows))
        rays.push(...sample.near, ...sample.far);
      if (x < columns && (y === 0 || y === rows) && continuous([sample, samples[y][x + 1]]))
        line(sample.far, samples[y][x + 1].far);
    }
  const geometry = (positions: number[]) => {
    const result = new BufferGeometry();
    result.setAttribute('position', new Float32BufferAttribute(positions, 3));
    return result;
  };
  const surface = geometry(vertices);
  surface.computeVertexNormals();
  return { surface, lines: geometry(edges), rays: geometry(rays), stats };
}
