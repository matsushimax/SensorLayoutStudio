import { identityPose, type SceneData, type Sensor, type Primitive, type Pose } from './types';
import { uniqueSensorName } from './names';

export function createSensor(kind: 'camera' | 'lidar', name: string): Sensor {
  return {
    id: crypto.randomUUID(),
    name,
    parentFrame: 'base_link',
    pose: { ...identityPose(), positionM: kind === 'camera' ? [1.65, 0, 1.1] : [0, 0, 1.95] },
    params:
      kind === 'camera'
        ? { kind, horizontalFovDeg: 70, verticalFovDeg: 45, nearM: 0.15, farM: 5 }
        : {
            kind,
            azimuthStartDeg: -180,
            azimuthSpanDeg: 360,
            elevationMinDeg: -15,
            elevationMaxDeg: 15,
            nearM: 0.3,
            farM: 3.5,
          },
    color: kind === 'camera' ? '#078f9f' : '#db9c27',
    visible: true,
    opacity: kind === 'camera' ? 0.13 : 0.07,
  };
}
export function createPrimitive(shape: Primitive['shape'], name: string): Primitive {
  return {
    id: crypto.randomUUID(),
    name,
    shape,
    pose: { ...identityPose(), positionM: [4, 0, 0.5] },
    dimensionsM: shape === 'box' ? [1, 1, 1] : shape === 'sphere' ? [0.5, 0.5, 0.5] : [0.4, 0.4, 1],
    visible: true,
  };
}
export function createDemoScene(): SceneData {
  const camera = createSensor('camera', 'front_camera');
  const lidar = createSensor('lidar', 'roof_lidar');
  const box = createPrimitive('box', 'Target / crate');
  box.pose.positionM = [4.4, 0.4, 0.55];
  box.dimensionsM = [0.85, 0.85, 1.1];
  const cylinder = createPrimitive('cylinder', 'Reference / bollard');
  cylinder.pose.positionM = [0.6, 3.7, 0.6];
  cylinder.dimensionsM = [0.25, 0.25, 1.2];
  return {
    schemaVersion: '0.1.0',
    unit: 'm',
    baseFrame: 'base_link',
    name: 'Rover / sensor study',
    sensors: [camera, lidar],
    primitives: [box, cylinder],
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function number(value: unknown, label: string, min = -1e6, max = 1e6): number {
  assert(
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max,
    `${label}: expected a number between ${min} and ${max}.`,
  );
  return value;
}
function record(value: unknown): Record<string, unknown> {
  assert(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'Invalid scene object.',
  );
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string): string {
  assert(
    typeof value === 'string' && value.trim().length > 0 && value.length <= 200,
    `${label}: expected 1–200 characters.`,
  );
  return value;
}
function boolean(value: unknown, label: string): boolean {
  assert(typeof value === 'boolean', `${label}: expected a boolean.`);
  return value;
}
function vector(value: unknown, size: number, label: string): number[] {
  assert(Array.isArray(value) && value.length === size, `${label}: expected ${size} values.`);
  return value.map((n) => number(n, label));
}
function pose(value: unknown): Pose {
  const v = record(value),
    p = vector(v.positionM, 3, 'Position') as Pose['positionM'];
  const q = vector(v.quaternionXYZW, 4, 'Quaternion');
  const length = Math.hypot(...q);
  assert(length > 1e-8, 'Quaternion must have non-zero length.');
  return { positionM: p, quaternionXYZW: q.map((n) => n / length) as Pose['quaternionXYZW'] };
}

// Reconstruct only the supported schema; no arbitrary objects or paths enter state.
export function parseScene(text: string): SceneData {
  const source = record(JSON.parse(text));
  assert(source.schemaVersion === '0.1.0', 'Unsupported scene version. Expected 0.1.0.');
  assert(
    source.unit === 'm' && source.baseFrame === 'base_link',
    'Scene must use meters and base_link.',
  );
  assert(
    Array.isArray(source.sensors) && Array.isArray(source.primitives),
    'Scene must contain sensor and primitive arrays.',
  );
  assert(
    source.sensors.length <= 100 && source.primitives.length <= 500,
    'Scene limit: 100 sensors / 500 obstacles.',
  );
  const ids = new Set<string>();
  const readId = (value: unknown) => {
    const id = string(value, 'ID');
    assert(!ids.has(id) && id !== 'model', 'Duplicate or reserved object ID.');
    ids.add(id);
    return id;
  };
  const sensors: Sensor[] = source.sensors.map((value) => {
    const s = record(value),
      p = record(s.params);
    assert(s.parentFrame === 'base_link', 'Sensor parent frame must be base_link.');
    const nearM = number(p.nearM, 'Near', 0, 10000),
      farM = number(p.farM, 'Far', 0, 10000);
    assert(farM > nearM, 'Far must be greater than near.');
    let params: Sensor['params'];
    if (p.kind === 'camera') {
      assert(nearM > 0, 'Camera near must be positive.');
      params = {
        kind: 'camera',
        nearM,
        farM,
        horizontalFovDeg: number(p.horizontalFovDeg, 'Horizontal FOV', 0.1, 179),
        verticalFovDeg: number(p.verticalFovDeg, 'Vertical FOV', 0.1, 179),
      };
    } else {
      assert(p.kind === 'lidar', 'Unknown sensor type.');
      params = {
        kind: 'lidar',
        nearM,
        farM,
        azimuthStartDeg: number(p.azimuthStartDeg, 'Azimuth start', -360, 360),
        azimuthSpanDeg: number(p.azimuthSpanDeg, 'Azimuth span', 0.1, 360),
        elevationMinDeg: number(p.elevationMinDeg, 'Elevation min', -90, 90),
        elevationMaxDeg: number(p.elevationMaxDeg, 'Elevation max', -90, 90),
      };
      assert(params.elevationMaxDeg > params.elevationMinDeg, 'Elevation max must exceed min.');
    }
    assert(typeof s.color === 'string' && /^#[0-9a-f]{6}$/i.test(s.color), 'Invalid sensor color.');
    return {
      id: readId(s.id),
      name: string(s.name, 'Name'),
      parentFrame: 'base_link',
      pose: pose(s.pose),
      params,
      color: s.color,
      visible: boolean(s.visible, 'Visible'),
      opacity: number(s.opacity ?? 0.12, 'Opacity', 0, 1),
    };
  });
  const assignedNames: string[] = [];
  const originalNames = sensors.map((s) => s.name);
  for (const sensor of sensors) {
    if (assignedNames.includes(sensor.name) || ['base_link', 'model'].includes(sensor.name))
      sensor.name = uniqueSensorName(sensor.name, [...originalNames, ...assignedNames]);
    assignedNames.push(sensor.name);
  }
  const primitives: Primitive[] = source.primitives.map((value) => {
    const p = record(value);
    assert(['box', 'sphere', 'cylinder'].includes(String(p.shape)), 'Unsupported primitive shape.');
    const dimensions = vector(p.dimensionsM, 3, 'Dimensions') as Primitive['dimensionsM'];
    assert(
      dimensions.every((n) => n > 0 && n <= 10000),
      'Dimensions must be positive and at most 10000m.',
    );
    return {
      id: readId(p.id),
      name: string(p.name, 'Name'),
      shape: p.shape as Primitive['shape'],
      pose: pose(p.pose),
      dimensionsM: dimensions,
      visible: boolean(p.visible, 'Visible'),
    };
  });
  const scene: SceneData = {
    schemaVersion: '0.1.0',
    unit: 'm',
    baseFrame: 'base_link',
    name: source.name === undefined ? 'Untitled study' : string(source.name, 'Scene name'),
    sensors,
    primitives,
  };
  if (source.model !== undefined) {
    const m = record(source.model);
    const fileName = string(m.fileName, 'Model filename');
    assert(!/[\\/]/.test(fileName), 'Model reference must be a filename, not a path.');
    scene.model = {
      fileName,
      poseInBase: pose(m.poseInBase),
      scaleFactor: number(m.scaleFactor, 'Model scale', 0.000001, 10000),
      visible: boolean(m.visible ?? true, 'Model visible'),
    };
  }
  return scene;
}
