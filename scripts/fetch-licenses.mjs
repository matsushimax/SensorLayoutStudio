import { mkdir, writeFile } from 'node:fs/promises';

const licenses = {
  'OCCT-LGPL-2.1.txt':
    'https://raw.githubusercontent.com/Open-Cascade-SAS/OCCT/d2abb6d844231cb8f29be6894440874a4700e4a5/LICENSE_LGPL_21.txt',
  'OCCT-LGPL-exception.txt':
    'https://raw.githubusercontent.com/Open-Cascade-SAS/OCCT/d2abb6d844231cb8f29be6894440874a4700e4a5/OCCT_LGPL_EXCEPTION.txt',
  'react-three-fiber.txt':
    'https://raw.githubusercontent.com/pmndrs/react-three-fiber/master/LICENSE',
  'mediapipe.txt': 'https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE',
  'draco.txt': 'https://raw.githubusercontent.com/google/draco/main/LICENSE',
  'maath.txt': 'https://raw.githubusercontent.com/pmndrs/maath/main/LICENSE',
  'MPL-2.0.txt': 'https://www.mozilla.org/media/MPL/2.0/index.txt',
};
await mkdir('docs/licenses', { recursive: true });
for (const [name, url] of Object.entries(licenses)) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  await writeFile(`docs/licenses/${name}`, await response.text());
  console.log(`Saved ${name}`);
}
await writeFile('docs/licenses/sources.json', JSON.stringify(licenses, null, 2) + '\n');
