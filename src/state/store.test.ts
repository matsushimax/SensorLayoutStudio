import { beforeEach, describe, expect, it } from 'vitest';
import { useStudio } from './store';
import { Group } from 'three';
describe('editing transactions', () => {
  beforeEach(() => useStudio.getState().reset(true));
  it('adds, duplicates, edits, deletes and undoes/ redoes scene changes', () => {
    useStudio.getState().addSensor('camera');
    expect(useStudio.getState().scene.sensors).toHaveLength(3);
    useStudio.getState().duplicate();
    expect(new Set(useStudio.getState().scene.sensors.map((s) => s.id)).size).toBe(4);
    useStudio.getState().remove();
    expect(useStudio.getState().scene.sensors).toHaveLength(3);
    useStudio.getState().undo();
    expect(useStudio.getState().scene.sensors).toHaveLength(4);
    useStudio.getState().redo();
    expect(useStudio.getState().scene.sensors).toHaveLength(3);
  });
  it('groups gizmo changes into one history entry', () => {
    const s = useStudio.getState(),
      id = s.scene.sensors[0].id;
    s.checkpoint();
    for (let i = 1; i <= 10; i++)
      useStudio
        .getState()
        .updatePose(id, { positionM: [i, 0, 1], quaternionXYZW: [0, 0, 0, 1] }, false);
    expect(useStudio.getState().past).toHaveLength(1);
    useStudio.getState().undo();
    expect(useStudio.getState().scene.sensors[0].pose.positionM).toEqual(
      s.scene.sensors[0].pose.positionM,
    );
  });
  it('keeps the previous scene and history on invalid edits', () => {
    const s = useStudio.getState(),
      old = s.scene;
    s.updateSensor(old.sensors[0].id, { params: { ...old.sensors[0].params, farM: -1 } });
    expect(useStudio.getState().scene).toBe(old);
    expect(useStudio.getState().past).toHaveLength(0);
    expect(useStudio.getState().error).toBeTruthy();
  });
  it('restores the actual imported model resource through undo and redo', () => {
    const first = new Group(),
      second = new Group();
    useStudio.getState().importModel('first.glb', first);
    useStudio.getState().importModel('second.glb', second);
    useStudio.getState().undo();
    expect(useStudio.getState().scene.model?.fileName).toBe('first.glb');
    expect(useStudio.getState().modelObject).toBe(first);
    useStudio.getState().redo();
    expect(useStudio.getState().modelObject).toBe(second);
  });
  it('keeps display selection out of scene history and preserves a comparison while editing', () => {
    const initial = useStudio.getState(),
      [a, b] = initial.scene.sensors;
    initial.toggleSensorSelection(b.id);
    initial.setSensorViewMode('common');
    useStudio.getState().select(b.id);
    expect(useStudio.getState().selectedSensorIds).toEqual([a.id, b.id]);
    expect(useStudio.getState().selectedId).toBe(b.id);
    expect(useStudio.getState().scene).toBe(initial.scene);
    expect(useStudio.getState().past).toHaveLength(0);
    expect(JSON.stringify(useStudio.getState().scene)).toBe(initial.saved);
    useStudio.getState().select(a.id, true);
    expect(useStudio.getState().selectedSensorIds).toEqual([b.id]);
    useStudio.getState().setSensorViewMode('selected');
    useStudio.getState().select(a.id);
    expect(useStudio.getState().selectedSensorIds).toEqual([a.id]);
  });
  it('prunes removed sensor selections and resets transient groups on load and new study', () => {
    const initial = useStudio.getState(),
      [a, b] = initial.scene.sensors;
    initial.selectAllSensors();
    initial.setSensorViewMode('common');
    initial.select(b.id);
    useStudio.getState().remove();
    expect(useStudio.getState().selectedSensorIds).toEqual([a.id]);
    useStudio.getState().undo();
    expect(
      useStudio
        .getState()
        .selectedSensorIds.every((id) =>
          useStudio.getState().scene.sensors.some((s) => s.id === id),
        ),
    ).toBe(true);
    useStudio.getState().load(initial.scene);
    expect(useStudio.getState().sensorViewMode).toBe('all');
    expect(useStudio.getState().selectedSensorIds).toEqual([a.id]);
    useStudio.getState().reset(false);
    expect(useStudio.getState().selectedSensorIds).toEqual([]);
  });
});
