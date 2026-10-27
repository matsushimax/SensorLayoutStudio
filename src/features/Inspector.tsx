import {
  Camera,
  Radar,
  Box,
  Focus,
  Copy,
  Trash2,
  SlidersHorizontal,
  RotateCcw,
  Link2,
  ArrowUpRight,
  Eye,
} from 'lucide-react';
import { useStudio } from '../state/store';
import { intersectsFov } from '../domain/fov';
import { identityPose, type Sensor, type Primitive, type Vec3 } from '../domain/types';
import { NumberField, PoseFields, TextField } from './Fields';
import { importModel } from './actions';
import { ReferencePoseFields } from './ReferencePoseFields';

export default function Inspector() {
  const state = useStudio(),
    { scene, selectedId } = state;
  const sensor = scene.sensors.find((s) => s.id === selectedId);
  const primitive = scene.primitives.find((p) => p.id === selectedId);
  const object = sensor ?? primitive;
  return (
    <aside className="inspector" aria-label="Inspector">
      <div className="panel-heading">
        <span>
          <SlidersHorizontal size={15} /> INSPECTOR
        </span>
        <span className="tiny-label">
          {object ? '01 SELECTED' : selectedId === 'model' ? 'MODEL' : 'STUDY'}
        </span>
      </div>
      {object ? (
        <>
          <div className="object-heading">
            <span className={`object-avatar ${sensor?.params.kind ?? 'obstacle'}`}>
              {sensor ? (
                sensor.params.kind === 'camera' ? (
                  <Camera size={23} />
                ) : (
                  <Radar size={23} />
                )
              ) : (
                <Box size={23} />
              )}
            </span>
            <div>
              <span className="eyebrow">
                {sensor
                  ? sensor.params.kind === 'camera'
                    ? 'CAMERA SENSOR'
                    : 'LIDAR SENSOR'
                  : `${primitive!.shape.toUpperCase()} OBSTACLE`}
              </span>
              <strong>{object.name}</strong>
            </div>
          </div>
          <section className="inspector-section">
            <TextField
              label="Name"
              value={object.name}
              onChange={(name) =>
                sensor
                  ? state.updateSensor(object.id, { name })
                  : state.updatePrimitive(object.id, { name })
              }
            />
            <div className="frame-label">
              <Link2 size={12} /> Parent frame <code>base_link</code>
            </div>
          </section>
          <section className="inspector-section">
            <div className="section-heading">
              Transform{' '}
              <button
                className="icon-button"
                title="Reset to base_link origin and orientation"
                aria-label="Reset transform"
                onClick={() => state.updatePose(object.id, identityPose())}
              >
                <RotateCcw size={13} />
              </button>
            </div>
            <ReferencePoseFields key={object.id} id={object.id} pose={object.pose} />
          </section>
          {sensor && <SensorFields sensor={sensor} />}
          {sensor && <OcclusionPreview sensor={sensor} />}
          {primitive && <PrimitiveFields primitive={primitive} />}
          <section className="inspector-section">
            <div className="section-heading">Display</div>
            <label className="toggle-row">
              <span>
                <Eye size={14} /> Visible in scene
              </span>
              <input
                type="checkbox"
                checked={object.visible}
                onChange={(e) =>
                  sensor
                    ? state.updateSensor(object.id, { visible: e.target.checked })
                    : state.updatePrimitive(object.id, { visible: e.target.checked })
                }
              />
            </label>
            {sensor && (
              <>
                <div className="color-row">
                  <span>Sensor color</span>
                  <input
                    type="color"
                    aria-label="Sensor color"
                    value={sensor.color}
                    onChange={(e) => state.updateSensor(sensor.id, { color: e.target.value })}
                  />
                  <code>{sensor.color}</code>
                </div>
                <NumberField
                  label="FOV opacity"
                  value={sensor.opacity}
                  step={0.01}
                  min={0}
                  max={1}
                  onChange={(opacity) => state.updateSensor(sensor.id, { opacity })}
                />
              </>
            )}
          </section>
          <section className="inspector-section">
            <div className="section-heading">
              FOV intersection <span className="tag">APPROX.</span>
            </div>
            <IntersectionList sensor={sensor} primitive={primitive} />
          </section>
          <div className="object-actions">
            <button onClick={() => state.setView('focus')}>
              <Focus size={14} /> Focus
            </button>
            <button onClick={state.duplicate}>
              <Copy size={14} /> Duplicate
            </button>
            <button
              aria-label="Delete selected object"
              title="Delete selected object"
              className="danger"
              onClick={state.remove}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </>
      ) : selectedId === 'model' && scene.model ? (
        <>
          <div className="empty-inspector">
            <Box size={28} />
            <h3>Imported model</h3>
            <p>{scene.model.fileName}</p>
          </div>
          <section className="inspector-section">
            <div className="section-heading">Model → base_link</div>
            {/\.stl$/i.test(scene.model.fileName) && (
              <label className="text-label">
                <span>STL units</span>
                <select
                  aria-label="STL units"
                  value={
                    [0.001, 0.01, 1, 0.0254].includes(scene.model.scaleFactor)
                      ? String(scene.model.scaleFactor)
                      : 'custom'
                  }
                  onChange={(e) => {
                    if (e.target.value !== 'custom') {
                      state.updateModel({ scaleFactor: Number(e.target.value) });
                      state.setView('fit');
                    }
                  }}
                >
                  <option value="0.001">Millimeters (mm)</option>
                  <option value="0.01">Centimeters (cm)</option>
                  <option value="1">Meters (m)</option>
                  <option value="0.0254">Inches (in)</option>
                  <option value="custom" disabled>
                    Custom scale
                  </option>
                </select>
                <p className="hint">
                  STL has no unit metadata. Choose the units used when exporting your mesh.
                </p>
              </label>
            )}
            <PoseFields
              pose={scene.model.poseInBase}
              onChange={(poseInBase) => state.updateModel({ poseInBase })}
            />
            <NumberField
              label="Scale factor"
              value={scene.model.scaleFactor}
              min={0.000001}
              onChange={(scaleFactor) => state.updateModel({ scaleFactor })}
            />
            <button
              className="secondary full"
              onClick={() =>
                state.updateModel({
                  poseInBase: {
                    positionM: [0, 0, 0],
                    quaternionXYZW: [Math.SQRT1_2, 0, 0, Math.SQRT1_2],
                  },
                })
              }
            >
              Propose Y-up → Z-up
            </button>
            <p className="hint">Confirm the forward axis, scale, and origin against your model.</p>
            <button
              className="secondary full"
              onClick={() =>
                state.updateModel({
                  poseInBase: { ...scene.model!.poseInBase, quaternionXYZW: [0, 0, 0, 1] },
                })
              }
            >
              Use source axes (Z-up)
            </button>
            {/\.(step|stp)$/i.test(scene.model.fileName) && (
              <p className="hint">
                STEP surfaces are tessellated in meters (0.5 mm linear deflection, 0.1 rad angular
                deflection). CAD editing/history is not imported.
              </p>
            )}
          </section>
          <section className="inspector-section">
            <button className="secondary full" onClick={importModel}>
              <Link2 size={14} /> Re-select model file
            </button>
            <button className="danger full" onClick={state.remove}>
              Remove model
            </button>
          </section>
        </>
      ) : (
        <>
          <div className="empty-inspector">
            <SlidersHorizontal size={30} />
            <h3>Your sensor workspace</h3>
            <p>Select a sensor or obstacle in the scene to inspect its properties.</p>
          </div>
          <section className="inspector-section">
            <TextField
              label="Study name"
              value={scene.name}
              onChange={(name) => state.commit({ ...scene, name })}
            />
            <div className="study-metric">
              <span>Sensors</span>
              <strong>{scene.sensors.length.toString().padStart(2, '0')}</strong>
            </div>
            <div className="study-metric">
              <span>Obstacles</span>
              <strong>{scene.primitives.length.toString().padStart(2, '0')}</strong>
            </div>
          </section>
          <section className="inspector-section">
            <div className="section-heading">
              Coordinate convention <ArrowUpRight size={14} />
            </div>
            <p className="hint">
              Right-handed · meters
              <br />X forward · Y left · Z up
              <br />
              Quaternion [x, y, z, w]
            </p>
            <code className="formula">T_A_B · p_B = p_A</code>
          </section>
        </>
      )}
      <div className="inspector-footer">
        <span className="status-dot" /> Local workspace · no upload
      </div>
    </aside>
  );
}

