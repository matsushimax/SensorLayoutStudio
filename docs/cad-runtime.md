# STEP runtime and corresponding source

Sensor Layout Studio uses facilities provided by **Open CASCADE Technology** via the unmodified **occt-import-js 0.0.23** WebAssembly runtime. The application code and original example models remain MIT licensed. The runtime is LGPL-2.1; OCCT is LGPL-2.1 with the included Open CASCADE exception. See THIRD_PARTY_NOTICES.md and docs/licenses/OCCT-LGPL-2.1.txt and OCCT-LGPL-exception.txt.

Exact corresponding source, including upstream build scripts:

- occt-import-js commit `c2148e54b456b571238d35cac037d304053d64b2`: https://github.com/kovacsv/occt-import-js/tree/c2148e54b456b571238d35cac037d304053d64b2
- Source archive: https://github.com/kovacsv/occt-import-js/archive/c2148e54b456b571238d35cac037d304053d64b2.tar.gz
- OCCT submodule commit `d2abb6d844231cb8f29be6894440874a4700e4a5`: https://github.com/Open-Cascade-SAS/OCCT/tree/d2abb6d844231cb8f29be6894440874a4700e4a5
- Source archive: https://github.com/Open-Cascade-SAS/OCCT/archive/d2abb6d844231cb8f29be6894440874a4700e4a5.tar.gz

To rebuild the library, place the OCCT source at the wrapper's `occt/` subdirectory and follow the wrapper's README and `tools/setup_emscripten_win.bat` / `tools/build_wasm_win_release.bat`. Both library revisions are unmodified in this application. Replace `node_modules/occt-import-js/dist/occt-import-js.js` and `.wasm` with a compatible rebuilt pair, then run `npm run build` (browser) or `npm run tauri build` (desktop). Application sources and build scripts are included in this repository to permit rebuilding with a modified library. No application restriction is imposed on reverse engineering for debugging modifications to these libraries.

`scripts/prepare-cad.mjs` copies the library as separate files into `public/vendor/occt/` before dev/build; they are not concatenated into the application bundle. The browser distribution keeps them at `vendor/occt/`, where they can also be replaced directly. Tauri embeds the same files as frontend assets; rebuilding the app replaces them there. A classic dedicated worker loads the converter only when importing STEP, fetches the local WASM, and terminates after each import. No CDN or model upload is involved. CSP permits local WASM compilation without general JavaScript eval.

For public binary releases, provide the exact library source archives alongside the app source, binaries, and notices. Update this record and the notices when changing the pinned package or OCCT revision.
