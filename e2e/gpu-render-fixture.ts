import {
  BoxGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { createSensor } from '../src/domain/scene';
import { identityPose } from '../src/domain/types';
import { createOcclusionWorld } from '../src/domain/occlusion';
import { shadowBoundaryGeometry } from '../src/domain/shadowBoundary';
import { occludedFovGeometry } from '../src/viewer/occludedGeometry';
import {
  createGpuVisibilityScene,
  updateVisibilityMaterial,
  visibilityMaterial,
} from '../src/viewer/gpuVisibility';

/** A thin blocker deliberately placed between the previous 49 camera directions. */
export function renderThinBlockerFixture() {
  const root = new Group();
  const blocker = new Mesh(
    new BoxGeometry(0.01, 0.02, 10),
    new MeshBasicMaterial({ side: DoubleSide }),
  );
  blocker.position.set(2, 0.05078125, 0);
  blocker.userData.occluder = true;
  root.add(blocker);
  const sensor = createSensor('camera', 'test');
  sensor.pose = identityPose();
  if (sensor.params.kind !== 'camera') throw new Error();
  Object.assign(sensor.params, { horizontalFovDeg: 90, verticalFovDeg: 90, nearM: 0.1, farM: 4 });
  const sampled = occludedFovGeometry(sensor, createOcclusionWorld(root));
  const gpu = createGpuVisibilityScene(root)!;
  const material = visibilityMaterial(sensor, gpu, false, 0.7);
  const plane = new Mesh(new PlaneGeometry(4, 4), material);
  plane.rotation.y = Math.PI / 2;
  plane.position.x = 4;
  const scene = new Scene();
  scene.add(plane);
  const camera = new OrthographicCamera(-2, 2, 2, -2, 0.1, 20);
  camera.up.set(0, 0, 1);
  camera.position.set(6, 0, 0);
  camera.lookAt(4, 0, 0);
  const renderer = new WebGLRenderer({ antialias: false, alpha: true });
  renderer.setSize(256, 64);
  renderer.setClearColor(0x000000, 0);
  const shaderErrors: string[] = [];
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    shaderErrors.push(
      gl.getProgramInfoLog(program) ?? '',
      gl.getShaderInfoLog(vertex) ?? '',
      gl.getShaderInfoLog(fragment) ?? '',
    );
  };
  const target = new WebGLRenderTarget(256, 64);
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  const pixels = new Uint8Array(256 * 64 * 4);
  renderer.readRenderTargetPixels(target, 0, 0, 256, 64, pixels);
  const alpha = (x: number) => pixels[(32 * 256 + x) * 4 + 3];
  const result = {
    sampledBlocked: sampled.stats.blocked,
    blockedPixelAlpha: alpha(134),
    leftPixelAlpha: alpha(128),
    rightPixelAlpha: alpha(140),
    shaderErrors,
  };
  sampled.surface.dispose();
  sampled.lines.dispose();
  sampled.rays.dispose();
  gpu.dispose();
  plane.geometry.dispose();
  material.dispose();
  blocker.geometry.dispose();
  (blocker.material as MeshBasicMaterial).dispose();
  target.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return result;
}

/** Verify the contact pass, analytic FOV limits and blocking before the near plane. */
export function renderContactFixture() {
  const root = new Group();
  const wall = new Mesh(new PlaneGeometry(4, 4), new MeshBasicMaterial());
  wall.rotation.y = Math.PI / 2;
  wall.position.x = 2;
  wall.userData.occluder = true;
  const blocker = new Mesh(new BoxGeometry(0.02, 0.4, 4), new MeshBasicMaterial());
  blocker.position.set(1, 0.6, 0);
  blocker.userData.occluder = true;
  root.add(wall, blocker);
  const sensor = createSensor('camera', 'contact');
  sensor.pose = identityPose();
  if (sensor.params.kind !== 'camera') throw new Error();
  Object.assign(sensor.params, { horizontalFovDeg: 90, verticalFovDeg: 45, nearM: 1.5, farM: 3 });
  const gpu = createGpuVisibilityScene(root)!;
  const material = visibilityMaterial(sensor, gpu, true, 0.7);
  const scene = new Scene();
  scene.add(new Mesh(gpu.geometry, material));
  const camera = new OrthographicCamera(-2, 2, 2, -2, 0.1, 10);
  camera.up.set(0, 0, 1);
  camera.position.set(0, 0, 0);
  camera.lookAt(2, 0, 0);
  const renderer = new WebGLRenderer({ alpha: true });
  renderer.setSize(128, 128);
  renderer.setClearColor(0, 0);
  const target = new WebGLRenderTarget(128, 128);
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  const pixels = new Uint8Array(128 * 128 * 4);
  renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels);
  const alpha = (x: number, y: number) => pixels[(y * 128 + x) * 4 + 3];
  let holes = 0;
  for (let y = 48; y < 80; y++) {
    for (let x = 48; x < 80; x++) {
      if (alpha(x, y) < 100) holes++;
    }
  }
  const result = {
    holes,
    contactAlpha: alpha(64, 64),
    preNearShadowAlpha: alpha(26, 64),
    outsideVerticalFovAlpha: alpha(64, 110),
    coplanarPixels: 0,
    lidarContactAlpha: 0,
    lidarOutsideElevationAlpha: 0,
  };
  sensor.pose = {
    positionM: [2, -3, 0],
    quaternionXYZW: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
  };
  updateVisibilityMaterial(material, sensor, gpu, 0.7);
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels);
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] > 0) result.coplanarPixels++;
  }
  sensor.pose = identityPose();
  sensor.params = {
    kind: 'lidar',
    nearM: 1.5,
    farM: 3,
    azimuthStartDeg: 350,
    azimuthSpanDeg: 20,
    elevationMinDeg: -10,
    elevationMaxDeg: 10,
  };
  updateVisibilityMaterial(material, sensor, gpu, 0.7);
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels);
  result.lidarContactAlpha = alpha(64, 64);
  result.lidarOutsideElevationAlpha = alpha(64, 90);
  gpu.dispose();
  material.dispose();
  for (const mesh of [wall, blocker]) {
    mesh.geometry.dispose();
    (mesh.material as MeshBasicMaterial).dispose();
  }
  target.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return result;
}

