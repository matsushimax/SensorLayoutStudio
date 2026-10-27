# Architecture and geometry

## Boundaries

```text
src/domain/    Data contracts, pose math, FOV bounds, validation
src/state/     Zustand scene transactions, history, transient selection and resources
src/viewer/    React Three Fiber scene, model, controls, sensing-volume meshes
src/features/ Inspector fields and scene/file actions
src/platform/ Browser/Tauri file I/O, GLB loading, native close lifecycle
src-tauri/     Native window, dialog/fs plugins, restricted capabilities, installer
```

The domain has no React, Zustand, Tauri, DOM, filesystem, or network dependencies. It uses Three.js math classes in synchronous TypeScript functions. Tauri APIs are isolated in `platform/`; the browser implementation uses the same editor and calculations.

The persisted scene is plain JSON. Selection, view, history, loaded `Object3D` resources, and file-operation state remain transient. History checkpoints retain scene snapshots and the matching model resource; gizmo movement groups all intermediate changes into one undo operation. Every mutation is validated before replacing the scene. Invalid input leaves the last valid state and history intact.

## Pose conventions

`base_link` is the world frame. X is forward, Y left, Z up. The Three.js camera and OrbitControls explicitly use Z-up, and the ground/grid are in XY. RPY is represented by intrinsic ZYX in Three.js, equivalent to the specified fixed-axis XYZ sequence. Internal pose orientation is a normalized quaternion.

`T_A_B = inverse(T_base_A) × T_base_B`. Exported flat matrices are explicitly serialized in row-major order, independent of Three.js's internal column-major storage. Both transform direction and storage order are exported as metadata. Tests use independently known 90° and mixed-axis outcomes and verify relative-pose composition.

Camera frusta point along local +X. At distance `d`, half-width and half-height are `d × tan(FOV/2)`. The optical frame mapping has its own fixed transform in the export. GLB models keep their own node transforms inside a separately adjustable model-to-base group. Scaling applies to models, not sensor transforms.

## Volume rendering

The camera is a closed truncated pyramid. The LiDAR is a spherical sector with separate near/far surfaces and elevation boundaries. Partial azimuths include caps; 360° sectors share the seam without caps. A non-zero near distance leaves a real geometric cavity. Both volumes have transparent surfaces and independent line outlines. They do not encode real beam patterns.

## Conservative intersection

Each obstacle is enclosed by a sphere centered on its pose:

- Box: half the dimension-vector length.
- Sphere: its specified radius.
- Cylinder (local Z axis): `sqrt(radius² + (height/2)²)`.

For cameras, transform the sphere center to sensor space and test against the six normalized frustum planes. Any separating plane proves no intersection. Otherwise return `possible`, including corner false positives.

For LiDAR, reject disjoint radial intervals, then use angular intervals expanded by the sphere's angular radius. Handle azimuth wrapping by signed angular distance to the interval midpoint. A sphere containing the origin is conservatively possible. A sphere crossing the azimuth axis does not get rejected by azimuth. The elevation and radial tests can still prove separation.

`none` proves the conservative bounds are separated; `possible` can be an overestimate. Hidden sensors and obstacles are excluded by the UI. Rendering visibility of the FOV overlay is independent of the analysis. Vehicle meshes are not included in this broad-phase obstacle test. Mounting collision and detection performance are outside MVP scope; the occlusion display below does not change this test.

## Per-fragment occlusion display

The viewer tags only the original rover, imported-model subtree, primitive meshes, and ground as blockers. Sensor bodies, gizmos, axis helpers, lines, and FOV meshes are excluded. A frame callback snapshots blocker world transforms after editable-object layout effects have run. Blocker changes rebuild the GPU BVH; sensor edits update uniforms while reusing it. Camera orbit renders the current visibility without rebuilding the BVH.

The canvas renders on demand. Scene/resource/visibility changes explicitly invalidate it, including edits that update only shader uniforms. Orbit and transform controls request frames during interaction. An idle editor therefore does not continuously repeat the fragment BVH work.

