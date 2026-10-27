import { _roots } from '@react-three/fiber';
import { Raycaster, Vector2, Vector3, type Mesh, type Object3D } from 'three';
import { useStudio } from '../src/state/store';

// Read the real pick geometry to locate a ring; the test still drags it using
// actual mouse events, never calls pointerDown/rotation setters directly.
export function rotationDrag(axis: string) {
  const canvas = document.querySelector('canvas')!;
  const state = _roots.get(canvas)!.store.getState();
  let control:
    (Object3D & { gizmo: { picker: { rotate: Object3D } }; object: Object3D }) | undefined;
  state.scene.traverse((object) => {
    if (
      'isTransformControls' in object &&
      object.isTransformControls &&
      'mode' in object &&
      object.mode === 'rotate'
    )
      control = object as unknown as typeof control;
  });
  if (!control) throw new Error('No transform control');
  const bounds = canvas.getBoundingClientRect();
  const center = control.object.getWorldPosition(new Vector3()).project(state.camera);
  const cx = bounds.left + ((center.x + 1) * bounds.width) / 2;
  const cy = bounds.top + ((1 - center.y) * bounds.height) / 2;
  const ray = new Raycaster();
  for (let radius = 15; radius < 100; radius += 2) {
    for (let angle = 0; angle < Math.PI * 2; angle += 0.08) {
      const x = cx + radius * Math.cos(angle),
        y = cy + radius * Math.sin(angle);
      ray.setFromCamera(
        new Vector2(
          ((x - bounds.left) / bounds.width) * 2 - 1,
          1 - ((y - bounds.top) / bounds.height) * 2,
        ),
        state.camera,
      );
      const hit = ray
        .intersectObject(control.gizmo.picker.rotate, true)
        .find((h) => h.object.visible);
      if (hit?.object.name !== axis) continue;
      return {
        x,
        y,
        endX: cx + radius * Math.cos(angle + 0.3),
        endY: cy + radius * Math.sin(angle + 0.3),
      };
    }
  }
  throw new Error(`No pickable ${axis} ring`);
}

export function rotationState() {
  const state = useStudio.getState();
  const sensor = state.scene.sensors.find((s) => s.id === state.selectedId)!;
  return { pose: sensor.pose, history: state.past.length };
}

export function gizmoRatio() {
  const scene = _roots.get(document.querySelector('canvas')!)!.store.getState().scene;
  const lengths: Record<string, number> = {};
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (!('isTransformControls' in object) || !object.isTransformControls) return;
    const c = object as unknown as {
      mode: string;
      object: Object3D;
      gizmo: { gizmo: Record<string, Object3D> };
    };
    const center = c.object.getWorldPosition(new Vector3());
    let length = 0;
    for (const handle of c.gizmo.gizmo[c.mode].children) {
      if (handle.name !== 'X' || !handle.visible) continue;
      // Measure the circle itself, excluding its small direction marker.
      if (c.mode === 'rotate' && !('isLine' in handle)) continue;
      const vertices = (handle as Mesh).geometry.getAttribute('position');
      for (let i = 0; i < vertices.count; i++)
        length = Math.max(
          length,
          new Vector3()
            .fromBufferAttribute(vertices, i)
            .applyMatrix4(handle.matrixWorld)
            .distanceTo(center),
        );
    }
    lengths[c.mode] = length;
  });
  return lengths.rotate / lengths.translate;
}
