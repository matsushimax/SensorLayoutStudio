import { useEffect, useState, type ReactNode } from 'react';
import {
  Box,
  Camera,
  Radar,
  ChevronDown,
  ChevronRight,
  Plus,
  Upload,
  Download,
  Save,
  FolderOpen,
  Undo2,
  Redo2,
  Move3D,
  Rotate3D,
  Grid2X2,
  Scan,
  Maximize,
  Focus,
  Eye,
  EyeOff,
  CircleHelp,
  X,
  Check,
  Layers,
  ArrowUpRight,
  MousePointer2,
  FilePlus2,
  AlertCircle,
  Keyboard,
  LoaderCircle,
  Crosshair,
  PanelLeftClose,
  ShieldCheck,
} from 'lucide-react';
import { useStudio } from './state/store';
import {
  confirmReplace,
  importModel,
  openScene,
  saveScene,
  saveTransforms,
} from './features/actions';
import Inspector from './features/Inspector';
import { SensorViewControls } from './features/SensorViewControls';
import { TransformPreview } from './features/TransformPreview';
import { cancelModelImport } from './platform/meshImport';
import SceneViewport from './viewer/SceneViewport';
import { intersectsFov } from './domain/fov';
import { platformName } from './platform/files';
import { guardBrowserUnload, guardNativeClose } from './platform/lifecycle';
import type { Primitive, Sensor } from './domain/types';

