import { useState } from 'react';
import { useStudio } from '../state/store';
import { referenceFrames } from '../domain/frames';
import {
  exportTransforms,
  poseMatrix,
  quaternionToRpy,
  relativePose,
  rowMajor,
} from '../domain/pose';
import { saveTransforms } from './actions';

export function TransformPreview() {
  const { scene, selectedId, busy } = useStudio();
  const frames = referenceFrames(scene);
  const [referenceId, setReferenceId] = useState('base_link');
  const [targetId, setTargetId] = useState(`sensor:${selectedId ?? scene.sensors[0]?.id}`);
  const reference = frames.find((f) => f.id === referenceId) ?? frames[0];
  const targets = frames.filter((f) => f.id !== reference.id);
  const target = targets.find((f) => f.id === targetId) ?? targets[0];
  const pose = target ? relativePose(reference.pose, target.pose) : null;
  const matrix = pose ? rowMajor(poseMatrix(pose)) : [];
  const format = (n: number) => Number(n.toFixed(6)).toString();
  return (
    <div className="transform-preview">
      <div className="double-fields">
        <label className="text-label">
          Reference A
          <select
            aria-label="Preview reference"
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
        <label className="text-label">
          Target B
          <select
            aria-label="Preview target"
            value={target?.id ?? ''}
            onChange={(e) => setTargetId(e.target.value)}
          >
            {targets.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">
        T_A_B converts points in B into A: p_A = T_A_B × p_B. Position and rotation below describe B
        in A. Model axes use meters, independent of mesh scale.
      </p>
      {pose && (
        <>
          <table className="transform-values">
            <tbody>
              <tr>
                <th>Position XYZ (m)</th>
                <td>
                  <output aria-label="Relative position">
                    {pose.positionM.map(format).join(', ')}
                  </output>
                </td>
              </tr>
              <tr>
                <th>Roll / Pitch / Yaw (°)</th>
                <td>
                  <output aria-label="Relative rotation">
                    {quaternionToRpy(pose.quaternionXYZW).map(format).join(', ')}
                  </output>
                </td>
              </tr>
              <tr>
                <th>Quaternion XYZW</th>
                <td>
                  <output aria-label="Relative quaternion">
                    {pose.quaternionXYZW.map(format).join(', ')}
                  </output>
                </td>
              </tr>
            </tbody>
          </table>
          <div className="section-heading">T_A_B · row-major 4 × 4</div>
          <table className="transform-matrix" aria-label="Relative transform matrix">
            <tbody>
              {[0, 1, 2, 3].map((r) => (
                <tr key={r}>
                  {matrix.slice(r * 4, r * 4 + 4).map((v, c) => (
                    <td key={c}>{format(v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="hint">
        Preview numbers are rounded to 6 decimals. The JSON below retains export precision. Export
        includes every sensor relative to base_link and every ordered sensor pair; model-relative
        values are preview-only.
      </p>
      <details>
        <summary>Exact export JSON · all sensor transforms</summary>
        <textarea
          aria-label="Export JSON preview"
          readOnly
          value={JSON.stringify(exportTransforms(scene), null, 2)}
        />
      </details>
      <button
        className="primary full"
        disabled={busy || !scene.sensors.length}
        onClick={saveTransforms}
      >
        Save transforms JSON
      </button>
    </div>
  );
}
