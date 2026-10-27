import { useEffect, useRef, useState } from 'react';
import type { Pose, Vec3 } from '../domain/types';
import { quaternionToRpy, rpyToQuaternion } from '../domain/pose';

export function NumberField({
  label,
  value,
  onChange,
  step = 0.1,
  min,
  max,
  unit,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
}) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(4))));
  const cancelled = useRef(false);
  const edited = useRef(false);
  useEffect(() => {
    setDraft(String(Number(value.toFixed(4))));
    edited.current = false;
  }, [value]);
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const n = Number(draft);
    if (edited.current && draft.trim() && Number.isFinite(n) && n !== value) onChange(n);
    edited.current = false;
    setDraft(String(Number(value.toFixed(4))));
  };
  return (
    <label className="number-label">
      <span>{label}</span>
      <div className="number-input">
        <input
          aria-label={label}
          type="number"
          step={step}
          min={min}
          max={max}
          value={draft}
          onChange={(e) => {
            edited.current = true;
            setDraft(e.target.value);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              cancelled.current = true;
              setDraft(String(value));
              e.currentTarget.blur();
            }
          }}
        />
        {unit && <span>{unit}</span>}
      </div>
    </label>
  );
}
export function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="text-label">
      <span>{label}</span>
      <input
        aria-label={label}
        maxLength={200}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = draft.trim();
          if (v && v !== value) onChange(v);
          setDraft(value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}
export function PoseFields({ pose, onChange }: { pose: Pose; onChange: (pose: Pose) => void }) {
  const rpy = quaternionToRpy(pose.quaternionXYZW);
  return (
    <>
      <div className="field-caption">
        POSITION <span>m</span>
      </div>
      <div className="triple-fields">
        {['X', 'Y', 'Z'].map((axis, i) => (
          <NumberField
            key={axis}
            label={`Position ${axis}`}
            value={pose.positionM[i]}
            onChange={(n) => {
              const p = [...pose.positionM] as Vec3;
              p[i] = n;
              onChange({ ...pose, positionM: p });
            }}
          />
        ))}
      </div>
      <div className="field-caption">
        ROTATION <span>deg · fixed XYZ</span>
      </div>
      <div className="triple-fields">
        {['Roll', 'Pitch', 'Yaw'].map((axis, i) => (
          <NumberField
            key={axis}
            label={axis}
            value={rpy[i]}
            step={1}
            onChange={(n) => {
              const angles = [...rpy] as Vec3;
              angles[i] = n;
              onChange({ ...pose, quaternionXYZW: rpyToQuaternion(angles) });
            }}
          />
        ))}
      </div>
    </>
  );
}
