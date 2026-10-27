/* global importScripts, occtimportjs */
// Dedicated, short-lived worker: parsing never blocks the editor, and termination
// releases the complete OpenCascade/WASM heap after success, error or cancellation.
self.onmessage = async ({ data }) => {
  try {
    importScripts('./vendor/occt/occt-import-js.js');
    const occt = await occtimportjs({
      locateFile: (file) => new URL(`./vendor/occt/${file}`, self.location.href).href,
      print: () => {},
      printErr: () => {},
    });
    const result = occt.ReadStepFile(new Uint8Array(data), {
      linearUnit: 'meter',
      linearDeflectionType: 'absolute_value',
      linearDeflection: 0.0005,
      angularDeflection: 0.1,
    });
    if (!result.success || !result.meshes?.length)
      throw new Error(
        'STEP contains no readable solid/surface meshes. Export a self-contained STEP file.',
      );
    const count = result.meshes.reduce((n, mesh) => n + mesh.index.array.length / 3, 0);
    if (count > 500000)
      throw new Error(
        'STEP exceeds the 500,000 triangle preview limit. Simplify the CAD model before importing.',
      );
    // OCCT emits assembly placements baked into mesh coordinates. Retain part
    // names and mesh colors; flat groups avoid applying placements a second time.
    const meshes = result.meshes.map((mesh) => ({
      name: mesh.name,
      color: mesh.color,
      positions: new Float32Array(mesh.attributes.position.array),
      indices: new Uint32Array(mesh.index.array),
    }));
    self.postMessage(
      { meshes },
      meshes.flatMap((m) => [m.positions.buffer, m.indices.buffer]),
    );
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : 'STEP conversion failed. Check the CAD file or simplify its geometry.',
    });
  }
};
