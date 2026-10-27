import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';

const ffmpeg = process.argv[2] || process.env.FFMPEG || 'ffmpeg';
const { start, duration } = JSON.parse(await readFile('docs/recording/timing.json', 'utf8'));
const input = [
  '-y',
  '-hide_banner',
  '-loglevel',
  'error',
  '-ss',
  String(start + 1.1),
  '-t',
  String(duration - 1.1),
  '-i',
  'docs/recording/raw.webm',
];
// Video retains capture speed; the explicitly labeled GIF is a 4× summary.
execFileSync(
  ffmpeg,
  [
    ...input,
    '-an',
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '32',
    '-b:v',
    '0',
    '-cpu-used',
    '4',
    'docs/demo.webm',
  ],
  { stdio: 'inherit' },
);
execFileSync(
  ffmpeg,
  [
    ...input,
    '-filter_complex',
    '[0:v]setpts=(PTS-STARTPTS)/4,fps=12,scale=900:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
    '-loop',
    '0',
    'docs/demo.gif',
  ],
  { stdio: 'inherit' },
);
for (const file of ['docs/demo.gif', 'docs/demo.webm'])
  console.log(`${file}: ${((await stat(file)).size / 1024 / 1024).toFixed(2)} MiB`);
