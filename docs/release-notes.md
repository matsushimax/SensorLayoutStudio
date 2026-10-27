# Sensor Layout Studio 0.1.1

First public preview: place cameras and LiDARs in 3D, inspect shared visibility and blind spots, and export relative transforms.

- Move and rotate sensors with gizmos or numeric fields; edit relative to a model or another sensor.
- Adjust camera FOV and LiDAR azimuth/elevation/range.
- Compare selected sensors with purple shared coverage and red hatched blind spots.
- Import GLB, STL and STEP; save scenes and preview/export coordinate transforms.

## Downloads

- **windows-x64-portable.zip**: extract the entire ZIP and run the EXE. No app installation; requires WebView2 Runtime.
- **windows-x64-setup.exe**: Windows installer, with WebView2 setup when needed.
- **Source code**: application source. The separate OCCT and occt-import-js archives provide the exact STEP runtime sources.
- **SHA256SUMS.txt**: checksums for the attached files.

## Known limitations

Unsigned Windows builds may show a publisher warning. Windows x64 is the packaged desktop target; macOS/Linux binaries are not supplied.

This is a placement visualization tool, not a sensor-performance simulator. Mesh detail and display resolution limit boundaries. No coverage-area/volume percentage, detection probability or reflectivity simulation is provided. Large models may be slow. Imports are limited to 100 MB; STL/STEP to 500,000 triangles, with a 60-second STEP timeout.

Scene JSON references models but does not embed them: reselect the original model after reopening. Portable means no app installer, not a promise that all runtime settings stay in the extracted folder.
