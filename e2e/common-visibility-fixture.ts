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
import type { Sensor } from '../src/domain/types';
import { createCommonSensorData } from '../src/viewer/commonVisibility';
import {
  createGpuVisibilityScene,
  updateVisibilityMaterial,
  visibilityMaterial,
} from '../src/viewer/gpuVisibility';

export function renderCommonVisibility() {
  const root = new Group();
  const receiver = new Mesh(new PlaneGeometry(6, 6), new MeshBasicMaterial());
  receiver.rotation.y = Math.PI / 2;
  receiver.position.x = 4;
  receiver.userData.occluder = true;
  const blocker = new Mesh(new BoxGeometry(0.15, 0.35, 1.5), new MeshBasicMaterial());
  blocker.position.set(2, 0.5, 0);
  blocker.userData.occluder = true;
  blocker.visible = false;
  root.add(receiver, blocker);
  const a = createSensor('camera', 'a'),
    b = createSensor('camera', 'b');
  for (const [sensor, y] of [
    [a, -1],
    [b, 1],
  ] as const) {
    sensor.pose.positionM = [0, y, 0];
    sensor.params = {
      kind: 'camera',
      horizontalFovDeg: 60,
      verticalFovDeg: 60,
      nearM: 0.1,
      farM: 5,
    };
  }
  let gpu = createGpuVisibilityScene(root)!;
  const material = visibilityMaterial(a, gpu, true, 0.2);
  const scene = new Scene();
  const surface = new Mesh(receiver.geometry, material);
  surface.position.copy(receiver.position);
  surface.rotation.copy(receiver.rotation);
  scene.add(surface);
  const camera = new OrthographicCamera(-3, 3, 3, -3, 0.1, 20);
  camera.up.set(0, 0, 1);
  camera.position.set(6, 0, 0);
  camera.lookAt(4, 0, 0);
  const renderer = new WebGLRenderer({ alpha: true });
  renderer.setSize(128, 128);
  renderer.setClearColor(0, 0);
  const target = new WebGLRenderTarget(128, 128);
  renderer.setRenderTarget(target);
  const pixels = new Uint8Array(128 * 128 * 4);
  const render = (sensors: Sensor[], occlusion = true) => {
    const common = createCommonSensorData(sensors);
    updateVisibilityMaterial(material, a, gpu, 0.2, false, common, occlusion);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels);
    common.dispose();
  };
  const pixel = (x: number, y = 64) =>
    Array.from(pixels.slice((y * 128 + x) * 4, (y * 128 + x) * 4 + 4));
  render([a, b]);
  const results: Record<string, number[]> = {
    shared: pixel(64),
    onlyA: pixel(21),
    outsideA: pixel(107),
  };
  const third = structuredClone(b);
  third.id = 'third';
  third.pose.positionM = [0, 5, 0];
  render([a, b, third]);
  results.notAllThree = pixel(64);
  const short = structuredClone(b);
  short.params.farM = 2;
  render([a, short]);
  results.projectedOnly = pixel(64);
  const identical = structuredClone(a);
  identical.id = 'identical';
  render([a, identical]);
  results.identical = pixel(64);
  b.params.nearM = 3;
  blocker.visible = true;
  gpu.dispose();
  gpu = createGpuVisibilityScene(root)!;
  render([a, b]);
  results.blockedForB = pixel(64);
  render([a, b], false);
  results.occlusionOff = pixel(64);
  blocker.visible = false;
  gpu.dispose();
  gpu = createGpuVisibilityScene(root)!;
  render([a, b]);
  results.blockerHidden = pixel(64);
  b.params = {
    kind: 'lidar',
    azimuthStartDeg: -40,
    azimuthSpanDeg: 80,
    elevationMinDeg: -20,
    elevationMaxDeg: 20,
    nearM: 0.1,
    farM: 6,
  };
  render([a, b]);
  results.mixed = pixel(64);
  b.pose.quaternionXYZW = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
  render([a, b]);
  results.rotatedAway = pixel(64);
  gpu.dispose();
  material.dispose();
  target.dispose();
  [receiver, blocker].forEach((mesh) => {
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
  renderer.dispose();
  renderer.forceContextLoss();
  return results;
}
