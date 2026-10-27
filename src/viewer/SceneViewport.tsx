import { Component, type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Edges, Grid, OrbitControls, Line } from '@react-three/drei';
import { Box3, Group, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useStudio } from '../state/store';
import { boundingSphere, intersectsFov, sceneBounds } from '../domain/fov';
import type { Pose, Primitive, Sensor, Vec3 } from '../domain/types';
import { FovVolumes } from './FovVolumes';
import { CombinedTransformControls } from './CombinedTransformControls';

export default function SceneViewport() {
  return (
    <ViewerBoundary>
      <Canvas
        shadows
        frameloop="demand"
        dpr={[1, 1.75]}
        camera={{ position: [10, -13, 10], up: [0, 0, 1], fov: 42, near: 0.02, far: 10000 }}
        onPointerMissed={(event) => {
          if (event.type === 'click') useStudio.getState().select(null);
        }}
      >
        <color attach="background" args={['#e9eeeb']} />
        <Scene />
      </Canvas>
    </ViewerBoundary>
  );
}

class ViewerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="viewer-error">
        <strong>3D rendering is unavailable</strong>
        <p>Enable WebGL / hardware acceleration and reload the application.</p>
        <button onClick={() => location.reload()}>Reload viewer</button>
      </div>
    ) : (
      this.props.children
    );
  }
}

function Scene() {
  const { scene, modelObject, showGrid } = useStudio();
  return (
    <>
      <ambientLight intensity={1.6} />
      <hemisphereLight args={['#ffffff', '#6e8177', 1.5]} />
      <directionalLight
        position={[2, -5, 12]}
        intensity={3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-normalBias={0.03}
      />
      <mesh position={[0, 0, -0.04]} receiveShadow userData={{ occluder: true }}>
        <planeGeometry args={[2000, 2000]} />
        <meshStandardMaterial color="#e9eeeb" roughness={1} />
      </mesh>
      {showGrid && (
        <Grid
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, -0.015]}
          args={[100, 100]}
          cellSize={1}
          sectionSize={5}
          cellThickness={0.55}
          sectionThickness={0.9}
          cellColor="#b5c5bd"
          sectionColor="#9aafa2"
          fadeDistance={45}
          infiniteGrid
        />
      )}
      <WorldAxes />
      {!scene.model && <Rover />}
      {scene.model && scene.model.visible && modelObject && (
        <Editable id="model" pose={scene.model.poseInBase}>
          <group scale={scene.model.scaleFactor} userData={{ occluder: true }}>
            <primitive object={modelObject} />
          </group>
        </Editable>
      )}
      {scene.sensors
        .filter((s) => s.visible)
        .map((sensor) => (
          <Editable key={sensor.id} id={sensor.id} pose={sensor.pose}>
            <SensorBody sensor={sensor} />
          </Editable>
        ))}
      {scene.primitives
        .filter((p) => p.visible)
        .map((primitive) => (
          <Editable key={primitive.id} id={primitive.id} pose={primitive.pose}>
            <Obstacle primitive={primitive} />
          </Editable>
        ))}
      <CameraRig />
      <FovVolumes />
    </>
  );
}

function Editable({ id, pose, children }: { id: string; pose: Pose; children: ReactNode }) {
  const ref = useRef<Group>(null!);
  const dragging = useRef(false);
  const { selectedId, mode, space, select, checkpoint, updatePose } = useStudio();
  const selected = selectedId === id;
  useLayoutEffect(() => {
    if (!dragging.current) {
      ref.current.position.fromArray(pose.positionM);
      ref.current.quaternion.fromArray(pose.quaternionXYZW);
      ref.current.updateMatrixWorld();
    }
  }, [pose]);
  const sync = () => {
    if (dragging.current)
      updatePose(
        id,
        {
          positionM: ref.current.position.toArray(),
          quaternionXYZW: ref.current.quaternion.clone().normalize().toArray(),
        },
        false,
      );
  };
  return (
    <>
      <group
        ref={ref}
        onClick={(event) => {
          event.stopPropagation();
          select(id, event.ctrlKey || event.metaKey);
        }}
      >
        {children}
      </group>
      {selected && (
        <CombinedTransformControls
          object={ref}
          mode={mode}
          space={space}
          onStart={() => {
            checkpoint();
            dragging.current = true;
          }}
          onChange={sync}
          onEnd={() => {
            sync();
            dragging.current = false;
          }}
        />
      )}
    </>
  );
}

