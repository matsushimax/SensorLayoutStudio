import { create } from 'zustand';
import { uniqueSensorName } from '../domain/names';
import type { Object3D } from 'three';
import { createDemoScene, createPrimitive, createSensor, parseScene } from '../domain/scene';
import type { Pose, Primitive, SceneData, Sensor } from '../domain/types';
import type { OcclusionStats } from '../domain/occlusion';

type View = 'perspective' | 'front' | 'top' | 'side' | 'focus' | 'fit';
export type SensorViewMode = 'all' | 'selected' | 'common';
type HistoryEntry = { scene: SceneData; modelObject: Object3D | null };
type State = {
  scene: SceneData;
  selectedId: string | null;
  selectedSensorIds: string[];
  sensorViewMode: SensorViewMode;
  modelObject: Object3D | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  saved: string;
  notice: string;
  error: string | null;
  mode: 'translate' | 'rotate' | 'both';
  space: 'world' | 'local';
  showGrid: boolean;
  showFov: boolean;
  occlusionEnabled: boolean;
  highlightOccluded: boolean;
  occlusionStats: Record<string, OcclusionStats>;
  view: { preset: View; sequence: number };
  busy: boolean;
  setNotice: (message: string) => void;
  setError: (message: string | null) => void;
  select: (id: string | null, additive?: boolean) => void;
  toggleSensorSelection: (id: string) => void;
  selectAllSensors: () => void;
  clearSensorSelection: () => void;
  setSensorViewMode: (mode: SensorViewMode) => void;
  setMode: (mode: State['mode']) => void;
  setSpace: (space: State['space']) => void;
  setView: (view: View) => void;
  toggleGrid: () => void;
  toggleFov: () => void;
  toggleOcclusion: () => void;
  toggleHighlightOccluded: () => void;
  setOcclusionStats: (stats: Record<string, OcclusionStats>) => void;
  setBusy: (busy: boolean) => void;
  commit: (scene: SceneData, checkpoint?: boolean) => boolean;
  checkpoint: () => void;
  addSensor: (kind: 'camera' | 'lidar') => void;
  addPrimitive: (kind: Primitive['shape']) => void;
  updateSensor: (id: string, patch: Partial<Sensor>, checkpoint?: boolean) => void;
  updatePrimitive: (id: string, patch: Partial<Primitive>, checkpoint?: boolean) => void;
  updatePose: (id: string, pose: Pose, checkpoint?: boolean) => void;
  updateModel: (patch: Partial<NonNullable<SceneData['model']>>) => void;
  remove: () => void;
  duplicate: () => void;
  undo: () => void;
  redo: () => void;
  reset: (demo: boolean) => void;
  load: (scene: SceneData) => void;
  markSaved: () => void;
  importModel: (fileName: string, object: Object3D) => void;
};