`domain/occlusion.ts` collects visible tagged meshes, including instance transforms and static imported skin/morph poses. `domain/visibilityMesh.ts` copies their rendered triangle ranges into a world-space snapshot without modifying source buffers. `viewer/gpuVisibility.ts` builds a `three-mesh-bvh` GPU texture representation and supplies shader materials for the FOV shell, outlines, and first-contact surface overlays. GPU textures and merged geometry are disposed when replaced or unmounted.

Collection explicitly excludes `LineSegments2` (including `Line2` and Drei `Edges`) even inside tagged subtrees. These display strokes inherit from `Mesh`, but their position buffer is a screen-space quad template; treating it as world-space triangles creates phantom blockers. Both CPU diagnostics and GPU visibility use the same filtered snapshot.

For each rendered fragment, the shader tests the segment from the sensor origin to its world-space position. A nearer triangle marks the fragment occluded. With blind-spot highlighting enabled (the UI default), occluded shell fragments and receiving surfaces use red screen-space hatching; visible fragments retain the sensor color. Silhouette interfaces also use the blind-spot color, while internal sides hidden by overlapping shadows remain discarded. With highlighting disabled, occluded fragments are discarded as before. Opacity still follows the sensor setting, including zero. The highlight toggle updates uniforms and invalidates demand rendering without changing scene history or persistence. These are per-sensor occlusions, not a combined multi-sensor coverage result.

Double-sided triangles block from either side, and a blocker before the sensing near plane still prevents visibility beyond it. A second pass overlays sensor color on first-contact mesh surfaces inside the analytical camera or LiDAR FOV. Camera membership uses axial near/far planes; LiDAR uses radial ranges, wrapped azimuth and elevation limits. Surface overlays outside that volume are discarded in both display modes. The full theoretical shell is retained for the occlusion-OFF comparison mode.

`domain/shadowBoundary.ts` welds coincident triangle positions and finds projected silhouette edges, including open mesh borders. It extrudes those edges away from the sensor to create the missing sides between lit and shadowed space. Camera sides are polygon-clipped against all six frustum planes; LiDAR sides are bounded by its range cube and analytically clipped in the shader. These are planes through actual mesh edges, with no angular sample interpolation. A small offset toward each edge's unshadowed side lets the fragment shader reject surfaces hidden by nearer geometry or overlapping shadows. The topology is cached with the blocker snapshot; sensor pose/range changes regenerate its clipped side geometry. The edge extrusion follows the shadow-volume construction described in [NVIDIA GPU Gems, chapter 9](https://developer.nvidia.com/gpugems/gpugems/part-ii-lighting-and-shadows/chapter-9-efficient-shadow-volume-rendering); this viewer uses BVH visibility filtering rather than stencil counting.

Receiving-surface overlays use a triangle plane-distance varying to reject coplanar sensing directions. The nearest-hit plane is also checked against the receiving point, preventing a triangle or its coplanar neighbor from incorrectly shadowing itself at grazing incidence. This avoids deriving surface normals from noisy screen derivatives. Shadow sides receive a depth offset behind opaque geometry, avoiding coplanar overlays on a crate top at the sensor's exact height.

The displayed shadow no longer interpolates a fixed angular sample grid. It is limited by raster resolution, the source triangles, and floating-point intersection tolerances (a 1 μm origin offset and distance-dependent comparison/edge-side tolerances). Curved LiDAR shells remain tessellated at up to 2-degree intervals. The displayed boundary combines the clipped shell, first-contact surfaces and silhouette sides; it is not exported as a watertight boolean mesh or used for volume measurements. Glass and other materials are opaque, animated poses are not evaluated, and no optical/reflectance simulation is performed. Large meshes and many visible sensors increase GPU work; representative production-model benchmarking remains future work.

## Selected-sensor comparison

`selectedSensorIds` and `sensorViewMode` are transient store state, independent of the single active inspector/gizmo object. All mode renders every visible sensor; Selected and Common modes render only selected visible sensors. Checkbox or Ctrl-click membership changes do not modify scene data or history. Normal selection isolates one sensor, except in Common mode where it changes only the active editor to allow adjusting a sensor without losing the comparison. Removed IDs are pruned, and loading/new studies reset the display group. The obstacle overlap counter follows the displayed sensor set.

