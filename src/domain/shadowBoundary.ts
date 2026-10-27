import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { degToRad, poseMatrix } from './pose';
import type { Sensor } from './types';

export type ShadowEdge = { a: Vector3; b: Vector3; opposite: Vector3[] };

/** Weld positions across material/normal seams, without altering the render mesh. */
export function shadowEdges(geometry: BufferGeometry): ShadowEdge[] {
  const position = geometry.getAttribute('position'),
    index = geometry.index;
  const edges = new Map<string, ShadowEdge>();
  const vertex = (i: number) =>
    new Vector3().fromBufferAttribute(position, index ? index.getX(i) : i);
  const key = (p: Vector3) => `${p.x},${p.y},${p.z}`;
  for (let i = 0, count = index?.count ?? position.count; i + 2 < count; i += 3) {
    const points = [vertex(i), vertex(i + 1), vertex(i + 2)];
    for (let j = 0; j < 3; j++) {
      let a = points[j],
        b = points[(j + 1) % 3];
      let ka = key(a),
        kb = key(b);
      if (ka === kb) continue;
      if (ka > kb) {
        [a, b] = [b, a];
        [ka, kb] = [kb, ka];
      }
      const id = `${ka}/${kb}`;
      let edge = edges.get(id);
      if (!edge) {
        edge = { a, b, opposite: [] };
        edges.set(id, edge);
      }
      edge.opposite.push(points[(j + 2) % 3]);
    }
  }
  return [...edges.values()];
}

type Plane = { normal: Vector3; constant: number };
function clip(polygon: Vector3[], { normal, constant }: Plane): Vector3[] {
  const result: Vector3[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const da = normal.dot(a) + constant,
      db = normal.dot(b) + constant;
    if (da >= 0) result.push(a);
    if (da >= 0 !== db >= 0) result.push(a.clone().lerp(b, da / (da - db)));
  }
  return result;
}

/** Planar shadow sides from actual silhouette edges, not interpolated angular rays. */
export function shadowBoundaryGeometry(sensor: Sensor, edges: ShadowEdge[]): BufferGeometry {
  const transform = poseMatrix(sensor.pose),
    inverse = transform.clone().invert();
  const p = sensor.params;
  const reach =
    p.kind === 'camera'
      ? p.farM *
        Math.hypot(
          1,
          Math.tan(degToRad(p.horizontalFovDeg) / 2),
          Math.tan(degToRad(p.verticalFovDeg) / 2),
        )
      : p.farM;
  const planes: Plane[] = [];
  if (p.kind === 'camera') {
    const h = Math.tan(degToRad(p.horizontalFovDeg) / 2),
      v = Math.tan(degToRad(p.verticalFovDeg) / 2);
    planes.push(
      { normal: new Vector3(1, 0, 0), constant: -p.nearM },
      { normal: new Vector3(-1, 0, 0), constant: p.farM },
      { normal: new Vector3(h, 1, 0), constant: 0 },
      { normal: new Vector3(h, -1, 0), constant: 0 },
      { normal: new Vector3(v, 0, 1), constant: 0 },
      { normal: new Vector3(v, 0, -1), constant: 0 },
    );
  } else {
    for (const normal of [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]) {
      planes.push(
        { normal, constant: reach },
        { normal: normal.clone().negate(), constant: reach },
      );
    }
  }
  const vertices: number[] = [],
    freeNormals: number[] = [];
  for (const edge of edges) {
    const a = edge.a.clone().applyMatrix4(inverse),
      b = edge.b.clone().applyMatrix4(inverse);
    const normal = new Vector3().crossVectors(a, b);
    if (normal.lengthSq() < 1e-20) continue;
    normal.normalize();
    let positive = false,
      negative = false;
    for (const opposite of edge.opposite) {
      const distance = normal.dot(opposite.clone().applyMatrix4(inverse));
      positive ||= distance > 1e-7;
      negative ||= distance < -1e-7;
    }
    // Adjoining triangles on opposite projected sides fill the neighborhood:
    // this is an internal edge, even across separate mesh/material seams.
    if (positive === negative) continue;
    if (positive) normal.negate();
    const segment = b.clone().sub(a);
    const t = Math.max(0, Math.min(1, -a.dot(segment) / segment.lengthSq()));
    const distance = a.clone().addScaledVector(segment, t).length();
    if (distance < 1e-8 || distance > reach) continue;
    // Extrude the whole edge by one factor: its far line must lie outside
    // the sensing bound, including rays through the middle of a long edge.
    const factor = Math.max(1.01, (reach * 1.01) / distance);
    let polygon = [a, b, b.clone().multiplyScalar(factor), a.clone().multiplyScalar(factor)];
    for (const plane of planes) polygon = clip(polygon, plane);
    if (polygon.length < 3) continue;
    const worldNormal = normal.transformDirection(transform);
    polygon.forEach((point) => point.applyMatrix4(transform));
    for (let i = 1; i + 1 < polygon.length; i++) {
      const points = [polygon[0], polygon[i], polygon[i + 1]];
      if (
        new Vector3()
          .crossVectors(points[1].clone().sub(points[0]), points[2].clone().sub(points[0]))
          .lengthSq() < 1e-20
      )
        continue;
      for (const point of points) {
        vertices.push(...point.toArray());
        freeNormals.push(...worldNormal.toArray());
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('freeNormal', new Float32BufferAttribute(freeNormals, 3));
  geometry.computeVertexNormals();
  return geometry;
}
