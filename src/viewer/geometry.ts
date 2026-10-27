import { BufferGeometry, Float32BufferAttribute } from 'three';
import { cameraCorners } from '../domain/fov';
import { degToRad } from '../domain/pose';
import type { Sensor, Vec3 } from '../domain/types';

export function fovGeometry(
  sensor: Sensor,
  angularStepDeg = 5,
): { surface: BufferGeometry; lines: BufferGeometry } {
  const vertices: number[] = [],
    edges: number[] = [];
  const tri = (a: Vec3, b: Vec3, c: Vec3) => vertices.push(...a, ...b, ...c);
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => {
    tri(a, b, c);
    tri(a, c, d);
  };
  const line = (a: Vec3, b: Vec3) => edges.push(...a, ...b);
  if (sensor.params.kind === 'camera') {
    const c = cameraCorners(sensor);
    quad(c[0], c[1], c[2], c[3]);
    quad(c[4], c[7], c[6], c[5]);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      quad(c[i], c[j], c[j + 4], c[i + 4]);
      line(c[i], c[j]);
      line(c[i + 4], c[j + 4]);
      line(c[i], c[i + 4]);
    }
  } else {
    const p = sensor.params,
      azSteps = Math.max(4, Math.ceil(p.azimuthSpanDeg / angularStepDeg)),
      elSteps = Math.max(2, Math.ceil((p.elevationMaxDeg - p.elevationMinDeg) / angularStepDeg));
    const point = (r: number, a: number, e: number): Vec3 => {
      const az = degToRad(p.azimuthStartDeg + p.azimuthSpanDeg * a);
      const el = degToRad(p.elevationMinDeg + (p.elevationMaxDeg - p.elevationMinDeg) * e);
      return [r * Math.cos(el) * Math.cos(az), r * Math.cos(el) * Math.sin(az), r * Math.sin(el)];
    };
    for (let i = 0; i < azSteps; i++) {
      const a = i / azSteps,
        b = (i + 1) / azSteps;
      for (const r of [p.nearM, p.farM]) {
        for (let j = 0; j < elSteps; j++)
          quad(
            point(r, a, j / elSteps),
            point(r, b, j / elSteps),
            point(r, b, (j + 1) / elSteps),
            point(r, a, (j + 1) / elSteps),
          );
        for (const e of [0, 1]) line(point(r, a, e), point(r, b, e));
      }
      for (const e of [0, 1])
        quad(point(p.nearM, a, e), point(p.farM, a, e), point(p.farM, b, e), point(p.nearM, b, e));
      if (i % Math.max(1, Math.floor(azSteps / 12)) === 0)
        line(point(p.farM, a, 0), point(p.farM, a, 1));
    }
    if (p.azimuthSpanDeg < 360)
      for (const a of [0, 1]) {
        for (let j = 0; j < elSteps; j++)
          quad(
            point(p.nearM, a, j / elSteps),
            point(p.farM, a, j / elSteps),
            point(p.farM, a, (j + 1) / elSteps),
            point(p.nearM, a, (j + 1) / elSteps),
          );
        for (const e of [0, 1]) line(point(p.nearM, a, e), point(p.farM, a, e));
      }
  }
  const surface = new BufferGeometry(),
    lines = new BufferGeometry();
  surface.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  surface.computeVertexNormals();
  lines.setAttribute('position', new Float32BufferAttribute(edges, 3));
  return { surface, lines };
}
