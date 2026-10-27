import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { DoubleSide } from 'three';
import { createOcclusionWorld, type OcclusionStats } from '../domain/occlusion';
import { useStudio } from '../state/store';
import { fovGeometry } from './geometry';
import { occludedFovGeometry } from './occludedGeometry';
import {
  createGpuVisibilityScene,
  updateVisibilityMaterial,
  visibilityMaterial,
  type GpuVisibilityScene,
} from './gpuVisibility';
import type { Sensor, SceneData } from '../domain/types';
import { shadowBoundaryGeometry } from '../domain/shadowBoundary';
import type { BufferGeometry } from 'three';
import { createCommonSensorData, type CommonSensorData } from './commonVisibility';

export function FovVolumes() {
  const graph = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const {
    scene,
    modelObject,
    showFov,
    occlusionEnabled,
    highlightOccluded,
    selectedSensorIds,
    sensorViewMode,
  } = useStudio();
  const sensors = useMemo(
    () =>
      scene.sensors.filter(
        (s) => s.visible && (sensorViewMode === 'all' || selectedSensorIds.includes(s.id)),
      ),
    [scene.sensors, sensorViewMode, selectedSensorIds],
  );
  const common = useMemo(
    () =>
      sensorViewMode === 'common' && sensors.length >= 2 ? createCommonSensorData(sensors) : null,
    [sensorViewMode, sensors],
  );
  useEffect(() => () => common?.dispose(), [common]);
  const [gpuScene, setGpuScene] = useState<GpuVisibilityScene | null>(null);
  const previous = useRef<{ scene: SceneData; model: unknown; enabled: boolean } | null>(null);
  const blockers = useRef<{ key: string; model: unknown } | null>(null);
  // Uniform-only edits also need a frame. Orbit/gizmo controls invalidate on
  // interaction; idle views do not continually traverse the GPU BVH.
  useLayoutEffect(
    () => invalidate(),
    [
      scene,
      modelObject,
      showFov,
      occlusionEnabled,
      highlightOccluded,
      gpuScene,
      common,
      sensors,
      invalidate,
    ],
  );
  useFrame(() => {
    const state = useStudio.getState(),
      prev = previous.current;
    if (
      prev?.scene === state.scene &&
      prev.model === state.modelObject &&
      prev.enabled === state.occlusionEnabled
    )
      return;
    previous.current = {
      scene: state.scene,
      model: state.modelObject,
      enabled: state.occlusionEnabled,
    };
    // Snapshot after all editable-object layout effects. Sensor edits reuse the
    // blocker BVH; only actual blocker geometry/transforms trigger rebuilding.
    const key = JSON.stringify([
      state.scene.model,
      state.scene.primitives.map((p) => [p.shape, p.pose, p.dimensionsM, p.visible]),
    ]);
    if (blockers.current?.key !== key || blockers.current.model !== state.modelObject) {
      setGpuScene(createGpuVisibilityScene(graph));
      blockers.current = { key, model: state.modelObject };
    }
    const stats: Record<string, OcclusionStats> = {};
    if (state.occlusionEnabled) {
      const world = createOcclusionWorld(graph);
      for (const sensor of state.scene.sensors.filter((s) => s.visible)) {
        // Explicitly sampled diagnostics only: these points and interpolated
        // triangles no longer determine anything rendered on screen.
        const sampled = occludedFovGeometry(sensor, world);
        stats[sensor.id] = sampled.stats;
        sampled.surface.dispose();
        sampled.lines.dispose();
        sampled.rays.dispose();
      }
    }
    state.setOcclusionStats(stats);
  });
  useEffect(() => () => gpuScene?.dispose(), [gpuScene]);
  return (
    <group visible={showFov}>
      {sensors.map((sensor) =>
        (occlusionEnabled || common) && gpuScene ? (
          <GpuVolume key={sensor.id} sensor={sensor} scene={gpuScene} common={common} />
        ) : (
          <Volume key={sensor.id} sensor={sensor} />
        ),
      )}
    </group>
  );
}