`viewer/commonVisibility.ts` packs each selected sensor's inverse transform, origin, kind, FOV and range into seven RGBA float texels. The shared data texture avoids a fixed-size uniform array limit and is disposed when replaced. The material uses the existing shell, receiver and silhouette-side surfaces as candidate boundaries. For each visible fragment in Common mode, it checks the same world-space point against every other selected sensor's analytic FOV and, when enabled, its sensor-to-point BVH ray. Receiving-plane tolerances avoid self-shadowing; silhouette-side membership uses the same small free-side offset as visibility rendering. A common fragment receives a stronger purple tint; context surfaces and per-sensor blind spots remain subdued. This is a world-space intersection display, not screen-space alpha counting. At least two visible selected sensors are required. Turning occlusion off switches to geometric intersection explicitly labeled in the UI.

The result is a display of the common visible boundary and receiving surfaces. It does not compute a watertight boolean mesh, a union/blind-zone map, area/volume percentages, or detection probability. The common test requires additional BVH work per candidate fragment per selected sensor; FOV rejection occurs before tracing, and demand rendering avoids idle work. Large-model/many-sensor performance still requires workload-specific measurement.

## Sampled diagnostics

The inspector's collapsed diagnostics retain the CPU 49×33 camera grid and approximately 2-degree LiDAR samples. `domain/occlusion.ts` caches an indirect BVH per source geometry and transforms rays into mesh coordinates with world-to-local distance scaling. `viewer/occludedGeometry.ts` still generates sampled geometry for regression tests, but the viewer disposes those buffers and uses only the statistics. Finite sampling can miss thin blockers, and the nearest sampled hit is not a global minimum over every direction. These numbers do not generate the screen image or describe coverage. Diagnostics are recomputed on scene/resource/toggle changes, not on camera orbit or idle frames. The `possible / none` results remain independent, and the toggle/statistics are transient UI data.

## File boundaries

The native adapter uses only open/save dialogs and the corresponding read-file, stat and write-text-file commands. It has no global filesystem scope. Tauri's dialog plugin extends scope for the user-selected file. The application does not persist that permission or absolute paths.

GLB headers and JSON are inspected before loading. External buffer/image URIs are rejected, and a URL modifier rejects unexpected network/file lookups. Required unsupported extensions produce an actionable error. Model bytes are at most 100 MB; browser and native readers check the limit. GLB loading must finish successfully before replacing the current model.

STL uses Three.js STLLoader with pre-validation of headers/facet counts, finite vertices and a 500,000 triangle guard. STL defaults to millimeters and source axes; explicit unit presets adjust the persisted model scale. STEP uses the pinned occt-import-js runtime in a short-lived classic worker. The local WASM returns meter-space meshes with baked placements; the app retains part names and mesh colors in a flat group. Tessellation uses 0.5 mm / 0.1 rad deflection. On success, error, cancellation or timeout the worker terminates to release its WASM heap. Failed imports leave the existing scene/history intact. A new STEP/STL uses source axes; GLB retains its Y-up alignment proposal. All formats relink by filename while preserving the stored transform/scale. See cad-runtime.md for runtime source, licensing and rebuild details.

Scene parsing reconstructs supported fields, checks versions, units, frames, IDs, primitive dimensions, sensor ranges, finite numbers, and color/opacity. Quaternions are normalized and zero quaternions rejected. JSON filenames cannot contain path separators. Failed parsing leaves the existing study untouched. File-dialog cancellation does not alter state.

## Validation and next steps

Vitest checks numerical contracts and scene transactions. Playwright exercises the complete browser flow, file downloads/reopening, GLB relink, real gizmo dragging, and error handling. The Windows workflow compiles an NSIS installer using the same frontend build. A successful installer build does not replace interactive validation of native dialogs on a target machine.

Future work: occlusion heatmaps, coverage metrics, physical sensor housings, ROS2/URDF output, bundled GLB/scene archives, application signing, and benchmarking with large real-world models. The current UI targets desktop windows at least 960 × 680 and is not optimized for phones.
