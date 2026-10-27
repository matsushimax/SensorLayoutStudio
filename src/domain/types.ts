export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Pose = { positionM: Vec3; quaternionXYZW: Quat };
export type CameraParams = {
  kind: 'camera';
  horizontalFovDeg: number;
  verticalFovDeg: number;
  nearM: number;
  farM: number;
};
export type LidarParams = {
  kind: 'lidar';
  azimuthStartDeg: number;
  azimuthSpanDeg: number;
  elevationMinDeg: number;
  elevationMaxDeg: number;
  nearM: number;
  farM: number;
};
export type Sensor = {
  id: string;
  name: string;
  parentFrame: 'base_link';
  pose: Pose;
  params: CameraParams | LidarParams;
  color: string;
  visible: boolean;
  opacity: number;
};
// Box: [X length, Y width, Z height]. Sphere: [radius, radius, radius].
// Cylinder: [radius, radius, height], with its central axis along local +Z.
export type Primitive = {
  id: string;
  name: string;
  shape: 'box' | 'sphere' | 'cylinder';
  pose: Pose;
  dimensionsM: Vec3;
  visible: boolean;
};
export type ModelReference = {
  fileName: string;
  poseInBase: Pose;
  scaleFactor: number;
  visible: boolean;
};
export type SceneData = {
  schemaVersion: '0.1.0';
  unit: 'm';
  baseFrame: 'base_link';
  name: string;
  model?: ModelReference;
  sensors: Sensor[];
  primitives: Primitive[];
};
export type SceneObject = Sensor | Primitive;
export const identityPose = (): Pose => ({ positionM: [0, 0, 0], quaternionXYZW: [0, 0, 0, 1] });
