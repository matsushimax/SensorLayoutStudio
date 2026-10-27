import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { createSensor } from '../src/domain/scene';
import { identityPose } from '../src/domain/types';
import {
  createGpuVisibilityScene,
  updateVisibilityMaterial,
  visibilityMaterial,
} from '../src/viewer/gpuVisibility';

export function renderBlindSpots() {
  const root = new Group();
  const blocker = new Mesh(new BoxGeometry(0.2, 0.6, 0.6), new MeshBasicMaterial());
  blocker.position.x = 2;
  const receiver = new Mesh(new PlaneGeometry(4, 4), new MeshBasicMaterial());
  receiver.rotation.y = Math.PI / 2;
  receiver.position.x = 4;
  for (const mesh of [blocker, receiver]) {
    mesh.userData.occluder = true;
    root.add(mesh);
  }
  const gpu = createGpuVisibilityScene(root)!;
  const sensor = createSensor('camera', 'test');
  sensor.pose = identityPose();
  sensor.params = { kind: 'camera', horizontalFovDeg: 90, verticalFovDeg: 30, nearM: 3, farM: 5 };
  const material = visibilityMaterial(sensor, gpu, true, 0.2, false, true);
  const scene = new Scene();
  const surface = new Mesh(receiver.geometry, material);
  surface.position.copy(receiver.position);
  surface.rotation.copy(receiver.rotation);
  scene.add(surface);
  const camera = new OrthographicCamera(-2, 2, 2, -2, 0.1, 20);
  camera.up.set(0, 0, 1);
  camera.position.set(6, 0, 0);
  camera.lookAt(4, 0, 0);
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
  const pixel = (x: number, y = 64) =>
    Array.from(pixels.slice((y * 128 + x) * 4, (y * 128 + x) * 4 + 4));
  render();
  const result = {
    cameraBlind: pixel(64),
    cameraVisible: pixel(100),
    cameraOutside: pixel(64, 115),
    lidarBlind: [] as number[],
    lidarVisible: [] as number[],
    lidarOutside: [] as number[],
    hidden: [] as number[],
    cleared: [] as number[],
    transparent: [] as number[],
  };
  sensor.params = {
    kind: 'lidar',
    azimuthStartDeg: -45,
    azimuthSpanDeg: 90,
    elevationMinDeg: -15,
    elevationMaxDeg: 15,
    nearM: 3,
    farM: 5,
  };
  updateVisibilityMaterial(material, sensor, gpu, 0.2, true);
  render();
  result.lidarBlind = pixel(64);
  result.lidarVisible = pixel(100);
  result.lidarOutside = pixel(64, 115);
  updateVisibilityMaterial(material, sensor, gpu, 0.2, false);
  render();
  result.hidden = pixel(64);
  updateVisibilityMaterial(material, sensor, gpu, 0, true);
  render();
  result.transparent = pixel(64);
  blocker.visible = false;
  const cleared = createGpuVisibilityScene(root)!;
  updateVisibilityMaterial(material, sensor, cleared, 0.2, true);
  render();
  result.cleared = pixel(64);
  gpu.dispose();
  cleared.dispose();
  material.dispose();
  target.dispose();
  [blocker, receiver].forEach((mesh) => {
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
  renderer.dispose();
  renderer.forceContextLoss();
  return result;
}
