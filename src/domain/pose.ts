import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { Pose, Quat, SceneData, Vec3 } from './types';

export const degToRad = (n: number) => (n * Math.PI) / 180;
export const radToDeg = (n: number) => (n * 180) / Math.PI;
// Three.js intrinsic ZYX equals the specified fixed-axis X, Y, Z composition.
export function rpyToQuaternion(rpyDeg: Vec3): Quat {
  return new Quaternion()
    .setFromEuler(new Euler(...(rpyDeg.map(degToRad) as Vec3), 'ZYX'))
    .normalize()
    .toArray();
}
export function quaternionToRpy(q: Quat): Vec3 {
  const e = new Euler().setFromQuaternion(new Quaternion(...q).normalize(), 'ZYX');
  return [e.x, e.y, e.z].map(radToDeg) as Vec3;
}
export function poseMatrix(pose: Pose): Matrix4 {
  return new Matrix4().compose(
    new Vector3(...pose.positionM),
    new Quaternion(...pose.quaternionXYZW).normalize(),
    new Vector3(1, 1, 1),
  );
}
export function matrixPose(matrix: Matrix4): Pose {
  const position = new Vector3(),
    rotation = new Quaternion();
  matrix.decompose(position, rotation, new Vector3());
  return { positionM: position.toArray(), quaternionXYZW: rotation.normalize().toArray() };
}
export function rowMajor(matrix: Matrix4): number[] {
  const e = matrix.elements;
  return [0, 1, 2, 3].flatMap((row) => [0, 1, 2, 3].map((col) => e[col * 4 + row]));
}
export function relativePose(a: Pose, b: Pose): Pose {
  return matrixPose(poseMatrix(a).invert().multiply(poseMatrix(b)));
}
export function exportTransforms(scene: SceneData) {
  const entries = scene.sensors.map((sensor) => ({
    sensorId: sensor.id,
    frame: sensor.name,
    parentFrame: 'base_link',
    translationM: sensor.pose.positionM,
    quaternionXYZW: new Quaternion(...sensor.pose.quaternionXYZW).normalize().toArray(),
    matrix: rowMajor(poseMatrix(sensor.pose)),
  }));
  return {
    schemaVersion: '0.1.0',
    unit: 'm',
    baseFrame: 'base_link',
    convention: {
      axes: 'X forward, Y left, Z up; right-handed',
      matrixStorage: 'row-major',
      vectors: 'column',
      quaternionOrder: 'xyzw',
      transformDirection: 'T_A_B transforms coordinates in B into A: p_A = T_A_B * p_B',
      rpy: 'fixed-axis XYZ; R = Rz(yaw) * Ry(pitch) * Rx(roll)',
    },
    sensors: entries,
    relativeTransforms: scene.sensors.flatMap((a) =>
      scene.sensors
        .filter((b) => b.id !== a.id)
        .map((b) => {
          const m = poseMatrix(a.pose).invert().multiply(poseMatrix(b.pose));
          const pose = matrixPose(m);
          return {
            fromSensorId: b.id,
            toSensorId: a.id,
            notation: `T_${a.name}_${b.name}`,
            translationM: pose.positionM,
            quaternionXYZW: pose.quaternionXYZW,
            matrix: rowMajor(m),
          };
        }),
    ),
    cameraOpticalFrame: {
      description:
        'T_cameraBody_cameraOptical; body X forward/Y left/Z up, optical Z forward/X right/Y down',
      matrix: [0, 0, 1, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 1],
    },
  };
}
