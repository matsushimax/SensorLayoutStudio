import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LoadingManager, type Object3D } from 'three';
import { parseStl, parseStep } from './meshImport';

export async function parseModel(name: string, bytes: Uint8Array): Promise<Object3D> {
  if (!bytes.length || bytes.length > 100 * 1024 * 1024)
    throw new Error('Model is empty, unreadable, or exceeds 100 MB.');
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'glb') return parseGlb(bytes);
  if (extension === 'stl') return parseStl(bytes);
  if (extension === 'step' || extension === 'stp') return parseStep(bytes);
  throw new Error('Supported models: GLB, STL, STEP (.step / .stp).');
}

// GLB can contain external URIs. Reject them before the loader can access files or network.
export async function parseGlb(bytes: Uint8Array): Promise<Object3D> {
  if (bytes.byteLength < 20) throw new Error('Invalid or empty GLB. Maximum file size is 100 MB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength
  )
    throw new Error('Expected a valid glTF 2.0 binary (.glb).');
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || jsonLength > bytes.byteLength - 20)
    throw new Error('GLB JSON chunk is invalid.');
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  for (const resource of [...(json.buffers ?? []), ...(json.images ?? [])]) {
    if (resource.uri && !String(resource.uri).startsWith('data:'))
      throw new Error(
        'This GLB references external assets. Export a self-contained GLB with embedded textures.',
      );
  }
  const supported = new Set([
    'KHR_materials_unlit',
    'KHR_materials_clearcoat',
    'KHR_materials_transmission',
    'KHR_materials_volume',
    'KHR_materials_ior',
    'KHR_materials_specular',
    'KHR_materials_sheen',
    'KHR_materials_iridescence',
    'KHR_materials_anisotropy',
    'KHR_materials_emissive_strength',
    'KHR_texture_transform',
    'KHR_mesh_quantization',
    'EXT_mesh_gpu_instancing',
    'KHR_lights_punctual',
  ]);
  const unsupported = (json.extensionsRequired ?? []).filter((e: string) => !supported.has(e));
  if (unsupported.length)
    throw new Error(
      `Unsupported GLB extensions: ${unsupported.join(', ')}. Export without geometry/texture compression.`,
    );
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    if (/^(data:|blob:)/.test(url)) return url;
    throw new Error('External model resources are not supported.');
  });
  const loader = new GLTFLoader(manager);
  const gltf = await loader.parseAsync(Uint8Array.from(bytes).buffer, '');
  return gltf.scene;
}
