import {
  Box3,
  BoxGeometry,
  EdgesGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Ray,
  Scene,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { LineSegments2, LineSegmentsGeometry, LineMaterial } from 'three-stdlib';
import { createSensor } from '../src/domain/scene';
import { createGpuVisibilityScene, visibilityMaterial } from '../src/viewer/gpuVisibility';

export function compareVisibilityPixels() {
  const root = new Group();
  const box = new Mesh(new BoxGeometry(0.85, 0.85, 1.1), new MeshBasicMaterial());
  box.position.set(4.4, 0.4, 0.55);
  // Match the real app's Drei <Edges> hierarchy. These strokes extend Mesh,
  // but their quad template must never be interpreted as an opaque surface.
  const outline = new LineSegments2(
    new LineSegmentsGeometry().fromEdgesGeometry(new EdgesGeometry(box.geometry)),
    new LineMaterial(),
  );
  box.add(outline);
  const floor = new Mesh(new PlaneGeometry(2000, 2000), new MeshBasicMaterial());
  floor.position.z = -0.04;
  for (const mesh of [box, floor]) {
    mesh.userData.occluder = true;
    root.add(mesh);
  }
  const sensor = createSensor('camera', 'oracle');
  const gpu = createGpuVisibilityScene(root)!;
  const material = visibilityMaterial(sensor, gpu, false, 0.7);
  const h = 5 * Math.tan((35 * Math.PI) / 180),
    v = 5 * Math.tan((22.5 * Math.PI) / 180);
  const plane = new Mesh(new PlaneGeometry(2 * v, 2 * h), material);
  plane.rotation.y = Math.PI / 2;
  plane.position.set(6.65, 0, 1.1);
  const scene = new Scene();
  scene.add(plane);
  const camera = new OrthographicCamera(-h, h, v, -v, 0.1, 20);
  camera.up.set(0, 0, 1);
  camera.position.set(10, 0, 1.1);
  camera.lookAt(6.65, 0, 1.1);
  const renderer = new WebGLRenderer({ alpha: true });
  const size = 128;
  renderer.setSize(size, size);
  renderer.setClearColor(0, 0);
  const target = new WebGLRenderTarget(size, size);
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  const pixels = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
  const bounds = new Box3(new Vector3(3.975, -0.025, 0), new Vector3(4.825, 0.825, 1.1));
  const origin = new Vector3(1.65, 0, 1.1),
    hit = new Vector3();
  let mismatches = 0,
    blocked = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const end = new Vector3(
        6.65,
        (((x + 0.5) / size) * 2 - 1) * h,
        1.1 + (((y + 0.5) / size) * 2 - 1) * v,
      );
      const direction = end.clone().sub(origin).normalize();
      const distance = origin.distanceTo(end);
      const ray = new Ray(origin, direction);
      const boxHit = ray.intersectBox(bounds, hit);
      const groundDistance = (-0.04 - origin.z) / direction.z;
      const expected =
        (boxHit !== null && origin.distanceTo(hit) < distance) ||
        (groundDistance > 0 && groundDistance < distance);
      const actual = pixels[(y * size + x) * 4 + 3] === 0;
      if (expected) blocked++;
      if (expected !== actual) mismatches++;
    }
  gpu.dispose();
  material.dispose();
  plane.geometry.dispose();
  target.dispose();
  for (const mesh of [box, floor]) {
    mesh.geometry.dispose();
    (mesh.material as MeshBasicMaterial).dispose();
  }
  renderer.dispose();
  renderer.forceContextLoss();
  outline.geometry.dispose();
  outline.material.dispose();
  return { mismatches, blocked, total: size * size };
}
