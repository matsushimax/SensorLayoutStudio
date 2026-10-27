import {
  BoxGeometry,
  CylinderGeometry,
  EdgesGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { LineSegments2, LineSegmentsGeometry, LineMaterial } from 'three-stdlib';
import { createSensor } from '../src/domain/scene';
import { shadowBoundaryGeometry } from '../src/domain/shadowBoundary';
import { fovGeometry } from '../src/viewer/geometry';
import { createGpuVisibilityScene, visibilityMaterial } from '../src/viewer/gpuVisibility';

/** Display-only decorations must not change any surface of either sensor's
 * visible volume, including silhouette walls seen from the side or above. */
export function compareDecoratedBoundaries() {
  const root = new Group();
  const box = new Mesh(new BoxGeometry(0.85, 0.85, 1.1), new MeshBasicMaterial());
  box.position.set(4.4, 0.4, 0.55);
  const cylinder = new Mesh(new CylinderGeometry(0.25, 0.25, 1.2, 32), new MeshBasicMaterial());
  cylinder.position.set(2, 0.7, 1.4);
  cylinder.rotation.x = Math.PI / 2;
  const floor = new Mesh(new PlaneGeometry(2000, 2000), new MeshBasicMaterial());
  floor.position.z = -0.04;
  for (const mesh of [box, cylinder, floor]) {
    mesh.userData.occluder = true;
    root.add(mesh);
  }
  const plain = createGpuVisibilityScene(root)!;
  const outlines = [box, cylinder].map((mesh) => {
    const edges = new EdgesGeometry(mesh.geometry);
    const line = new LineSegments2(
      new LineSegmentsGeometry().fromEdgesGeometry(edges),
      new LineMaterial(),
    );
    edges.dispose();
    mesh.add(line);
    return line;
  });
  const decorated = createGpuVisibilityScene(root)!;
  const renderer = new WebGLRenderer({ alpha: true });
  const size = 128;
  renderer.setSize(size, size);
  renderer.setClearColor(0, 0);
  const target = new WebGLRenderTarget(size, size);
  renderer.setRenderTarget(target);
  const camera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 50);
  camera.up.set(0, 0, 1);
  const views = [
    [12, 0, 1.5],
    [4, -10, 1.5],
    [4, 0, 12],
    [12, -8, 6],
  ];
  const results: { kind: string; view: number[]; changedPixels: number; visiblePixels: number }[] =
    [];
  for (const kind of ['camera', 'lidar'] as const) {
    const sensor = createSensor(kind, kind);
    const images: Uint8Array[][] = [];
    for (const gpu of [plain, decorated]) {
      const shape = fovGeometry(sensor, 2);
      shape.lines.dispose();
      shape.surface.translate(...sensor.pose.positionM);
      const boundary = shadowBoundaryGeometry(sensor, gpu.edges);
      const materials = [false, true, false].map((cap, i) =>
        visibilityMaterial(sensor, gpu, cap, 0.3, i === 2),
      );
      const scene = new Scene();
      [shape.surface, gpu.geometry, boundary].forEach((geometry, i) => {
        const mesh = new Mesh(geometry, materials[i]);
        mesh.renderOrder = i === 1 ? 4 : 2;
        scene.add(mesh);
      });
      const captures = views.map((view) => {
        camera.position.fromArray(view);
        camera.lookAt(3, 0, 1);
        renderer.render(scene, camera);
        const pixels = new Uint8Array(size * size * 4);
        renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
        return pixels;
      });
      images.push(captures);
      shape.surface.dispose();
      boundary.dispose();
      materials.forEach((m) => m.dispose());
    }
    views.forEach((view, i) => {
      let changedPixels = 0,
        visiblePixels = 0;
      for (let pixel = 0; pixel < size * size; pixel++) {
        const offset = pixel * 4;
        if (images[0][i][offset + 3] > 0) visiblePixels++;
        if ([0, 1, 2, 3].some((c) => images[0][i][offset + c] !== images[1][i][offset + c]))
          changedPixels++;
      }
      results.push({ kind, view, changedPixels, visiblePixels });
    });
  }
  plain.dispose();
  decorated.dispose();
  for (const mesh of [box, cylinder, floor]) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  outlines.forEach((line) => {
    line.geometry.dispose();
    line.material.dispose();
  });
  target.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return results;
}
