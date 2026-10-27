import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
import { Raycaster, Vector2, type Group, type Mesh, type Object3D } from 'three';
import type { TransformControls as Controls } from 'three-stdlib';

export const MOVE_GIZMO_SIZE = 0.85;
// three-stdlib's shaft reaches 1 and its arrow tip reaches 1.1. Its XYZ
// rotation circles have radius 1, so this gives half the origin-to-tip length.
export const ROTATE_GIZMO_SIZE = (MOVE_GIZMO_SIZE * 1.1) / 2;

// The installed three-stdlib runtime exposes these members but declares them
// private. Keep the interop confined here; its geometry/interaction is covered
// by real pointer-drag regressions.
type RuntimeControl = {
  enabled: boolean;
  dragging: boolean;
  gizmo: { picker: Record<string, Object3D>; gizmo: Record<string, Object3D> };
  pointerUp: (pointer: { x: number; y: number; button: number }) => void;
};
const runtime = (control: Controls) => control as unknown as RuntimeControl;

export function CombinedTransformControls({
  object,
  mode,
  space,
  onStart,
  onChange,
  onEnd,
}: {
  object: RefObject<Group>;
  mode: 'translate' | 'rotate' | 'both';
  space: 'world' | 'local';
  onStart: () => void;
  onChange: () => void;
  onEnd: () => void;
}) {
  const move = useRef<Controls>(null),
    rotate = useRef<Controls>(null);
  const { gl, camera, controls, invalidate } = useThree();
  useLayoutEffect(() => {
    // Keep only the requested X/Y/Z circles: the extra camera-facing E ring
    // has radius 1.25 and the free-rotation sphere steals central move hits.
    if (rotate.current) {
      const gizmo = runtime(rotate.current).gizmo;
      for (const group of [gizmo.gizmo.rotate, gizmo.picker.rotate]) {
        for (const handle of group.children)
          if (['E', 'XYZE'].includes(handle.name)) {
            (handle as Mesh).geometry.setDrawRange(0, 0);
            handle.raycast = () => {};
          }
      }
    }
    if (mode !== 'both' || !move.current || !rotate.current) return;
    const translation = runtime(move.current),
      rotation = runtime(rotate.current);
    const element = gl.domElement,
      document = element.ownerDocument;
    const orbit = controls as unknown as { enabled: boolean } | null;
    let active: RuntimeControl | null = null,
      orbitWasEnabled = true;
    const ray = new Raycaster();
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || active) return;
      const rect = element.getBoundingClientRect();
      ray.setFromCamera(
        new Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          1 - ((event.clientY - rect.top) / rect.height) * 2,
        ),
        camera,
      );
      const hit = (control: RuntimeControl, kind: string) =>
        ray.intersectObject(control.gizmo.picker[kind], true).some((h) => h.object.visible);
      // A thin rotation ring takes priority where a broad axis picker overlaps
      // it. Outer move arrows remain unobstructed. Only ONE control gets down.
      active = hit(rotation, 'rotate')
        ? rotation
        : hit(translation, 'translate')
          ? translation
          : null;
      if (!active) return;
      translation.enabled = active === translation;
      rotation.enabled = active === rotation;
      if (orbit) {
        orbitWasEnabled = orbit.enabled;
        orbit.enabled = false;
      }
    };
    const restore = () => {
      if (!active) return;
      active = null;
      translation.enabled = rotation.enabled = true;
      if (orbit) orbit.enabled = orbitWasEnabled;
      invalidate();
    };
    const up = () => {
      queueMicrotask(restore);
    };
    const cancel = () => {
      active?.pointerUp({ x: 0, y: 0, button: 0 });
      restore();
    };
    element.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', cancel, true);
    window.addEventListener('blur', cancel);
    return () => {
      cancel();
      element.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
      window.removeEventListener('blur', cancel);
    };
  }, [mode, camera, gl, controls, invalidate]);
  const shared = {
    object,
    space,
    onMouseDown: onStart,
    onObjectChange: onChange,
    onMouseUp: onEnd,
  };
  return (
    <>
      {mode !== 'rotate' && (
        <TransformControls ref={move} {...shared} mode="translate" size={MOVE_GIZMO_SIZE} />
      )}
      {mode !== 'translate' && (
        <TransformControls ref={rotate} {...shared} mode="rotate" size={ROTATE_GIZMO_SIZE} />
      )}
    </>
  );
}
