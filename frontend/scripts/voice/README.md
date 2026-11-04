# Tino's voice

Tino's lines are pre-recorded MP3s in `public/voice/` (one per line, named by a hash of the
words), listed in `public/voice/manifest.json`. A line without a recording (for example a new
product's name) is spoken by the browser's built-in voice instead, so nothing breaks.

Voice: [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) (Apache-2.0), voice `am_liam`,
pitched up 5 semitones.

## Re-record after changing `lines.js` or the menu

From `frontend/`:

```
npx esbuild scripts/voice/collect.js --bundle --platform=node --outfile=scripts/voice/.collect.cjs
node scripts/voice/.collect.cjs              # writes scripts/voice/lines.json
python scripts/voice/record.py <model-dir>   # records only the new lines, updates the manifest
```

`<model-dir>` holds `kokoro-v1.0.onnx` and `voices-v1.0.bin` from the kokoro-onnx releases.
Needs `pip install kokoro-onnx soundfile` and an `ffmpeg` with rubberband.
Recordings of lines that no longer exist can simply be deleted.
