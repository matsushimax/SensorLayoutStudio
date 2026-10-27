# README demo assets

Both READMEs embed `docs/screenshots/common-coverage.png` at the top, followed by `docs/demo.gif` as a normal relative Markdown image. No separate still-image or video link is shown. The GIF plays at **4× capture speed**, explicitly labeled in both READMEs. `docs/demo.webm` remains a capture-speed recording for reuse, but is not linked from the README. No hosted demo URL or GitHub-uploaded media URL is required.

## Reproduce

Prerequisites: the project's npm dependencies, Playwright Chromium (`npx playwright install chromium`), and a full FFmpeg build with VP9, GIF, palettegen and paletteuse support. The minimal FFmpeg bundled with Playwright is not enough for conversion. FFmpeg is a development/media tool, not an application dependency.

Start the app with `npm run dev`. In another terminal:

```sh
node scripts/record-readme-demo.mjs
node scripts/build-demo-media.mjs
```

If FFmpeg is not on PATH, pass the executable path as the second script's argument or set `FFMPEG`. Windows PowerShell can use `npm.cmd` for the npm commands.

The recorder uses the real application UI: it selects camera + LiDAR, sets LiDAR elevation minimum to −45° and range to 5 m, sets camera vertical FOV to 60°, enables Common mode and red blind-spot highlighting. Occlusion remains ON. It then edits camera position X, horizontal FOV and far distance, followed by LiDAR position Y (0–1.2 m) and far distance (5–3–5 m), keeping both sensors in the comparison. The scene is rendered by the actual visibility code; there are no substituted or pre-rendered overlap graphics. A temporary recording-only caption identifies each phase. Startup/setup footage is trimmed; no application changes are needed to record it.

Intermediate recordings, timing data and QA screenshots stay in ignored `docs/recording/`. Commit only the finished GIF/video and the recording scripts. Review the initial frame, all five phases, loop transition, text readability and file sizes before replacing the public assets. GitHub may respect a viewer's reduced-motion preferences; the video and still image remain alternatives.

The older `scripts/record-demo.mjs` records a longer general walkthrough and writes the same video destination. Use the two commands above to regenerate the matched README assets.
