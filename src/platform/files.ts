import { isTauri } from '@tauri-apps/api/core';

export type PickedFile = { name: string; data: Uint8Array };
export interface FilePlatform {
  pick: (kind: 'model' | 'json') => Promise<PickedFile | null>;
  save: (name: string, contents: string) => Promise<boolean>;
}
const MAX_BYTES = 100 * 1024 * 1024;
const nativePlatform: FilePlatform = {
  async pick(kind) {
    const [{ open }, { readFile, stat }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ]);
    const path = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: kind === 'model' ? '3D model (GLB, STL, STEP)' : 'Scene JSON',
          extensions: kind === 'model' ? ['glb', 'stl', 'step', 'stp'] : ['json'],
        },
      ],
    });
    if (!path) return null;
    if ((await stat(path)).size > MAX_BYTES) throw new Error('Files must be smaller than 100 MB.');
    return { name: path.split(/[\\/]/).pop()!, data: await readFile(path) };
  },
  async save(name, contents) {
    const [{ save }, { writeTextFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ]);
    const path = await save({
      defaultPath: name,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!path) return false;
    await writeTextFile(path, contents);
    return true;
  },
};
const browserPlatform: FilePlatform = {
  pick: (kind) =>
    new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = kind === 'model' ? '.glb,.stl,.step,.stp' : '.json';
      input.style.display = 'none';
      document.body.append(input);
      let finished = false;
      const cleanup = () => {
        window.removeEventListener('focus', onFocus);
        input.remove();
      };
      const finish = (value: PickedFile | null) => {
        if (!finished) {
          finished = true;
          cleanup();
          resolve(value);
        }
      };
      // Modern browsers fire cancel; the focus fallback covers older WebViews.
      const onFocus = () =>
        setTimeout(() => {
          if (!input.files?.length) finish(null);
        }, 500);
      window.addEventListener('focus', onFocus);
      input.addEventListener('cancel', () => finish(null));
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return finish(null);
        if (file.size > MAX_BYTES) {
          finish({ name: file.name, data: new Uint8Array() });
          return;
        }
        try {
          finish({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) });
        } catch {
          finish({ name: file.name, data: new Uint8Array() });
        }
      });
      input.click();
    }),
  async save(name, contents) {
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  },
};
export const filePlatform = isTauri() ? nativePlatform : browserPlatform;
export const platformName = isTauri() ? 'DESKTOP' : 'BROWSER';
