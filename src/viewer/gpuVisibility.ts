import {
  Color,
  DoubleSide,
  ShaderMaterial,
  Vector3,
  type BufferGeometry,
  type Object3D,
} from 'three';
import {
  MeshBVH,
  MeshBVHUniformStruct,
  shaderStructs,
  shaderIntersectFunction,
} from 'three-mesh-bvh';
import { collectOcclusionMeshes } from '../domain/occlusion';
import { mergeOcclusionTriangles } from '../domain/visibilityMesh';
import { shadowEdges, type ShadowEdge } from '../domain/shadowBoundary';
import { degToRad, poseMatrix } from '../domain/pose';
import type { Sensor } from '../domain/types';
import { commonVisibilityShader, type CommonSensorData } from './commonVisibility';

export type GpuVisibilityScene = {
  geometry: BufferGeometry;
  bvh: MeshBVHUniformStruct;
  triangleCount: number;
  edges: ShadowEdge[];
  dispose: () => void;
};

export function createGpuVisibilityScene(graph: Object3D): GpuVisibilityScene | null {
  const geometry = mergeOcclusionTriangles(collectOcclusionMeshes(graph));
  const triangleCount = geometry.getAttribute('position').count / 3;
  if (!triangleCount) {
    geometry.dispose();
    return null;
  }
  const tree = new MeshBVH(geometry, { maxDepth: 24, setBoundingBox: false });
  geometry.computeVertexNormals();
  const bvh = new MeshBVHUniformStruct();
  bvh.updateFrom(tree);
  return {
    geometry,
    bvh,
    triangleCount,
    edges: shadowEdges(geometry),
    dispose: () => {
      bvh.dispose();
      geometry.dispose();
    },
  };
}

const vertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vPlaneDistance;
  #ifdef SHADOW_BOUNDARY
    attribute vec3 freeNormal;
    varying vec3 vFreeNormal;
  #endif
  uniform vec3 uOrigin;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vPlaneDistance = dot(mat3(modelMatrix) * normal, world.xyz - uOrigin);
    #ifdef SHADOW_BOUNDARY
      vFreeNormal = freeNormal;
    #endif
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp usampler2D;
  precision highp isampler2D;
  ${shaderStructs}
  ${shaderIntersectFunction}
  uniform BVH uBvh;
  uniform vec3 uOrigin;
  uniform mat4 uWorldToSensor;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform bool uHighlightOccluded;
  uniform vec3 uBlindColor;
  uniform vec4 uShape; // camera: tan(h/2), tan(v/2), 0, 0; lidar: az start/span, el min/max
  uniform vec2 uRange;
  uniform int uKind;
  uniform int uCap;
  uniform bool uOcclusionEnabled;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vPlaneDistance;
  #ifdef SHADOW_BOUNDARY
    varying vec3 vFreeNormal;
  #endif

  ${commonVisibilityShader}

  bool inSensorVolume(vec3 point) {
    if (uKind == 0) {
      return point.x >= uRange.x && point.x <= uRange.y
        && abs(point.y) <= point.x * uShape.x
        && abs(point.z) <= point.x * uShape.y;
    }
    float radius = length(point);
    if (radius < uRange.x || radius > uRange.y || radius < 1e-8) return false;
    float elevation = atan(point.z, length(point.xy));
    if (elevation < uShape.z || elevation > uShape.w) return false;
    if (uShape.y >= 6.2831852) return true;
    float azimuth = mod(atan(point.y, point.x) - uShape.x + 12.566370614, 6.283185307);
    return azimuth <= uShape.y;
  }

  void main() {
    if (uCap == 1 && !inSensorVolume((uWorldToSensor * vec4(vWorldPosition, 1.0)).xyz)) discard;
    vec3 delta = vWorldPosition - uOrigin;
    float targetDistance = length(delta);
    if (targetDistance <= 1e-7) discard;
    vec3 direction = delta / targetDistance;
    if (uCap == 1) {
      // A coplanar sensor sees no area of this receiving surface. Avoid
      // unstable self-intersections when interpolation perturbs a grazing ray.
      if (abs(vPlaneDistance) <= 1e-5) discard;
    }
    // Offset only by a numerical self-intersection tolerance, never the near plane.
    // A surface overlay intersects its own triangle; allow a slightly larger
    // comparison tolerance there to avoid floating-point speckling at grazing angles.
    float epsilon = uCap == 1
      ? max(5e-5, targetDistance * 1e-5)
      : max(1e-5, targetDistance * 2e-6);
    #ifdef SHADOW_BOUNDARY
      if (!inSensorVolume((uWorldToSensor * vec4(vWorldPosition, 1.0)).xyz)) discard;
      // Test the unshadowed side of the exact silhouette plane. Testing the
      // edge itself would hit its casting triangle and erase the boundary.
      direction = normalize(delta + vFreeNormal * max(2e-5, targetDistance * 4e-6));
    #endif
    uvec4 faceIndices = uvec4(0u);
    vec3 faceNormal = vec3(0.0), barycoord = vec3(0.0);
    float side = 0.0, hitDistance = 1e20;
    bool hit = uOcclusionEnabled && bvhIntersectFirstHit(uBvh, uOrigin + direction * 1e-6, direction,
      faceIndices, faceNormal, barycoord, side, hitDistance);
    if (hit && uCap == 1) {
      // Compare distance to the actual hit plane, rather than a ray distance
      // amplified by a grazing incidence angle. A receiving triangle (or its
      // coplanar neighbor) must never shadow its own surface through rounding.
      vec3 hitVertex = texelFetch1D(uBvh.position, faceIndices.x).xyz;
      if (abs(dot(faceNormal, vWorldPosition - hitVertex)) <= max(1e-6, targetDistance * 2e-7)) hit = false;
    }
    bool blocked = hit && hitDistance < targetDistance - epsilon;
    bool blind = blocked;
    #ifdef SHADOW_BOUNDARY
      // This is the interface with the blind volume, not an internal wall.
      // Keep rejecting sides buried inside another obstacle's shadow.
      if (blocked) discard;
      blind = true;
    #else
      if (blocked && !uHighlightOccluded) discard;
    #endif
    vec3 color = uColor;
    float opacity = uOpacity;
    if (blind && uHighlightOccluded) {
      color = uBlindColor;
      // A screen-space hatch distinguishes dead zones even with custom sensor
      // colors. Alpha follows the sensor's opacity, including zero.
      float stripe = smoothstep(0.32, 0.42, fract((gl_FragCoord.x + gl_FragCoord.y) / 10.0));
      opacity = min(0.65, uOpacity * 2.2) * mix(0.58, 1.0, stripe);
    }
    if (uCommonCount >= 2) {
      opacity *= 0.55;
      vec3 commonPoint = vWorldPosition;
      #ifdef SHADOW_BOUNDARY
        commonPoint += vFreeNormal * max(2e-5, targetDistance * 4e-6);
      #endif
      if (!blocked && visibleToAllSelected(commonPoint)) {
        color = uCommonColor;
        opacity = min(0.65, uOpacity * 3.4);
      }
    }
    gl_FragColor = vec4(color, opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Every rendered fragment checks the full triangle BVH; no angular sample grid. */
export function visibilityMaterial(
  sensor: Sensor,
  scene: GpuVisibilityScene,
  cap: boolean,
  opacity: number,
  boundary = false,
  highlightOccluded = false,
): ShaderMaterial {
  const p = sensor.params;
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    defines: {
      BVH_STACK_DEPTH: 64,
      TRI_INTERSECT_EPSILON: '1e-7',
      ...(boundary ? { SHADOW_BOUNDARY: 1 } : {}),
    },
    uniforms: {
      uBvh: { value: scene.bvh },
      uOrigin: { value: new Vector3(...sensor.pose.positionM) },
      uWorldToSensor: { value: poseMatrix(sensor.pose).invert() },
      uColor: { value: new Color(sensor.color) },
      uOpacity: { value: opacity },
      uHighlightOccluded: { value: highlightOccluded },
      uBlindColor: { value: new Color('#cc355c') },
      uKind: { value: p.kind === 'camera' ? 0 : 1 },
      uCap: { value: cap ? 1 : 0 },
      uOcclusionEnabled: { value: true },
      uCommonSensors: { value: null },
      uCommonCount: { value: 0 },
      uCommonSelf: { value: -1 },
      uCommonColor: { value: new Color('#4f35ad') },
      uRange: { value: [p.nearM, p.farM] },
      uShape: {
        value:
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
      },
    },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: cap || boundary,
    polygonOffsetFactor: cap ? -2 : boundary ? 2 : 0,
    polygonOffsetUnits: cap ? -2 : boundary ? 2 : 0,
  });
}

export function updateVisibilityMaterial(
  material: ShaderMaterial,
  sensor: Sensor,
  scene: GpuVisibilityScene,
  opacity: number,
  highlightOccluded = false,
  common: CommonSensorData | null = null,
  occlusionEnabled = true,
): void {
  const p = sensor.params,
    u = material.uniforms;
  u.uBvh.value = scene.bvh;
  u.uOrigin.value.fromArray(sensor.pose.positionM);
  u.uWorldToSensor.value.copy(poseMatrix(sensor.pose).invert());
  u.uColor.value.set(sensor.color);
  u.uOpacity.value = opacity;
  u.uHighlightOccluded.value = highlightOccluded;
  u.uOcclusionEnabled.value = occlusionEnabled;
  u.uCommonSensors.value = common?.texture ?? null;
  u.uCommonCount.value = common?.ids.length ?? 0;
  u.uCommonSelf.value = common?.ids.indexOf(sensor.id) ?? -1;
  u.uKind.value = p.kind === 'camera' ? 0 : 1;
  u.uRange.value = [p.nearM, p.farM];
  u.uShape.value =
    p.kind === 'camera'
      ? [Math.tan(degToRad(p.horizontalFovDeg) / 2), Math.tan(degToRad(p.verticalFovDeg) / 2), 0, 0]
      : [
          degToRad(p.azimuthStartDeg),
          degToRad(p.azimuthSpanDeg),
          degToRad(p.elevationMinDeg),
          degToRad(p.elevationMaxDeg),
        ];
}
