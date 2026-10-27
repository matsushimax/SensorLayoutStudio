import { mkdir, copyFile } from 'node:fs/promises';
// Keep the unmodified LGPL runtime replaceable and separate from application JS.
const directory = 'public/vendor/occt';
await mkdir(directory, { recursive: true });
for (const file of ['occt-import-js.js', 'occt-import-js.wasm'])
  await copyFile(`node_modules/occt-import-js/dist/${file}`, `${directory}/${file}`);
await copyFile('node_modules/occt-import-js/LICENSE.md', `${directory}/LICENSE.md`);
await copyFile('docs/cad-runtime.md', `${directory}/SOURCE.md`);
for (const file of ['OCCT-LGPL-2.1.txt', 'OCCT-LGPL-exception.txt'])
  await copyFile(`docs/licenses/${file}`, `${directory}/${file}`);
