import { useState } from 'react';
import { useStudio } from '../state/store';
import { referenceFrames, poseInBase } from '../domain/frames';
import { relativePose } from '../domain/pose';
import { PoseFields } from './Fields';
import type { Pose } from '../domain/types';

export function ReferencePoseFields({ id, pose }: { id: string; pose: Pose }) {
  const { scene, updatePose } = useStudio();
  const [referenceId, setReferenceId] = useState('base_link');
  const frames = referenceFrames(scene).filter((f) => f.id !== `sensor:${id}`);
  const reference = frames.find((f) => f.id === referenceId) ?? frames[0];
  const displayed = reference.id === 'base_link' ? pose : relativePose(reference.pose, pose);
  return (
    <>
      <label className="text-label">
        Edit relative to
        <select
          aria-label="Edit relative to"
          value={reference.id}
          onChange={(e) => setReferenceId(e.target.value)}
        >
          {frames.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">
        Coordinates in meters, along the reference axes. Changing the reference keeps the placement
        fixed. Objects do not follow later reference movement. Gizmos use World / Local.
      </p>
      <PoseFields
        key={reference.id}
        pose={displayed}
        onChange={(next) =>
          updatePose(id, reference.id === 'base_link' ? next : poseInBase(reference.pose, next))
        }
      />
    </>
  );
}
