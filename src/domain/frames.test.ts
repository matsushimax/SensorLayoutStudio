import { describe, it, expect } from 'vitest';
import { referenceFrames, poseInBase } from './frames';
import { relativePose, rpyToQuaternion, poseMatrix, exportTransforms } from './pose';
import { createDemoScene, parseScene } from './scene';
import { uniqueSensorName } from './names';
import { useStudio } from '../state/store';

describe('reference frames and unique sensor names', () => {
  it('composes a translated and rotated reference and round trips all axes', () => {
    const reference = {
      positionM: [10, 20, 30] as [number, number, number],
      quaternionXYZW: rpyToQuaternion([0, 0, 90]),
    };
    const local = {
      positionM: [2, 3, 4] as [number, number, number],
      quaternionXYZW: rpyToQuaternion([15, -30, 45]),
    };
    const world = poseInBase(reference, local);
    world.positionM.forEach((v, i) => expect(v).toBeCloseTo([7, 22, 34][i], 10));
    const restored = poseMatrix(relativePose(reference, world)).elements;
    poseMatrix(local).elements.forEach((v, i) => expect(restored[i]).toBeCloseTo(v, 10));
  });
  it('uses model origin and axes without scaling metric coordinates', () => {
    const scene = createDemoScene();
    scene.model = {
      fileName: 'scaled.glb',
      scaleFactor: 100,
      visible: false,
      poseInBase: { positionM: [10, 0, 0], quaternionXYZW: [0, 0, 0, 1] },
    };
    const model = referenceFrames(scene).find((f) => f.id === 'model')!;
    expect(
      poseInBase(model.pose, { positionM: [1, 2, 3], quaternionXYZW: [0, 0, 0, 1] }).positionM,
    ).toEqual([11, 2, 3]);
  });
  it('numbers duplicate names without stealing an existing suffix on import', () => {
    const scene = createDemoScene();
    scene.sensors[1].name = scene.sensors[0].name;
    scene.sensors.push({
      ...structuredClone(scene.sensors[0]),
      id: 'third',
      name: 'front_camera_2',
    });
    const parsed = parseScene(JSON.stringify(scene));
    expect(parsed.sensors.map((s) => s.name)).toEqual([
      'front_camera',
      'front_camera_3',
      'front_camera_2',
    ]);
    expect(parseScene(JSON.stringify(parsed))).toEqual(parsed);
  });
  it('renames only the edited sensor and preserves unique export frames through undo', () => {
    useStudio.getState().reset(true);
    const original = useStudio.getState().scene;
    useStudio.getState().updateSensor(original.sensors[0].id, { name: original.sensors[1].name });
    expect(exportTransforms(useStudio.getState().scene).sensors.map((s) => s.frame)).toEqual([
      'roof_lidar_2',
      'roof_lidar',
    ]);
    useStudio.getState().undo();
    expect(useStudio.getState().scene).toEqual(original);
  });
  it('bounds numbered names and reserves base/model frame names', () => {
    expect(uniqueSensorName('base_link', [])).toBe('base_link_2');
    expect(uniqueSensorName('camera_2', ['camera_2', 'camera_3'])).toBe('camera_4');
    expect(uniqueSensorName('a'.repeat(200), ['a'.repeat(200)])).toHaveLength(200);
  });
});
