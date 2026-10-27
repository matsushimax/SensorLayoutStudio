import { DataTexture, FloatType, RGBAFormat } from 'three';
import { degToRad, poseMatrix } from '../domain/pose';
import type { Sensor } from '../domain/types';

export type CommonSensorData = { texture: DataTexture; ids: string[]; dispose: () => void };

/** Seven RGBA texels per sensor, avoiding fixed-size shader uniform arrays. */
export function createCommonSensorData(sensors: Sensor[]): CommonSensorData {
  const data = new Float32Array(Math.max(1, sensors.length) * 28);
  sensors.forEach((sensor, i) => {
    const offset = i * 28,
      p = sensor.params;
    data.set(poseMatrix(sensor.pose).invert().elements, offset);
    data.set([...sensor.pose.positionM, p.kind === 'camera' ? 0 : 1], offset + 16);
    data.set(
      p.kind === 'camera'
        ? [
            Math.tan(degToRad(p.horizontalFovDeg) / 2),
            Math.tan(degToRad(p.verticalFovDeg) / 2),
            0,
            0,
          ]
        : [
            degToRad(p.azimuthStartDeg),
            degToRad(p.azimuthSpanDeg),
            degToRad(p.elevationMinDeg),
            degToRad(p.elevationMaxDeg),
          ],
      offset + 20,
    );
    data.set([p.nearM, p.farM, 0, 0], offset + 24);
  });
  const texture = new DataTexture(data, 7, Math.max(1, sensors.length), RGBAFormat, FloatType);
  texture.needsUpdate = true;
  return { texture, ids: sensors.map((s) => s.id), dispose: () => texture.dispose() };
}

export const commonVisibilityShader = /* glsl */ `
  uniform sampler2D uCommonSensors;
  uniform int uCommonCount;
  uniform int uCommonSelf;
  uniform vec3 uCommonColor;

  bool inOtherSensor(vec3 point, int kind, vec2 range, vec4 shape) {
    // Tolerate float interpolation on coincident FOV faces. This is a metric
    // tolerance, not a screen-space expansion of the common region.
    float tolerance = max(1e-5, length(point) * 2e-6);
    if (kind == 0) return point.x >= range.x - tolerance && point.x <= range.y + tolerance
      && abs(point.y) <= point.x * shape.x + tolerance
      && abs(point.z) <= point.x * shape.y + tolerance;
    float radius = length(point);
    if (radius < range.x - tolerance || radius > range.y + tolerance || radius < 1e-8) return false;
    float elevation = atan(point.z, length(point.xy));
    if (elevation < shape.z - 2e-6 || elevation > shape.w + 2e-6) return false;
    if (shape.y >= 6.2831852) return true;
    float azimuth = mod(atan(point.y, point.x) - shape.x + 12.566370614, 6.283185307);
    return azimuth <= shape.y + 2e-6 || azimuth >= 6.283185307 - 2e-6;
  }

  bool visibleToAllSelected(vec3 point) {
    if (uCommonCount < 2) return false;
    for (int i = 0; i < uCommonCount; i++) {
      if (i == uCommonSelf) continue;
      mat4 inverse = mat4(texelFetch(uCommonSensors, ivec2(0, i), 0),
        texelFetch(uCommonSensors, ivec2(1, i), 0),
        texelFetch(uCommonSensors, ivec2(2, i), 0),
        texelFetch(uCommonSensors, ivec2(3, i), 0));
      vec4 originKind = texelFetch(uCommonSensors, ivec2(4, i), 0);
      vec4 shape = texelFetch(uCommonSensors, ivec2(5, i), 0);
      vec2 range = texelFetch(uCommonSensors, ivec2(6, i), 0).xy;
      if (!inOtherSensor((inverse * vec4(point, 1.0)).xyz, int(originKind.w), range, shape)) return false;
      if (!uOcclusionEnabled) continue;
      vec3 delta = point - originKind.xyz;
      float distance = length(delta);
      if (distance < 1e-7) return false;
      if (uCap == 1 && abs(dot(vWorldNormal, delta)) <= 1e-5) return false;
      vec3 direction = delta / distance;
      uvec4 indices = uvec4(0u);
      vec3 normal = vec3(0.0), bary = vec3(0.0);
      float side = 0.0, hitDistance = 1e20;
      bool hit = bvhIntersectFirstHit(uBvh, originKind.xyz + direction * 1e-6, direction,
        indices, normal, bary, side, hitDistance);
      if (hit && uCap == 1) {
        vec3 vertex = texelFetch1D(uBvh.position, indices.x).xyz;
        if (abs(dot(normal, point - vertex)) <= max(1e-6, distance * 2e-7)) hit = false;
      }
      float epsilon = uCap == 1 ? max(5e-5, distance * 1e-5) : max(1e-5, distance * 2e-6);
      if (hit && hitDistance < distance - epsilon) return false;
    }
    return true;
  }
`;