function SensorBody({ sensor }: { sensor: Sensor }) {
  const selected = useStudio((s) => s.selectedId === sensor.id);
  return (
    <group>
      {sensor.params.kind === 'camera' ? (
        <>
          <mesh castShadow>
            <boxGeometry args={[0.28, 0.25, 0.22]} />
            <meshStandardMaterial color="#263e3d" roughness={0.4} />
            {selected && <Edges color="#17a995" />}
          </mesh>
          <mesh position={[0.19, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <cylinderGeometry args={[0.07, 0.09, 0.12, 24]} />
            <meshStandardMaterial color={sensor.color} metalness={0.6} roughness={0.25} />
          </mesh>
        </>
      ) : (
        <>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.19, 0.18, 32]} />
            <meshStandardMaterial color="#263e3d" />
            {selected && <Edges color="#17a995" />}
          </mesh>
          <mesh position={[0, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.185, 0.185, 0.065, 32]} />
            <meshStandardMaterial color={sensor.color} metalness={0.5} roughness={0.3} />
          </mesh>
        </>
      )}
      {selected && <axesHelper args={[0.65]} />}
    </group>
  );
}

function Obstacle({ primitive: p }: { primitive: Primitive }) {
  const { scene, selectedId } = useStudio();
  const hit = scene.sensors.some((s) => s.visible && intersectsFov(s, p));
  return (
    <mesh
      userData={{ occluder: true }}
      rotation={p.shape === 'cylinder' ? [Math.PI / 2, 0, 0] : [0, 0, 0]}
      castShadow
      receiveShadow
    >
      {p.shape === 'box' ? (
        <boxGeometry args={p.dimensionsM} />
      ) : p.shape === 'sphere' ? (
        <sphereGeometry args={[p.dimensionsM[0], 32, 24]} />
      ) : (
        <cylinderGeometry args={[p.dimensionsM[0], p.dimensionsM[0], p.dimensionsM[2], 32]} />
      )}
      <meshStandardMaterial color={hit ? '#cf9e5b' : '#b1beb6'} roughness={0.7} />
      <Edges threshold={20} color={selectedId === p.id ? '#078f80' : hit ? '#9b703c' : '#83988a'} />
    </mesh>
  );
}

