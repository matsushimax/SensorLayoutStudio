# User guide and calculation limits

[Back to README](../README.md)

## A quick walkthrough

1. Open the demo and select `front_camera`.
2. Drag its red X handle, or change Position X. Press **E** to rotate and **W** to move.
3. Change the camera FOV, then select `roof_lidar` to adjust its scan volume.
4. Select the target crate and move it through a sensing volume. Inspect the `possible / none` results.
5. Export transforms, then save the scene. Import `../examples/calibration-box.glb` to try model alignment.

Orbit with left drag, pan with right drag, zoom with the wheel, and press **F** to focus the selection. The in-app Quick guide lists the remaining shortcuts.

Select a camera or LiDAR to show move arrows and rotation rings together (**Both**). Ring radius is half the origin-to-arrow-tip length. Red rotates around X, green around Y and blue around Z. **World / Local** chooses fixed world axes or the sensor's own axes. Rotation updates the pose fields and FOV; one drag is one undo action. **Move** (**W**) and **Rotate** (**E**) show one tool alone; **Both** restores simultaneous controls.

**Edit relative to** selects base_link, the imported model, or another sensor as the reference for numeric position/rotation edits. Switching references preserves placement. Model coordinates use its origin and orientation, with distances in meters independent of mesh scale. This is an editing reference, not parenting: later reference movement does not move other objects. Saved poses remain in base_link; gizmos still use World / Local. Transform reset returns to the base_link origin and orientation.

**Preview transforms** shows target B in reference A as XYZ, RPY, quaternion and a row-major 4×4 matrix. Expand **Exact export JSON** to inspect the full sensor export before **Save transforms JSON**. Model-relative values are preview-only. Duplicate sensor names receive `_2`, `_3`, etc. on rename, duplication and scene import; base_link and model are reserved names.

Use the shield toolbar button or **Stop rays at surfaces** in the sensor inspector to enable/disable the occlusion preview. Each rendered FOV pixel tests the triangle mesh for a nearer surface; first-contact surfaces inside the sensing volume receive the sensor color. The collapsed **Sampled diagnostics** section reports a separate approximate ray count and nearest sampled distance. These diagnostics do not generate the displayed shadow. This display setting is transient and is not stored in scene JSON.

**Highlight blind spots** defaults on: occluded regions inside each sensor's FOV use red hatching, while visible regions retain the sensor color. It highlights the shadow boundary and occluded receiving surfaces as well as the outer FOV shell. Turn it off to hide blind spots. These are per-sensor dead zones; another sensor may still see the same area. Regions outside the FOV are not classified as blind spots. The highlight toggle is a transient display preference.

![Blind spots highlighted with red hatching](screenshots/blind-spots.png)

Use the sensor-row checkboxes to choose multiple sensors. **SENSOR VIEW → All** shows every visible sensor, **Selected** isolates the chosen sensors' FOVs, and **Common** emphasizes their common region in dark purple. Common highlighting requires at least two selected, visible sensors; hidden sensors are excluded. A point must be inside every selected sensor's FOV and, with occlusion ON, visible from every selected origin. Screen-space overlap alone is insufficient. With occlusion OFF, purple represents geometric FOV intersection. Red hatching remains a per-sensor blind spot, not a combined blind zone.

Clicking a name selects one sensor; Ctrl+click adds/removes a sensor. In Common mode, clicking a name changes the active inspector/gizmo while preserving the comparison group. Checkboxes always change group membership. These display selections are transient, do not dirty the scene or add undo entries, and reset when opening a study. Common area/volume/coverage percentages are not computed.

![Common camera and LiDAR coverage in purple](screenshots/common-coverage.png)

Shadow side surfaces follow the actual occluder silhouette, so the cut volume remains bounded when viewed obliquely. Coplanar and grazing receiving surfaces are handled separately to avoid self-shadow speckling.

![Camera visibility stopped by a wall](screenshots/occlusion-wall.png)

![Occluder silhouette and shadow side surfaces](screenshots/shadow-boundary.png)

## Coordinate and file contracts

- Right-handed **X forward, Y left, Z up**, distance in meters.
- UI RPY uses fixed axes: `R = Rz(yaw) × Ry(pitch) × Rx(roll)`. Stored quaternions use `[x,y,z,w]`.
- `T_A_B` converts coordinates in B into A: `p_A = T_A_B × p_B`.
- Camera viewing direction is local +X. The optical-frame fixed transform is included as export metadata.
- GLB is glTF 2.0, at most 100 MB, with embedded resources. External URIs and unsupported required extensions are rejected. Draco, Meshopt, and KTX2 decoding are not included. Animations are not played.
- STL accepts ASCII and binary triangles. It has no unit metadata: the initial assumption is **millimeters, Z-up**. Use **STL units** in the model inspector to choose mm, cm, m, or inches; position, rotation and custom scale remain editable.
- STEP is triangulated locally by OpenCascade in a dedicated WASM worker. Embedded units are converted to meters; original axes are kept. Linear deflection is 0.5 mm and angular deflection is 0.1 radians. It imports display meshes, part names and mesh colors, not editable CAD features or exact analytic surfaces. Per-face colors are not preserved. External-reference assemblies should be exported as a single self-contained STEP file.
- STL/STEP: maximum 100 MB and 500,000 triangles. STEP conversion has a Cancel button and a 60-second timeout. These are input guards, not a guarantee of interactive performance at the limits. IGES and native CAD files are not supported.
- Try the original `../examples/calibration-block.stl` and `.step`: a 1000 × 2000 × 3000 mm block (1 × 2 × 3 m after import). Model re-selection preserves edited alignment and scale for all supported formats.
- GLB model alignment proposes a +90° X rotation for Y-up → Z-up; STL/STEP retain source axes. Confirm the origin, forward axis, and scale for your model.
- Scene JSON stores model filenames and alignment, not model bytes or absolute paths. Model files must be re-selected after reopening.
- The scene schema is version `0.1.0`; invalid or unsupported data is rejected without replacing the current study. Limits: 100 sensors and 500 obstacles.

## Approximation and scope

`possible` means an obstacle's bounding sphere cannot be ruled out by the sensor-volume bounds. It can overestimate actual intersection. `none` means the conservative bounds are separated. Hidden objects are excluded. Transparent rendering is illustrative and may exhibit surface ordering artifacts where volumes overlap.

The occlusion display performs GPU ray/triangle intersection for each rendered fragment using a world-space mesh BVH. Shadow boundaries no longer depend on a fixed angular ray grid, so thin blockers between the old sample directions can cast visible shadows. Surfaces inside the near zone still block; hidden blockers are excluded and all materials, including glass, are treated as opaque. Accuracy is limited by the input triangle mesh, floating-point tolerances, and screen resolution. The curved LiDAR shell is tessellated at up to 2-degree intervals. This is a display calculation, not an exact continuous shadow-volume mesh or volume measurement.

The separate CPU diagnostics retain a 49×33 camera grid and approximately 2-degree LiDAR samples. They may miss thin blockers and are not coverage metrics. The broad-phase intersection results above remain independent of occlusion.

This version does not simulate physical mounting collision, image formation, reflection intensity, scan timing, or detection probability. Coverage metrics, occlusion heatmaps, ROS2/URDF export, and bundled model/scene archives are future work.
