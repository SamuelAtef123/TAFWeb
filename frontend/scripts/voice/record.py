"""
Records Tino's lines (scripts/voice/lines.json) as public/voice/<id>.mp3 and writes
public/voice/manifest.json. Only lines without a recording are recorded, so re-running after
adding a product or a line is quick.

Voice: Kokoro (Apache-2.0, https://github.com/thewh1teagle/kokoro-onnx), voice "am_liam",
pitched up 5 semitones so he sounds like a young boy (needs ffmpeg built with rubberband).

  pip install kokoro-onnx soundfile
  # download kokoro-v1.0.onnx and voices-v1.0.bin from the kokoro-onnx releases into MODEL_DIR
  python scripts/voice/record.py MODEL_DIR
"""
import json, os, subprocess, sys, tempfile
import soundfile as sf
from kokoro_onnx import Kokoro

VOICE, SPEED, SEMITONES = 'am_liam', 1.05, 5
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'public', 'voice')

def main(model_dir):
    lines = json.load(open(os.path.join(HERE, 'lines.json'), encoding='utf-8'))
    os.makedirs(OUT, exist_ok=True)
    k = Kokoro(os.path.join(model_dir, 'kokoro-v1.0.onnx'), os.path.join(model_dir, 'voices-v1.0.bin'))
    pitch = 2 ** (SEMITONES / 12)
    todo = [l for l in lines if not os.path.exists(os.path.join(OUT, l['id'] + '.mp3'))]
    for i, l in enumerate(todo):
        audio, sr = k.create(l['words'], voice=VOICE, speed=SPEED, lang='en-us')
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t:
            wav = t.name
        sf.write(wav, audio, sr)
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', wav,
                        '-af', f'rubberband=pitch={pitch}:formant=shifted,atempo=1.03,loudnorm=I=-16:TP=-1.5',
                        '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '40k',
                        os.path.join(OUT, l['id'] + '.mp3')], check=True)
        os.remove(wav)
        if i % 25 == 0:
            print(f'{i + 1}/{len(todo)}', flush=True)
    ids = sorted(l['id'] for l in lines if os.path.exists(os.path.join(OUT, l['id'] + '.mp3')))
    json.dump({'voice': f'kokoro {VOICE} +{SEMITONES}st', 'clips': ids}, open(os.path.join(OUT, 'manifest.json'), 'w'))
    print(f'done: {len(ids)} recordings')

if __name__ == '__main__':
    main(sys.argv[1])
