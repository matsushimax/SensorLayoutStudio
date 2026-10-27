import { identityPose, type Pose, type SceneData } from './types';
import { matrixPose, poseMatrix } from './pose';

export function referenceFrames(scene: SceneData) {
  return [
    { id: 'base_link', name: 'base_link', pose: identityPose() },
    ...(scene.model
      ? [{ id: 'model', name: `Model · ${scene.model.fileName}`, pose: scene.model.poseInBase }]
      : []),
    ...scene.sensors.map((s) => ({ id: `sensor:${s.id}`, name: s.name, pose: s.pose })),
  ];
}

// Reference frames are rigid, in meters; the model's mesh scale does not scale distances.
export function poseInBase(reference: Pose, relative: Pose): Pose {
  return matrixPose(poseMatrix(reference).multiply(poseMatrix(relative)));
}
