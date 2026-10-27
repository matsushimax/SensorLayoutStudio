import { Box3, Plane, Sphere, Vector3 } from 'three';
import { degToRad, poseMatrix } from './pose';
import type { Primitive, Sensor, Vec3 } from './types';

export function cameraCorners(sensor: Sensor): Vec3[] {
  if (sensor.params.kind !== 'camera') return [];
  const { nearM, farM, horizontalFovDeg, verticalFovDeg } = sensor.params;
  return [nearM, farM].flatMap((d) => {
    const w = d * Math.tan(degToRad(horizontalFovDeg) / 2);
    const h = d * Math.tan(degToRad(verticalFovDeg) / 2);
    return [
      [d, -w, -h],
      [d, w, -h],
      [d, w, h],
      [d, -w, h],
    ] as Vec3[];
  });
}

export function primitiveRadius(p: Primitive): number {
  const [x, y, z] = p.dimensionsM;
  if (p.shape === 'sphere') return x;
  if (p.shape === 'cylinder') return Math.hypot(x, z / 2);
  return Math.hypot(x, y, z) / 2;
}

// Conservative broad phase: a disjoint result proves separation. A possible result
// can be a false positive and does not imply visibility, detection or collision.
export function intersectsFov(sensor: Sensor, obstacle: Primitive): boolean {
  const center = new Vector3(...obstacle.pose.positionM).applyMatrix4(
    poseMatrix(sensor.pose).invert(),
  );
  const radius = primitiveRadius(obstacle),
    p = sensor.params;
  if (p.kind === 'camera') {
    const w = Math.tan(degToRad(p.horizontalFovDeg) / 2),
      h = Math.tan(degToRad(p.verticalFovDeg) / 2);
    const planes = [
      new Plane(new Vector3(1, 0, 0), -p.nearM),
      new Plane(new Vector3(-1, 0, 0), p.farM),
      new Plane(new Vector3(w, 1, 0).normalize(), 0),
      new Plane(new Vector3(w, -1, 0).normalize(), 0),
      new Plane(new Vector3(h, 0, 1).normalize(), 0),
      new Plane(new Vector3(h, 0, -1).normalize(), 0),
    ];
    return planes.every((plane) => plane.distanceToPoint(center) >= -radius);
  }
  const r = center.length();
  if (r - radius > p.farM || r + radius < p.nearM) return false;
  if (r <= radius) return true;
  const slack = Math.asin(Math.min(1, radius / r));
  const elevation = Math.atan2(center.z, Math.hypot(center.x, center.y));
  if (
    elevation + slack < degToRad(p.elevationMinDeg) ||
    elevation - slack > degToRad(p.elevationMaxDeg)
  )
    return false;
  if (p.azimuthSpanDeg >= 360) return true;
  const xy = Math.hypot(center.x, center.y);
  if (xy <= radius) return true;
  const azSlack = Math.asin(Math.min(1, radius / xy));
  const mid = degToRad(p.azimuthStartDeg + p.azimuthSpanDeg / 2);
  const delta = Math.atan2(
    Math.sin(Math.atan2(center.y, center.x) - mid),
    Math.cos(Math.atan2(center.y, center.x) - mid),
  );
  return Math.abs(delta) <= degToRad(p.azimuthSpanDeg / 2) + azSlack;
}

export function sceneBounds(sensors: Sensor[], primitives: Primitive[]): Box3 {
  const bounds = new Box3(new Vector3(-2, -1.3, 0), new Vector3(2, 1.3, 2.2));
  for (const object of [...sensors, ...primitives]) {
    if (!object.visible) continue;
    const center = new Vector3(...object.pose.positionM);
    const r = 'shape' in object ? primitiveRadius(object) : 0.3;
    bounds.union(new Box3().setFromCenterAndSize(center, new Vector3(r * 2, r * 2, r * 2)));
  }
  return bounds;
}
export const boundingSphere = (bounds: Box3) => bounds.getBoundingSphere(new Sphere());