function SensorFields({ sensor }: { sensor: Sensor }) {
  const { updateSensor } = useStudio();
  const p = sensor.params;
  const update = (key: string, value: number) =>
    updateSensor(sensor.id, { params: { ...p, [key]: value } });
  return (
    <section className="inspector-section">
      <div className="section-heading">
        {p.kind === 'camera' ? 'Field of view' : 'Scan volume'}
        <span className={`type-dot ${p.kind}`} />
      </div>
      {p.kind === 'camera' ? (
        <div className="double-fields">
          <NumberField
            label="Horizontal FOV"
            value={p.horizontalFovDeg}
            unit="°"
            min={0.1}
            max={179}
            step={1}
            onChange={(n) => update('horizontalFovDeg', n)}
          />
          <NumberField
            label="Vertical FOV"
            value={p.verticalFovDeg}
            unit="°"
            min={0.1}
            max={179}
            step={1}
            onChange={(n) => update('verticalFovDeg', n)}
          />
        </div>
      ) : (
        <>
          <div className="double-fields">
            <NumberField
              label="Azimuth start"
              value={p.azimuthStartDeg}
              unit="°"
              step={1}
              onChange={(n) => update('azimuthStartDeg', n)}
            />
            <NumberField
              label="Azimuth span"
              value={p.azimuthSpanDeg}
              unit="°"
              min={0.1}
              max={360}
              step={1}
              onChange={(n) => update('azimuthSpanDeg', n)}
            />
          </div>
          <div className="double-fields">
            <NumberField
              label="Elevation min"
              value={p.elevationMinDeg}
              unit="°"
              min={-90}
              max={90}
              step={1}
              onChange={(n) => update('elevationMinDeg', n)}
            />
            <NumberField
              label="Elevation max"
              value={p.elevationMaxDeg}
              unit="°"
              min={-90}
              max={90}
              step={1}
              onChange={(n) => update('elevationMaxDeg', n)}
            />
          </div>
        </>
      )}
      <div className="double-fields">
        <NumberField
          label="Near distance"
          value={p.nearM}
          unit="m"
          min={0}
          onChange={(n) => update('nearM', n)}
        />
        <NumberField
          label="Far distance"
          value={p.farM}
          unit="m"
          min={0}
          onChange={(n) => update('farM', n)}
        />
      </div>
    </section>
  );
}