/** Side-on pixels must show the shadow wall that shell-only masking omitted. */
export function renderShadowSideFixture() {
  const root = new Group();
  const blocker = new Mesh(new BoxGeometry(0.02, 1, 2), new MeshBasicMaterial());
  blocker.position.x = 2;
  blocker.userData.occluder = true;
  root.add(blocker);
  const sensor = createSensor('camera', 'sides');
  sensor.pose = identityPose();
  if (sensor.params.kind !== 'camera') throw new Error();
  Object.assign(sensor.params, { horizontalFovDeg: 90, verticalFovDeg: 90, nearM: 2.5, farM: 4 });
  const gpu = createGpuVisibilityScene(root)!;
  const boundary = shadowBoundaryGeometry(sensor, gpu.edges);
  const material = visibilityMaterial(sensor, gpu, false, 0.7, true);
  const scene = new Scene();
  scene.add(new Mesh(boundary, material));
  const camera = new OrthographicCamera(-4, 4, 4, -4, 0.1, 20);
  camera.up.set(0, 0, 1);
  camera.position.set(0, -10, 0);
  camera.lookAt(0, 0, 0);
  const renderer = new WebGLRenderer({ alpha: true });
  renderer.setSize(128, 128);
  renderer.setClearColor(0, 0);
  const target = new WebGLRenderTarget(128, 128);
  renderer.setRenderTarget(target);
  const pixels = new Uint8Array(128 * 128 * 4);
  const render = () => {
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels);
  };
  const alpha = (x: number, y: number) => pixels[(y * 128 + x) * 4 + 3];
  render();
  const result = {
    sideAlpha: alpha(112, 64),
    beforeNearAlpha: alpha(96, 64),
    outsideShadowAlpha: alpha(112, 104),
    hiddenSideAlpha: 255,
  };
  const foreground = new Mesh(new BoxGeometry(0.1, 3, 6), new MeshBasicMaterial());
  foreground.position.x = 1;
  foreground.userData.occluder = true;
  root.add(foreground);
  const overlapping = createGpuVisibilityScene(root)!;
  updateVisibilityMaterial(material, sensor, overlapping, 0.7);
  render();
  result.hiddenSideAlpha = alpha(112, 64);
  gpu.dispose();
  overlapping.dispose();
  boundary.dispose();
  material.dispose();
  for (const mesh of [blocker, foreground]) {
    mesh.geometry.dispose();
    (mesh.material as MeshBasicMaterial).dispose();
  }
  target.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return result;
}

/** The demo camera is exactly coplanar with the crate top (z = 1.1 m). */
export function renderGrazingSurfaceFixture() {
  const root = new Group();
  const top = new Mesh(new PlaneGeometry(0.85, 0.85), new MeshBasicMaterial());
  top.position.set(4.4, 0.4, 1.1);
  top.userData.occluder = true;
  root.add(top);
  const sensor = createSensor('camera', 'grazing');
  const gpu = createGpuVisibilityScene(root)!;
  const material = visibilityMaterial(sensor, gpu, true, 0.7);
  const scene = new Scene();
  scene.add(new Mesh(gpu.geometry, material));
  const camera = new PerspectiveCamera(15, 1, 0.1, 30);
  camera.up.set(0, 0, 1);
  camera.position.set(8, -7, 6);
  camera.lookAt(4.4, 0.4, 1.1);
  const renderer = new WebGLRenderer({ alpha: true });
  renderer.setSize(128, 128);
  renderer.setClearColor(0, 0);
  const target = new WebGLRenderTarget(128, 128);
  renderer.setRenderTarget(target);
  const pixels = new Uint8Array(128 * 128 * 4);
  const count = () => {
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels);
    let lit = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 100) lit++;
    return lit;
  };
  const coplanar = count();
  sensor.pose.positionM[2] = 1.101;
  updateVisibilityMaterial(material, sensor, gpu, 0.7);
  const grazing = count();
  sensor.pose.positionM[2] = 1.3;
  updateVisibilityMaterial(material, sensor, gpu, 0.7);
  const reference = count();
  gpu.dispose();
  material.dispose();
  top.geometry.dispose();
  (top.material as MeshBasicMaterial).dispose();
  target.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return { coplanar, grazing, reference };
}
