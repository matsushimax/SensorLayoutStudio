import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { BoxGeometry } from 'three';

const result = await build({
  stdin: {
    contents:
      "export { createDemoScene } from './src/domain/scene'; export { exportTransforms } from './src/domain/pose';",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { createDemoScene, exportTransforms } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
);
const scene = createDemoScene();
scene.sensors.forEach((s, i) => {
  s.id = `sensor-${i + 1}`;
});
scene.primitives.forEach((p, i) => {
  p.id = `obstacle-${i + 1}`;
});
await mkdir('examples', { recursive: true });
await writeFile('examples/demo.scene.json', JSON.stringify(scene, null, 2) + '\n');
await writeFile(
  'examples/demo.transforms.json',
  JSON.stringify(exportTransforms(scene), null, 2) + '\n',
);

// Original untextured Y-up box, useful for exercising the import/alignment workflow.
const box = new BoxGeometry(2, 1, 1),
  pos = box.getAttribute('position'),
  normals = box.getAttribute('normal');
const positions = Buffer.from(pos.array.buffer),
  normalBytes = Buffer.from(normals.array.buffer);
const indices = Buffer.from(box.index.array.buffer);
const binary = Buffer.concat([positions, normalBytes, indices]);
const gltf = {
  asset: { version: '2.0', generator: 'Sensor Layout Studio — original calibration sample' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ name: 'Calibration box (Y-up)', mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
  materials: [
    {
      pbrMetallicRoughness: {
        baseColorFactor: [0.65, 0.75, 0.58, 1],
        metallicFactor: 0.1,
        roughnessFactor: 0.6,
      },
    },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: pos.count,
      type: 'VEC3',
      min: [-1, -0.5, -0.5],
      max: [1, 0.5, 0.5],
    },
    { bufferView: 1, componentType: 5126, count: normals.count, type: 'VEC3' },
    { bufferView: 2, componentType: 5123, count: box.index.count, type: 'SCALAR' },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: positions.length },
    { buffer: 0, byteOffset: positions.length, byteLength: normalBytes.length },
    { buffer: 0, byteOffset: positions.length + normalBytes.length, byteLength: indices.length },
  ],
  buffers: [{ byteLength: binary.length }],
};
const text = Buffer.from(JSON.stringify(gltf));
const jsonChunk = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
const binChunk = Buffer.concat([binary, Buffer.alloc((4 - (binary.length % 4)) % 4)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + jsonChunk.length + binChunk.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonChunk.length);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binChunk.length);
binHeader.writeUInt32LE(0x004e4942, 4);
await writeFile(
  'examples/calibration-box.glb',
  Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]),
);
console.log('Generated examples/demo.scene.json, demo.transforms.json, calibration-box.glb');
