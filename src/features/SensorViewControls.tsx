import { useStudio, type SensorViewMode } from '../state/store';

export function SensorViewControls() {
  const state = useStudio();
  const chosen = state.scene.sensors.filter((s) => state.selectedSensorIds.includes(s.id));
  const visible = chosen.filter((s) => s.visible).length;
  return (
    <div className="sensor-view-controls" aria-label="Sensor display controls">
      <div className="sensor-view-title">
        SENSOR VIEW <span>{visible} selected</span>
      </div>
      <div className="sensor-view-modes" role="group" aria-label="Sensor view mode">
        {(
          [
            ['all', 'All sensors', 'All'],
            ['selected', 'Selected sensors', 'Selected'],
            ['common', 'Common coverage', 'Common'],
          ] as const
        ).map(([mode, label, text]) => (
          <button
            key={mode}
            aria-label={label}
            aria-pressed={state.sensorViewMode === mode}
            onClick={() => state.setSensorViewMode(mode as SensorViewMode)}
          >
            {text}
          </button>
        ))}
      </div>
      <div className="sensor-selection-actions">
        <button onClick={state.selectAllSensors} aria-label="Select all visible sensors">
          Select all
        </button>
        <button onClick={state.clearSensorSelection} aria-label="Clear sensor selection">
          Clear
        </button>
      </div>
      <p>
        {state.sensorViewMode === 'common'
          ? 'Check sensors to compare. Click a name to edit it; the comparison stays selected.'
          : 'Check sensors to compare. Click a name to select one; Ctrl+click adds or removes it.'}
      </p>
      {chosen.length !== visible && <p>{chosen.length - visible} hidden sensor(s) excluded.</p>}
      {state.sensorViewMode !== 'all' && visible === 0 && (
        <p className="sensor-view-warning">Select a visible sensor to display its FOV.</p>
      )}
      {state.sensorViewMode === 'common' && visible < 2 && (
        <p className="sensor-view-warning">
          Select at least 2 visible sensors for common coverage.
        </p>
      )}
      {state.sensorViewMode === 'common' && visible >= 2 && (
        <p className="common-description">
          Purple: {state.occlusionEnabled ? 'visible to' : 'inside the FOV of'} every selected
          sensor.
        </p>
      )}
    </div>
  );
}
