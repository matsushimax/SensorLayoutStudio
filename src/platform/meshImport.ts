import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Color,
  DoubleSide,
} from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const MAX_TRIANGLES = 500000;
export function validateMesh(geometry: BufferGeometry) {
  const positions = geometry.getAttribute('position');
  const count = geometry.index?.count ?? positions?.count ?? 0;
  if (!positions || count < 3 || count % 3 || count / 3 > MAX_TRIANGLES)
    throw new Error('Model must contain triangles (maximum 500,000). Simplify the mesh and retry.');
  for (let i = 0; i < positions.array.length; i++)
    if (!Number.isFinite(positions.array[i]))
      throw new Error('Model contains invalid vertex coordinates.');
  if (geometry.index)
    for (const index of geometry.index.array)
      if (index >= positions.count) throw new Error('Model contains invalid triangle indices.');
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
}

export function parseStl(bytes: Uint8Array) {
  let source = Uint8Array.from(bytes).buffer;
  if (bytes.byteLength < 84) throw new Error('Invalid or empty STL file.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triangles = view.getUint32(80, true);
  const binary = 84 + triangles * 50 === bytes.byteLength;
  if (binary && triangles > MAX_TRIANGLES)
    throw new Error('STL exceeds the 500,000 triangle preview limit.');
  if (!binary) {
    const text = new TextDecoder().decode(bytes).trim();
    source = new TextEncoder().encode(text).buffer;
    if (!/^solid\b/i.test(text) || !/endsolid\b/i.test(text))
      throw new Error('Invalid or truncated STL file.');
    const facets = text.match(/\bfacet\s+normal\b/gi)?.length ?? 0;
    const vertices = text.match(/\bvertex\b/gi)?.length ?? 0;
    if (!facets || facets > MAX_TRIANGLES || vertices !== facets * 3)
      throw new Error('Invalid STL facets or too many triangles.');
  }
  const geometry = new STLLoader().parse(source);
  try {
    validateMesh(geometry);
  } catch (error) {
    geometry.dispose();
    throw error;
  }
  return new Mesh(
    geometry,
    new MeshStandardMaterial({ color: '#abb8ae', roughness: 0.65, side: DoubleSide }),
  );
}

type CadMesh = { name?: string; color?: number[]; positions: Float32Array; indices: Uint32Array };
export function cadMeshes(meshes: CadMesh[]) {
  const group = new Group();
  try {
    for (const mesh of meshes) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(mesh.positions, 3));
      geometry.setIndex(Array.from(mesh.indices));
      try {
        validateMesh(geometry);
      } catch (error) {
        geometry.dispose();
        throw error;
      }
      const color =
        mesh.color?.length === 3
          ? new Color().setRGB(mesh.color[0], mesh.color[1], mesh.color[2])
          : new Color('#abb8ae');
      const object = new Mesh(
        geometry,
        new MeshStandardMaterial({ color, roughness: 0.65, side: DoubleSide }),
      );
      object.name = mesh.name ?? 'STEP part';
      group.add(object);
    }
    return group;
  } catch (error) {
    for (const child of group.children) {
      const mesh = child as Mesh<BufferGeometry, MeshStandardMaterial>;
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    throw error;
  }
}

let cancelPending: (() => void) | null = null;
export function cancelModelImport() {
  cancelPending?.();
}
export function parseStep(bytes: Uint8Array): Promise<Group> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(`${import.meta.env.BASE_URL}cad-worker.js`);
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
      cancelPending = null;
    };
    const fail = (message: string) => {
      finish();
      reject(new Error(message));
    };
    const timer = setTimeout(
      () => fail('STEP conversion timed out after 60 seconds. Simplify the model and retry.'),
      60000,
    );
    cancelPending = () => fail('STEP import cancelled. The previous model is unchanged.');
    worker.onerror = () => fail('STEP converter could not start. Reload the app and retry.');
    worker.onmessage = ({ data }: MessageEvent<{ meshes?: CadMesh[]; error?: string }>) => {
      finish();
      try {
        if (data.error || !data.meshes?.length)
          throw new Error(data.error ?? 'STEP contains no meshes.');
        resolve(cadMeshes(data.meshes));
      } catch (error) {
        reject(error);
      }
    };
    const buffer = Uint8Array.from(bytes).buffer;
    worker.postMessage(buffer, [buffer]);
  });
}