function Volume({ sensor }: { sensor: Sensor }) {
  const shape = JSON.stringify(sensor.params);
  const geometry = useMemo(() => fovGeometry(sensor, 2), [shape]);
  useEffect(
    () => () => {
      geometry.surface.dispose();
      geometry.lines.dispose();
    },
    [geometry],
  );
  return (
    <>
      <group position={sensor.pose.positionM} quaternion={sensor.pose.quaternionXYZW}>
        <>
          <mesh geometry={geometry.surface} raycast={() => {}} renderOrder={2}>
            <meshBasicMaterial
              color={sensor.color}
              transparent
              opacity={sensor.opacity}
              side={DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <lineSegments geometry={geometry.lines} raycast={() => {}} renderOrder={3}>
            <lineBasicMaterial
              color={sensor.color}
              transparent
              opacity={Math.min(0.8, sensor.opacity * 3 + 0.15)}
              depthWrite={false}
            />
          </lineSegments>
        </>
      </group>
    </>
  );
}

function GpuVolume({
  sensor,
  scene,
  common,
}: {
  sensor: Sensor;
  scene: GpuVisibilityScene;
  common: CommonSensorData | null;
}) {
  const occlusionEnabled = useStudio((s) => s.occlusionEnabled);
  const pose = JSON.stringify([sensor.pose, sensor.params]);
  const shape = JSON.stringify(sensor.params);
  const geometry = useMemo(() => fovGeometry(sensor, 2), [shape]);
  const boundary = useMemo(() => shadowBoundaryGeometry(sensor, scene.edges), [scene, pose]);
  useEffect(
    () => () => {
      geometry.surface.dispose();
      geometry.lines.dispose();
    },
    [geometry],
  );
  useEffect(() => () => boundary.dispose(), [boundary]);
  return (
    <>
      <group position={sensor.pose.positionM} quaternion={sensor.pose.quaternionXYZW}>
        <GpuSurface sensor={sensor} scene={scene} geometry={geometry.surface} common={common} />
        <GpuSurface sensor={sensor} scene={scene} geometry={geometry.lines} common={common} lines />
      </group>
      <GpuSurface sensor={sensor} scene={scene} geometry={scene.geometry} common={common} cap />
      {occlusionEnabled && (
        <GpuSurface sensor={sensor} scene={scene} geometry={boundary} common={common} boundary />
      )}
    </>
  );
}

function GpuSurface({
  sensor,
  scene,
  geometry,
  cap = false,
  boundary = false,
  lines = false,
  common,
}: {
  sensor: Sensor;
  scene: GpuVisibilityScene;
  geometry: BufferGeometry;
  cap?: boolean;
  boundary?: boolean;
  lines?: boolean;
  common: CommonSensorData | null;
}) {
  const highlightOccluded = useStudio((s) => s.highlightOccluded);
  const occlusionEnabled = useStudio((s) => s.occlusionEnabled);
  const opacity = lines ? Math.min(0.8, sensor.opacity * 3 + 0.15) : sensor.opacity;
  const material = useMemo(
    () => visibilityMaterial(sensor, scene, cap, opacity, boundary),
    [cap, boundary],
  );
  useLayoutEffect(
    () =>
      updateVisibilityMaterial(
        material,
        sensor,
        scene,
        opacity,
        highlightOccluded,
        common,
        occlusionEnabled,
      ),
    [material, sensor, scene, opacity, highlightOccluded, common, occlusionEnabled],
  );
  useEffect(() => () => material.dispose(), [material]);
  return lines ? (
    <lineSegments geometry={geometry} material={material} raycast={() => {}} renderOrder={3} />
  ) : (
    <mesh geometry={geometry} material={material} raycast={() => {}} renderOrder={cap ? 4 : 2} />
  );
}
