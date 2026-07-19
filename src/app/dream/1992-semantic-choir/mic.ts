// ─────────────────────────────────────────────────────────────────────────────
// mic.ts — capture a short phrase from the microphone as a mono Float32Array at
// 16 kHz, exactly the shape Whisper (Model 1) wants. We record for a few seconds
// while showing a level meter, then hand the raw samples to the ASR pipeline.
// A ScriptProcessor is used deliberately: it is universally available and needs
// no AudioWorklet module URL (which would complicate the $0/no-bundle rule).
// ─────────────────────────────────────────────────────────────────────────────

export interface MicHandle {
  stream: MediaStream;
  /** live input level 0..1 while recording (for the meter) */
  level: () => number;
  /** resolves with 16 kHz mono samples once `seconds` have been captured */
  done: Promise<Float32Array>;
  /** stop early / clean up */
  stop: () => void;
}

const TARGET_SR = 16000;

function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const frac = src - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

export async function capturePhrase(seconds = 3.5): Promise<MicHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });

  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AC();
  const source = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const sink = ctx.createGain();
  sink.gain.value = 0; // capture silently

  const chunks: Float32Array[] = [];
  let collected = 0;
  const need = Math.ceil(seconds * ctx.sampleRate);
  let curLevel = 0;
  let finished = false;
  let resolveDone!: (v: Float32Array) => void;

  const done = new Promise<Float32Array>((res) => (resolveDone = res));

  const cleanup = () => {
    if (finished) return;
    finished = true;
    try {
      proc.disconnect();
      source.disconnect();
      sink.disconnect();
    } catch {
      /* noop */
    }
    stream.getTracks().forEach((t) => t.stop());
    const merged = new Float32Array(collected);
    let o = 0;
    for (const c of chunks) {
      merged.set(c, o);
      o += c.length;
    }
    ctx.close().catch(() => {});
    resolveDone(resample(merged, ctx.sampleRate, TARGET_SR));
  };

  proc.onaudioprocess = (e) => {
    if (finished) return;
    const inp = e.inputBuffer.getChannelData(0);
    let rms = 0;
    for (let i = 0; i < inp.length; i++) rms += inp[i] * inp[i];
    curLevel = Math.min(1, Math.sqrt(rms / inp.length) * 4.0);
    chunks.push(new Float32Array(inp));
    collected += inp.length;
    if (collected >= need) cleanup();
  };

  source.connect(proc);
  proc.connect(sink);
  sink.connect(ctx.destination);

  return {
    stream,
    level: () => curLevel,
    done,
    stop: cleanup,
  };
}