function Part({
  position,
  size,
  color,
  metalness = 0,
}: {
  position: Vec3;
  size: Vec3;
  color: string;
  metalness?: number;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={0.45} />
      <Edges color="#53635b" threshold={30} />
    </mesh>
  );
}
function Rover() {
  return (
    <group userData={{ occluder: true }}>
      <Part position={[0, 0, 0.48]} size={[2.9, 1.35, 0.25]} color="#263a37" />
      <Part position={[0.05, 0, 0.83]} size={[3.1, 1.48, 0.55]} color="#e1e4cf" />
      <Part position={[-0.28, 0, 1.35]} size={[1.6, 1.28, 0.55]} color="#d4dcc9" />
      <Part position={[-0.28, 0, 1.67]} size={[1.8, 1.42, 0.09]} color="#e6e9d7" />
      <Part
        position={[0.535, 0, 1.38]}
        size={[0.025, 1.12, 0.36]}
        color="#476966"
        metalness={0.4}
      />
      {[-1, 1].map((sign) => (
        <group key={sign}>
          <Part
            position={[-0.28, sign * 0.65, 1.38]}
            size={[1.36, 0.02, 0.35]}
            color="#476966"
            metalness={0.4}
          />
          <Part position={[-0.28, sign * 0.675, 1.38]} size={[0.05, 0.025, 0.37]} color="#cbd3c0" />
          <Part position={[1.61, sign * 0.5, 0.9]} size={[0.08, 0.3, 0.11]} color="#fff3bc" />
          <Part position={[0, sign * 0.77, 0.63]} size={[2.8, 0.08, 0.12]} color="#263a37" />
          {[-1, 1].map((x) => (
            <group key={x} position={[x, sign * 0.78, 0.43]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.43, 0.43, 0.27, 32]} />
                <meshStandardMaterial color="#263431" roughness={0.85} />
              </mesh>
              <mesh position={[0, sign * 0.145, 0]}>
                <cylinderGeometry args={[0.24, 0.24, 0.035, 12]} />
                <meshStandardMaterial color="#7a8a7c" metalness={0.5} roughness={0.35} />
              </mesh>
              <mesh position={[0, sign * 0.17, 0]}>
                <cylinderGeometry args={[0.1, 0.1, 0.04, 12]} />
                <meshStandardMaterial color="#2e4540" />
              </mesh>
            </group>
          ))}
        </group>
      ))}
      <Part position={[1.62, 0, 0.57]} size={[0.18, 1.6, 0.17]} color="#324742" />
      <Part position={[-1.56, 0, 0.57]} size={[0.18, 1.6, 0.17]} color="#324742" />
      <Part position={[0, 0, 1.79]} size={[0.45, 0.45, 0.15]} color="#647c6b" />
    </group>
  );
}

function WorldAxes() {
  return (
    <group position={[0, 0, 0.005]}>
      <Line
        points={[
          [0, 0, 0],
          [2, 0, 0],
        ]}
        color="#bc6b61"
        lineWidth={1.3}
      />
      <Line
        points={[
          [0, 0, 0],
          [0, 2, 0],
        ]}
        color="#6b947a"
        lineWidth={1.3}
      />
      <Line
        points={[
          [0, 0, 0],
          [0, 0, 2.4],
        ]}
        color="#678bac"
        lineWidth={1.3}
      />
    </group>
  );
}

function CameraRig() {
  const ref = useRef<OrbitControlsImpl>(null!);
  const { camera } = useThree();
  const { view } = useStudio();
  useEffect(() => {
    const state = useStudio.getState();
    const bounds = sceneBounds(state.scene.sensors, state.scene.primitives);
    if (state.modelObject && state.scene.model?.visible) {
      state.modelObject.updateWorldMatrix(true, true);
      const modelBounds = new Box3().setFromObject(state.modelObject);
      if (!modelBounds.isEmpty()) bounds.union(modelBounds);
    }
    let center = boundingSphere(bounds).center,
      radius = Math.max(3, boundingSphere(bounds).radius);
    if (view.preset === 'focus') {
      const object = [...state.scene.sensors, ...state.scene.primitives].find(
        (s) => s.id === state.selectedId,
      );
      if (object) {
        center = new Vector3(...object.pose.positionM);
        radius = 2;
      } else if (state.selectedId === 'model' && state.scene.model)
        center = new Vector3(...state.scene.model.poseInBase.positionM);
    }
    const directions: Record<string, Vec3> = {
      perspective: [1, -1.45, 1.05],
      fit: [1, -1.45, 1.05],
      focus: [1, -1.45, 1.05],
      front: [1, 0, 0.001],
      side: [0, -1, 0.001],
      top: [0.001, 0, 1],
    };
    const direction = new Vector3(...directions[view.preset]).normalize();
    const distance = Math.min(50000, radius * 3.5);
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.up.set(0, 0, 1);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    ref.current.target.copy(center);
    ref.current.update();
  }, [view, camera]);
  return (
    <OrbitControls
      ref={ref}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      minDistance={0.2}
      maxDistance={50000}
    />
  );
}