const initial = createDemoScene();
export const useStudio = create<State>((set, get) => ({
  scene: initial,
  selectedId: initial.sensors[0].id,
  selectedSensorIds: [initial.sensors[0].id],
  sensorViewMode: 'all',
  modelObject: null,
  past: [],
  future: [],
  saved: JSON.stringify(initial),
  notice: 'Demo scene ready. Select a sensor to start exploring.',
  error: null,
  mode: 'both',
  space: 'world',
  showGrid: true,
  showFov: true,
  occlusionEnabled: true,
  highlightOccluded: true,
  occlusionStats: {},
  view: { preset: 'perspective', sequence: 0 },
  busy: false,
  setNotice: (notice) => set({ notice, error: null }),
  setError: (error) => set({ error }),
  select: (selectedId, additive = false) => {
    if (selectedId && get().scene.sensors.some((s) => s.id === selectedId)) {
      if (additive) get().toggleSensorSelection(selectedId);
      else if (get().sensorViewMode !== 'common') set({ selectedSensorIds: [selectedId] });
    }
    set({ selectedId });
  },
  toggleSensorSelection: (id) => {
    const state = get();
    if (!state.scene.sensors.some((s) => s.id === id)) return;
    set({
      selectedSensorIds: state.selectedSensorIds.includes(id)
        ? state.selectedSensorIds.filter((value) => value !== id)
        : [...state.selectedSensorIds, id],
      sensorViewMode: state.sensorViewMode === 'all' ? 'selected' : state.sensorViewMode,
    });
  },
  selectAllSensors: () =>
    set({
      selectedSensorIds: get()
        .scene.sensors.filter((s) => s.visible)
        .map((s) => s.id),
    }),
  clearSensorSelection: () => set({ selectedSensorIds: [] }),
  setSensorViewMode: (sensorViewMode) => set({ sensorViewMode }),
  setMode: (mode) => set({ mode }),
  setSpace: (space) => set({ space }),
  setView: (preset) => set({ view: { preset, sequence: get().view.sequence + 1 } }),
  toggleGrid: () => set({ showGrid: !get().showGrid }),
  toggleFov: () => set({ showFov: !get().showFov }),
  toggleOcclusion: () => set({ occlusionEnabled: !get().occlusionEnabled }),
  toggleHighlightOccluded: () => set({ highlightOccluded: !get().highlightOccluded }),
  setOcclusionStats: (occlusionStats) => set({ occlusionStats }),
  setBusy: (busy) => set({ busy }),
  checkpoint: () =>
    set({
      past: [
        ...get().past.slice(-49),
        { scene: structuredClone(get().scene), modelObject: get().modelObject },
      ],
      future: [],
    }),
  commit: (scene, checkpoint = true) => {
    try {
      const valid = parseScene(JSON.stringify(scene));
      if (checkpoint) get().checkpoint();
      set({
        scene: valid,
        error: null,
        selectedSensorIds: get().selectedSensorIds.filter((id) =>
          valid.sensors.some((s) => s.id === id),
        ),
      });
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Invalid scene.' });
      return false;
    }
  },
  addSensor: (kind) => {
    const state = get(),
      sensor = createSensor(
        kind,
        uniqueName(
          kind,
          state.scene.sensors.map((s) => s.name),
        ),
      );
    if (state.commit({ ...state.scene, sensors: [...state.scene.sensors, sensor] }))
      set({ selectedId: sensor.id, selectedSensorIds: [sensor.id] });
  },
  addPrimitive: (kind) => {
    const state = get(),
      primitive = createPrimitive(
        kind,
        uniqueName(
          kind,
          state.scene.primitives.map((s) => s.name),
        ),
      );
    if (state.commit({ ...state.scene, primitives: [...state.scene.primitives, primitive] }))
      set({ selectedId: primitive.id });
  },
  updateSensor: (id, patch, checkpoint) => {
    const { scene, commit } = get();
    if (patch.name)
      patch = {
        ...patch,
        name: uniqueSensorName(
          patch.name,
          scene.sensors.filter((s) => s.id !== id).map((s) => s.name),
        ),
      };
    commit(
      { ...scene, sensors: scene.sensors.map((s) => (s.id === id ? { ...s, ...patch } : s)) },
      checkpoint,
    );
  },
  updatePrimitive: (id, patch, checkpoint) => {
    const { scene, commit } = get();
    commit(
      { ...scene, primitives: scene.primitives.map((p) => (p.id === id ? { ...p, ...patch } : p)) },
      checkpoint,
    );
  },
  updatePose: (id, pose, checkpoint = true) => {
    const { scene, commit } = get();
    if (id === 'model' && scene.model)
      commit({ ...scene, model: { ...scene.model, poseInBase: pose } }, checkpoint);
    else if (scene.sensors.some((s) => s.id === id)) get().updateSensor(id, { pose }, checkpoint);
    else get().updatePrimitive(id, { pose }, checkpoint);
  },
  updateModel: (patch) => {
    const { scene, commit } = get();
    if (scene.model) commit({ ...scene, model: { ...scene.model, ...patch } });
  },
  remove: () => {
    const { scene, selectedId, commit } = get();
    if (!selectedId) return;
    const next = {
      ...scene,
      sensors: scene.sensors.filter((s) => s.id !== selectedId),
      primitives: scene.primitives.filter((p) => p.id !== selectedId),
    };
    if (selectedId === 'model') delete next.model;
    commit(next);
    set({ selectedId: null });
  },
  duplicate: () => {
    const { scene, selectedId, commit } = get();
    const source = [...scene.sensors, ...scene.primitives].find((s) => s.id === selectedId);
    if (!source) return;
    const copy = structuredClone(source);
    copy.id = crypto.randomUUID();
    copy.name =
      'params' in copy
        ? uniqueSensorName(
            source.name,
            scene.sensors.map((s) => s.name),
          )
        : uniqueName(
            `${source.name}_copy`,
            [...scene.sensors, ...scene.primitives].map((o) => o.name),
          );
    copy.pose.positionM[1] += 0.5;
    const next =
      'params' in copy
        ? { ...scene, sensors: [...scene.sensors, copy] }
        : { ...scene, primitives: [...scene.primitives, copy] };
    if (commit(next))
      set({ selectedId: copy.id, ...('params' in copy ? { selectedSensorIds: [copy.id] } : {}) });
  },
  undo: () => {
    const { past, scene, modelObject, future } = get();
    if (!past.length) return;
    set({
      ...past[past.length - 1],
      selectedSensorIds: get().selectedSensorIds.filter((id) =>
        past[past.length - 1].scene.sensors.some((s) => s.id === id),
      ),
      past: past.slice(0, -1),
      future: [{ scene, modelObject }, ...future],
      selectedId: null,
      error: null,
    });
  },
  redo: () => {
    const { past, scene, modelObject, future } = get();
    if (!future.length) return;
    set({
      ...future[0],
      selectedSensorIds: get().selectedSensorIds.filter((id) =>
        future[0].scene.sensors.some((s) => s.id === id),
      ),
      past: [...past, { scene, modelObject }],
      future: future.slice(1),
      selectedId: null,
      error: null,
    });
  },
  reset: (demo) => {
    const scene = demo
      ? createDemoScene()
      : { ...createDemoScene(), name: 'Untitled study', sensors: [], primitives: [] };
    set({
      scene,
      selectedId: scene.sensors[0]?.id ?? null,
      selectedSensorIds: scene.sensors[0] ? [scene.sensors[0].id] : [],
      sensorViewMode: 'all',
      modelObject: null,
      past: [],
      future: [],
      saved: JSON.stringify(scene),
      error: null,
    });
    get().setView('perspective');
    get().setNotice(demo ? 'Demo scene restored.' : 'New study created.');
  },
  load: (scene) => {
    set({
      scene,
      selectedSensorIds: scene.sensors[0] ? [scene.sensors[0].id] : [],
      sensorViewMode: 'all',
      selectedId: null,
      modelObject: null,
      past: [],
      future: [],
      saved: JSON.stringify(scene),
      error: null,
    });
    get().setView('fit');
  },
  markSaved: () => set({ saved: JSON.stringify(get().scene) }),
  importModel: (fileName, object) => {
    const { scene, commit } = get();
    // Re-selection preserves the saved alignment. New imports propose Y-up → Z-up.
    const reference =
      scene.model?.fileName === fileName
        ? scene.model
        : {
            fileName,
            poseInBase: {
              positionM: [0, 0, 0] as [number, number, number],
              quaternionXYZW: (/\.glb$/i.test(fileName)
                ? [Math.SQRT1_2, 0, 0, Math.SQRT1_2]
                : [0, 0, 0, 1]) as [number, number, number, number],
            },
            scaleFactor: /\.stl$/i.test(fileName) ? 0.001 : 1,
            visible: true,
          };
    if (commit({ ...scene, model: reference })) {
      set({ modelObject: object, selectedId: 'model' });
      get().setView('fit');
    }
  },
}));

function uniqueName(base: string, names: string[]): string {
  if (!names.includes(base)) return base;
  let i = 2;
  while (names.includes(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}