export default function App() {
  const state = useStudio();
  const [help, setHelp] = useState(false);
  const [menu, setMenu] = useState<'sensor' | 'obstacle' | null>(null);
  const [newDialog, setNewDialog] = useState(false);
  const [preview, setPreview] = useState(false);
  const dirty = JSON.stringify(state.scene) !== state.saved;
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void guardNativeClose(
      () => {
        const s = useStudio.getState();
        return JSON.stringify(s.scene) !== s.saved;
      },
      (message) => useStudio.getState().setError(message),
    )
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((e) => useStudio.getState().setError(String(e)));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      const s = useStudio.getState();
      guardBrowserUnload(e, JSON.stringify(s.scene) !== s.saved);
    };
    const keydown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (help || newDialog || preview || useStudio.getState().busy) return;
      const s = useStudio.getState(),
        key = e.key.toLowerCase(),
        mod = e.ctrlKey || e.metaKey;
      if (mod && ['s', 'o', 'z', 'y', 'd'].includes(key)) {
        e.preventDefault();
        if (key === 's') void saveScene();
        if (key === 'o') void openScene();
        if (key === 'd') s.duplicate();
        if (key === 'z') e.shiftKey ? s.redo() : s.undo();
        if (key === 'y') s.redo();
        return;
      }
      if (mod || e.altKey) return;
      if (key === 'w') s.setMode('translate');
      if (key === 'e') s.setMode('rotate');
      if (key === 'f') s.setView('focus');
      if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        s.remove();
      }
      if (key === 'escape') {
        s.select(null);
        setMenu(null);
      }
      if (key === '?') setHelp(true);
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [help, newDialog, preview]);
  const possiblePairs = state.scene.sensors
    .filter(
      (s) =>
        s.visible && (state.sensorViewMode === 'all' || state.selectedSensorIds.includes(s.id)),
    )
    .reduce(
      (count, s) =>
        count + state.scene.primitives.filter((p) => p.visible && intersectsFov(s, p)).length,
      0,
    );

  return (
    <div className="studio-app">
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            state.select(null);
          }}
          aria-label="Sensor Layout Studio home"
        >
          <span className="brand-symbol">
            <Box size={22} strokeWidth={1.7} />
          </span>
          <span>
            Sensor Layout<span className="brand-light"> Studio</span>
          </span>
          <span className="version">0.1</span>
        </a>
        <div className="header-center">
          <span className="status-dot" /> LOCAL WORKSPACE <span className="header-divider" />{' '}
          {platformName}
        </div>
        <button className="header-help" onClick={() => setHelp(true)}>
          <CircleHelp size={16} />
          <span>Quick guide</span>
        </button>
      </header>
      <div className="document-bar">
        <div className="document-title">
          <span className="document-icon">
            <Layers size={18} />
          </span>
          <div>
            <strong>
              {state.scene.name}
              {dirty && <span className="dirty-dot" title="Unsaved changes" />}
            </strong>
            <span>
              Sensor placement study <span className="breadcrumb">/</span> base_link
            </span>
          </div>
        </div>
        <div className="file-actions">
          <button title="New study" onClick={() => setNewDialog(true)} disabled={state.busy}>
            <FilePlus2 size={15} />
            <span>New</span>
          </button>
          <button onClick={openScene} disabled={state.busy}>
            <FolderOpen size={15} />
            <span>Open</span>
          </button>
          <button onClick={saveScene} disabled={state.busy}>
            <Save size={15} />
            <span>Save scene</span>
          </button>
          <span className="action-divider" />
          <button
            onClick={() => setPreview(true)}
            disabled={state.busy || !state.scene.sensors.length}
          >
            <Eye size={15} /> Preview transforms
          </button>
          <button
            className="primary"
            onClick={saveTransforms}
            disabled={state.busy || !state.scene.sensors.length}
          >
            <Download size={15} /> Export transforms <ArrowUpRight size={13} />
          </button>
        </div>
      </div>
      <main className="workspace">
        <aside className="scene-panel" aria-label="Scene explorer">
          <div className="panel-heading">
            <span>
              <Layers size={15} /> SCENE EXPLORER
            </span>
            <PanelLeftClose size={14} />
          </div>
          <div className="tree-root">
            <ChevronDown size={13} />
            <Box size={15} />
            <span>base_link</span>
            <span className="tiny-label">WORLD</span>
          </div>
          <div className="tree-section">
            <div className="tree-section-heading">
              <span>MODEL</span>
              <button
                aria-label="Import 3D model"
                title="Import GLB, STL or STEP model"
                onClick={importModel}
                disabled={state.busy}
              >
                <Upload size={13} />
              </button>
            </div>
            <button
              className={`tree-item ${state.selectedId === 'model' ? 'selected' : ''}`}
              onClick={() => state.select(state.scene.model ? 'model' : null)}
            >
              <Box size={16} />
              <span>{state.scene.model?.fileName ?? 'Rover · sample model'}</span>
              <span className="tree-badge">
                {state.scene.model
                  ? state.scene.model.fileName.split('.').pop()?.toUpperCase()
                  : 'DEMO'}
              </span>
            </button>
            <button className="import-button" onClick={importModel} disabled={state.busy}>
              <Upload size={14} />
              <span>Import model</span>
              <span className="extension">GLB · STL · STEP</span>
            </button>
          </div>
          <div className="tree-section">
            <div className="tree-section-heading">
              <span>
                SENSORS <i>{state.scene.sensors.length.toString().padStart(2, '0')}</i>
              </span>
              <button
                aria-label="Add sensor"
                title="Add sensor"
                onClick={() => setMenu(menu === 'sensor' ? null : 'sensor')}
              >
                <Plus size={15} />
              </button>
            </div>
            {menu === 'sensor' && (
              <div className="add-menu">
                <button
                  onClick={() => {
                    state.addSensor('camera');
                    setMenu(null);
                  }}
                >
                  <Camera size={15} /> Camera
                </button>
                <button
                  onClick={() => {
                    state.addSensor('lidar');
                    setMenu(null);
                  }}
                >
                  <Radar size={15} /> LiDAR
                </button>
              </div>
            )}
            {state.scene.sensors.map((sensor) => (
              <TreeItem key={sensor.id} object={sensor} />
            ))}
            {!state.scene.sensors.length && (
              <p className="tree-empty">Add a camera or LiDAR with +</p>
            )}
            <SensorViewControls />
          </div>
          <div className="tree-section">
            <div className="tree-section-heading">
              <span>
                OBSTACLES <i>{state.scene.primitives.length.toString().padStart(2, '0')}</i>
              </span>
              <button
                aria-label="Add obstacle"
                title="Add obstacle"
                onClick={() => setMenu(menu === 'obstacle' ? null : 'obstacle')}
              >
                <Plus size={15} />
              </button>
            </div>
            {menu === 'obstacle' && (
              <div className="add-menu">
                {(['box', 'sphere', 'cylinder'] as const).map((shape) => (
                  <button
                    key={shape}
                    onClick={() => {
                      state.addPrimitive(shape);
                      setMenu(null);
                    }}
                  >
                    <Box size={15} /> {shape[0].toUpperCase() + shape.slice(1)}
                  </button>
                ))}
              </div>
            )}
            {state.scene.primitives.map((p) => (
              <TreeItem key={p.id} object={p} />
            ))}
            {!state.scene.primitives.length && <p className="tree-empty">Add a primitive with +</p>}
          </div>
          <div className="scene-panel-bottom">
            <div className="study-card">
              <div>
                <Crosshair size={17} />
                <span>Built for spatial thinking.</span>
              </div>
              <p>
                Place sensors. Explore their reach.
                <br />
                Export the relationships.
              </p>
              <button
                onClick={async () => {
                  if (await confirmReplace()) state.reset(true);
                }}
              >
                Load demo study <ArrowUpRight size={13} />
              </button>
            </div>
            <div className="coordinate-note">
              <span className="axis-x">X</span> forward <span className="axis-y">Y</span> left{' '}
              <span className="axis-z">Z</span> up
            </div>
          </div>
        </aside>
        <section className="viewport-panel" aria-label="3D workspace">
          <div className="viewport-toolbar">
            <div className="tool-group">
              <Tool label="Select" active={!state.selectedId} onClick={() => state.select(null)}>
                <MousePointer2 size={16} />
              </Tool>
              <Tool
                label="Move + Rotate"
                active={state.mode === 'both' && !!state.selectedId}
                onClick={() => state.setMode('both')}
              >
                <Layers size={17} />
                <span>Both</span>
              </Tool>
              <Tool
                label="Move (W)"
                active={state.mode === 'translate' && !!state.selectedId}
                onClick={() => state.setMode('translate')}
              >
                <Move3D size={17} />
                <span>Move</span>
              </Tool>
              <Tool
                label="Rotate (E)"
                active={state.mode === 'rotate' && !!state.selectedId}
                onClick={() => state.setMode('rotate')}
              >
                <Rotate3D size={17} />
                <span>Rotate</span>
              </Tool>
              <span className="action-divider" />
              <button
                className="space-button"
                onClick={() => state.setSpace(state.space === 'world' ? 'local' : 'world')}
              >
                {state.space === 'world' ? 'World' : 'Local'}
                <ChevronDown size={11} />
              </button>
            </div>
            <div className="tool-group">
              <Tool label="Undo (Ctrl+Z)" disabled={!state.past.length} onClick={state.undo}>
                <Undo2 size={16} />
              </Tool>
              <Tool
                label="Redo (Ctrl+Shift+Z)"
                disabled={!state.future.length}
                onClick={state.redo}
              >
                <Redo2 size={16} />
              </Tool>
              <span className="action-divider" />
              <Tool label="Toggle grid" active={state.showGrid} onClick={state.toggleGrid}>
                <Grid2X2 size={16} />
              </Tool>
              <Tool label="Toggle FOV volumes" active={state.showFov} onClick={state.toggleFov}>
                <Scan size={17} />
              </Tool>
              <Tool
                label="Toggle occlusion"
                active={state.occlusionEnabled}
                onClick={state.toggleOcclusion}
              >
                <ShieldCheck size={17} />
              </Tool>
              <Tool label="Fit scene" onClick={() => state.setView('fit')}>
                <Maximize size={16} />
              </Tool>
            </div>
          </div>
          <div className="canvas-container">
            <SceneViewport />
            {state.mode !== 'translate' && state.selectedId && (
              <div className="rotation-hint" aria-label="Rotation gizmo guide">
                {state.mode === 'both'
                  ? 'Arrows: move · Rings: rotate (½ axis length)'
                  : 'Drag a ring to rotate:'}
                <span className="axis-x">X</span>
                <span className="axis-y">Y</span>
                <span className="axis-z">Z</span>
                <span>
                  {state.space === 'world' ? 'World axes' : 'Local axes'} · W: move / E: rotate
                </span>
              </div>
            )}
            <div className="viewport-label">
              <span className="status-dot" />
              <span>3D VIEWPORT</span>
              <span className="viewport-label-sub">REAL-TIME</span>
            </div>
            <div className="view-presets" aria-label="View presets">
              {(['perspective', 'front', 'top', 'side'] as const).map((view) => (
                <button
                  key={view}
                  className={state.view.preset === view ? 'active' : ''}
                  onClick={() => state.setView(view)}
                >
                  {view === 'perspective' ? 'Perspective' : view[0].toUpperCase() + view.slice(1)}
                </button>
              ))}
            </div>
            {state.scene.model && !state.modelObject && (
              <div className="model-banner">
                <AlertCircle size={16} />
                <span>
                  Re-select <strong>{state.scene.model.fileName}</strong> to restore the model.
                </span>
                <button onClick={importModel}>
                  Locate model <Upload size={12} />
                </button>
              </div>
            )}
            <div className="scene-corner">
              <span className="corner-number">01</span>
              <span>
                SENSOR
                <br />
                LAYOUT STUDY
              </span>
            </div>
            <button
              className="focus-control"
              title="Focus selected (F)"
              aria-label="Focus selected object"
              onClick={() => state.setView('focus')}
            >
              <Focus size={18} />
            </button>
            <div className="axis-compass" aria-label="X forward, Y left, Z up">
              <span className="compass-z">Z</span>
              <span className="compass-y">Y</span>
              <span className="compass-x">X</span>
              <i />
              <b />
              <em />
            </div>
            {state.busy && (
              <div className="busy-overlay">
                <LoaderCircle className="spin" size={22} />
                <span>Working…</span>
                {state.notice.startsWith('Converting STEP') && (
                  <button className="secondary" onClick={cancelModelImport}>
                    Cancel STEP import
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="analysis-bar">
            <div>
              <span className="analysis-dot" />
              <strong>{possiblePairs.toString().padStart(2, '0')}</strong>
              <span>possible overlaps</span>
              <span className="tag">APPROXIMATE</span>
            </div>
            <span>
              {state.occlusionEnabled
                ? 'Per-pixel occlusion ON · geometric overlap counts'
                : 'Occlusion OFF · full FOV'}
            </span>
          </div>
          <div className="legend">
            <div>
              <span className="legend-swatch camera" /> Camera FOV{' '}
              <span className="legend-swatch lidar" /> LiDAR volume{' '}
              <span className="legend-swatch obstacle" /> Possible overlap
              {state.sensorViewMode === 'common' && (
                <>
                  {' '}
                  <span className="legend-swatch common" /> <span>Common to all selected</span>
                </>
              )}
              {state.occlusionEnabled && state.highlightOccluded && (
                <>
                  {' '}
                  <span className="legend-swatch blind" /> <span>Occluded / blind spot</span>
                </>
              )}
            </div>
            <p>
              {state.sensorViewMode === 'common'
                ? state.occlusionEnabled
                  ? 'Purple: the same 3D location is visible to every selected sensor. Red: a per-sensor blind spot.'
                  : 'Purple: common geometric FOV. Occlusion is OFF; obstacles are not considered.'
                : state.occlusionEnabled
                  ? state.highlightOccluded
                    ? 'Red hatching: blocked for that sensor, inside its FOV. Other sensors may still see the area.'
                    : 'Blind spots hidden. Enable Highlight blind spots in the sensor inspector to show them.'
                  : 'Full theoretical FOV. Enable occlusion to clip rays at surfaces.'}
            </p>
          </div>
        </section>
        <Inspector />
      </main>
      <footer className={`status-bar ${state.error ? 'has-error' : ''}`}>
        <div role="status" aria-live="polite">
          {state.error ? <AlertCircle size={13} /> : <Check size={13} />}
          <span>{state.error ?? state.notice}</span>
          {state.error && (
            <button title="Dismiss error" onClick={() => state.setError(null)}>
              <X size={13} />
            </button>
          )}
        </div>
        <div>
          <span>1 unit = 1 meter</span>
          <span className="status-separator" />
          <button onClick={() => setHelp(true)}>
            <Keyboard size={13} /> Shortcuts
          </button>
        </div>
      </footer>
      {preview && (
        <Modal title="Transform preview" onClose={() => setPreview(false)}>
          <TransformPreview />
        </Modal>
      )}
      {help && (
        <Modal title="A workspace for sensor placement" onClose={() => setHelp(false)}>
          <p className="modal-intro">
            Explore camera and LiDAR layouts on a rover or your own GLB, STL or STEP model.
            Everything stays on your device.
          </p>
          <ol className="guide-steps">
            <li>
              <strong>Place your sensors</strong>
              <span>
                Add a camera or LiDAR from the scene explorer. Select it to edit the transform and
                sensing range.
              </span>
            </li>
            <li>
              <strong>Explore the geometry</strong>
              <span>
                Move with the gizmo or enter exact values. Orange obstacles may overlap a sensor’s
                approximate FOV.
              </span>
            </li>
            <li>
              <strong>Save your study</strong>
              <span>
                Save scene JSON to continue later. Export transforms for base_link and every ordered
                sensor pair.
              </span>
            </li>
          </ol>
          <div className="shortcut-grid">
            {[
              ['Orbit / pan', 'Left / right drag'],
              ['Zoom', 'Scroll'],
              ['Move / rotate', 'W / E'],
              ['Focus selection', 'F'],
              ['Duplicate', 'Ctrl D'],
              ['Delete selection', 'Delete'],
              ['Undo / redo', 'Ctrl Z / Ctrl Shift Z'],
              ['Save / open', 'Ctrl S / Ctrl O'],
            ].map(([label, key]) => (
              <div key={label}>
                <span>{label}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </div>
          <p className="hint">
            GLB, STL and STEP: up to 100 MB. GLB must be self-contained. STL assumes mm; check
            units. STEP is converted locally to a triangle mesh in meters. Model paths are never
            saved. Re-select external models after opening a scene. Occlusion is checked per
            displayed pixel against static mesh triangles. Mesh detail, display resolution and
            floating-point tolerances limit precision. Physical collision and detection probability
            are outside this version.
          </p>
        </Modal>
      )}
      {newDialog && (
        <Modal title="Start a new study" onClose={() => setNewDialog(false)}>
          <p className="modal-intro">Choose a starting point for your sensor layout.</p>
          <div className="new-options">
            <button
              onClick={async () => {
                if (await confirmReplace()) {
                  state.reset(false);
                  setNewDialog(false);
                }
              }}
            >
              <FilePlus2 size={23} />
              <strong>Blank study</strong>
              <span>Sample rover, ready for your sensors.</span>
            </button>
            <button
              onClick={async () => {
                if (await confirmReplace()) {
                  state.reset(true);
                  setNewDialog(false);
                }
              }}
            >
              <Layers size={23} />
              <strong>Demo study</strong>
              <span>Camera, LiDAR and two obstacles.</span>
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TreeItem({ object }: { object: Sensor | Primitive }) {
  const state = useStudio();
  const isSensor = 'params' in object;
  return (
    <div
      className={`tree-item-row ${state.selectedId === object.id ? 'selected' : ''} ${!object.visible ? 'hidden-object' : ''}`}
    >
      {isSensor && (
        <input
          type="checkbox"
          className="sensor-selection-checkbox"
          aria-label={`Include ${object.name} in sensor selection`}
          checked={state.selectedSensorIds.includes(object.id)}
          onChange={() => state.toggleSensorSelection(object.id)}
        />
      )}
      <button
        className="tree-item-main"
        onClick={(event) => state.select(object.id, event.ctrlKey || event.metaKey)}
      >
        {!isSensor && <ChevronRight size={10} className="tree-chevron" />}
        <span style={{ color: isSensor ? object.color : '#8e9c95' }}>
          {isSensor ? (
            object.params.kind === 'camera' ? (
              <Camera size={16} />
            ) : (
              <Radar size={16} />
            )
          ) : (
            <Box size={16} />
          )}
        </span>
        <span>{object.name}</span>
      </button>
      <button
        className="visibility-button"
        aria-label={`${object.visible ? 'Hide' : 'Show'} ${object.name}`}
        onClick={() =>
          isSensor
            ? state.updateSensor(object.id, { visible: !object.visible })
            : state.updatePrimitive(object.id, { visible: !object.visible })
        }
      >
        {object.visible ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>
    </div>
  );
}
function Tool({
  label,
  children,
  onClick,
  active,
  disabled,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={`tool-button ${active ? 'active' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const fn = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button autoFocus aria-label="Close dialog" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