function OcclusionPreview({ sensor }: { sensor: Sensor }) {
  const {
    occlusionEnabled,
    occlusionStats,
    toggleOcclusion,
    highlightOccluded,
    toggleHighlightOccluded,
  } = useStudio();
  const stats = occlusionStats[sensor.id];
  return (
    <section className="inspector-section" aria-label="Occlusion preview">
      <div className="section-heading">
        Mesh visibility <span className="tag">PER-PIXEL</span>
      </div>
      <label className="toggle-row">
        <span>Stop rays at surfaces</span>
        <input
          type="checkbox"
          aria-label="Stop rays at surfaces"
          checked={occlusionEnabled}
          onChange={toggleOcclusion}
        />
      </label>
      <label className="toggle-row">
        <span>Highlight blind spots</span>
        <input
          type="checkbox"
          aria-label="Highlight blind spots"
          checked={highlightOccluded}
          disabled={!occlusionEnabled}
          onChange={toggleHighlightOccluded}
        />
      </label>
      <p className="hint">
        Red hatching marks areas inside each sensor's FOV blocked by a surface. Another sensor may
        still see these areas. Turn highlighting off to hide blind spots.
      </p>
      {occlusionEnabled && sensor.visible && (
        <details className="visibility-diagnostics">
          <summary>Sampled diagnostics (separate from display)</summary>
          <div className="occlusion-metric">
            <span>Diagnostic rays blocked</span>
            <output aria-label="Clipped ray samples">
              {stats ? `${stats.blocked} / ${stats.samples}` : 'Updating…'}
            </output>
          </div>
          <div className="occlusion-metric">
            <span>Nearest sampled hit</span>
            <output aria-label="Nearest surface hit">
              {stats?.nearestHitM != null ? `${stats.nearestHitM.toFixed(3)} m` : '—'}
            </output>
          </div>
          <p className="hint">
            These angular samples do not generate the displayed boundary and can miss small
            surfaces. Overlap results below remain geometric.
          </p>
        </details>
      )}
    </section>
  );
}
function PrimitiveFields({ primitive: p }: { primitive: Primitive }) {
  const update = useStudio((s) => s.updatePrimitive);
  const field = (label: string, i: number) => (
    <NumberField
      key={label}
      label={label}
      value={p.dimensionsM[i]}
      min={0.001}
      unit="m"
      onChange={(n) => {
        const dimensions = [...p.dimensionsM] as Vec3;
        dimensions[i] = n;
        if (p.shape === 'sphere') dimensions.fill(n);
        if (p.shape === 'cylinder' && i === 0) dimensions[1] = n;
        update(p.id, { dimensionsM: dimensions });
      }}
    />
  );
  return (
    <section className="inspector-section">
      <div className="section-heading">Dimensions</div>
      <div className="double-fields">
        {p.shape === 'box'
          ? ['Length X', 'Width Y', 'Height Z'].map(field)
          : p.shape === 'sphere'
            ? field('Radius', 0)
            : [field('Radius', 0), field('Height Z', 2)]}
      </div>
    </section>
  );
}
function IntersectionList({ sensor, primitive }: { sensor?: Sensor; primitive?: Primitive }) {
  const { scene } = useStudio();
  const pairs = sensor
    ? scene.primitives
        .filter((p) => p.visible)
        .map((p) => ({ name: p.name, hit: sensor.visible && intersectsFov(sensor, p) }))
    : scene.sensors
        .filter((s) => s.visible)
        .map((s) => ({ name: s.name, hit: !!primitive?.visible && intersectsFov(s, primitive!) }));
  return (
    <>
      <div className="intersection-list">
        {pairs.map((p, i) => (
          <div key={i}>
            <span>{p.name}</span>
            <span className={`result ${p.hit ? 'possible' : ''}`}>
              {p.hit ? 'possible' : 'none'}
            </span>
          </div>
        ))}
        {!pairs.length && <p className="hint">Add a sensor and an obstacle to compare.</p>}
      </div>
      <p className="hint">
        Conservative bounds test. “Possible” can overestimate overlap. Hidden objects are excluded.
      </p>
    </>
  );
}
