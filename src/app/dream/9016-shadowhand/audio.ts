// audio.ts — the sound world of the shadow hand.
//
// Two buses feed a limited master:
//   • KAREL bus  — his real recording (or a procedural fallback). This is the
//                  signal the score-follower LISTENS to, so it also feeds the
//                  AnalyserNode tap. The accompanist never hears itself.
//   • SHADOW bus — the generative accompanist: a soft FM bell that harmonizes
//                  BELOW Karel's detected pitch, entering on predicted beats and
//                  resting when he is dense.
// master = 0.18 gain → DynamicsCompressor limiter → destination.

import { mulberry32, midiToFreq } from "./analysis";

const KAREL_URL = "/api/audio/549fc519-f7fc-4c38-a771-adaad2edbc81";

export type Source = "live" | "fallback";

export interface Engine {
  readonly ctx: AudioContext;
  readonly analyser: AnalyserNode;
  readonly freq: Uint8Array<ArrayBuffer>;
  source: Source;
  playing: boolean;
  /** Load + decode Karel's recording and start it; falls back to synth. */
  start(): Promise<Source>;
  /** Fire one accompanist note (FM bell), gliding from the previous pitch. */
  answer(midi: number, velocity: number): void;
  stop(): void;
}

// ── fetch → decode Karel's real recording (or null to trigger fallback) ───────
// The prod route returns JSON { url } by default (a signed storage URL); when it
// serves raw audio it sends an audio/* content-type. We handle both, then
// decodeAudioData. Any failure (offline / CORS / 4xx-5xx / decode) returns null.
async function loadKarel(ctx: AudioContext): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(KAREL_URL);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    let arr: ArrayBuffer;
    if (ct.includes("application/json")) {
      const j = (await res.json()) as { url?: string };
      if (!j.url) return null;
      const audioRes = await fetch(j.url);
      if (!audioRes.ok) return null;
      arr = await audioRes.arrayBuffer();
    } else {
      arr = await res.arrayBuffer();
    }
    return await ctx.decodeAudioData(arr);
  } catch {
    return null;
  }
}

export function createEngine(): Engine {
  const AC: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AC();

  // master chain: gain → limiter → out
  const master = ctx.createGain();
  master.gain.value = 0.18;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // Karel bus → master AND → analyser tap (the ear)
  const karelGain = ctx.createGain();
  karelGain.gain.value = 0.95;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.55;
  karelGain.connect(master);
  karelGain.connect(analyser); // side tap — analyser is a sink, not passed on
  const freq = new Uint8Array(analyser.frequencyBinCount);

  // Shadow bus → master only (never into the analyser)
  const shadowGain = ctx.createGain();
  shadowGain.gain.value = 0.9;
  shadowGain.connect(master);

  let bufferSource: AudioBufferSourceNode | null = null;
  let fallbackTimer: number | null = null;
  let fallbackNextTime = 0;
  const fallbackRnd = mulberry32(0x9016);
  const activeVoices = new Set<{ a: AudioNode; b: AudioNode; g: AudioNode }>();
  let lastAnswerFreq = 0;

  const engine: Engine = {
    ctx,
    analyser,
    freq,
    source: "fallback",
    playing: false,
    async start() {
      try {
        await ctx.resume();
      } catch {
        /* already running */
      }
      const buf = await loadKarel(ctx);
      if (buf) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(karelGain);
        src.start();
        bufferSource = src;
        engine.source = "live";
      } else {
        startFallback();
        engine.source = "fallback";
      }
      engine.playing = true;
      return engine.source;
    },
    answer(midi: number, velocity: number) {
      answerNote(midi, velocity);
    },
    stop() {
      engine.playing = false;
      if (fallbackTimer !== null) {
        clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
      if (bufferSource) {
        try {
          bufferSource.stop();
        } catch {
          /* already stopped */
        }
        bufferSource.disconnect();
        bufferSource = null;
      }
      for (const v of activeVoices) {
        try {
          (v.a as OscillatorNode).stop();
          (v.b as OscillatorNode).stop();
        } catch {
          /* already stopped */
        }
        v.a.disconnect();
        v.b.disconnect();
        v.g.disconnect();
      }
      activeVoices.clear();
      karelGain.disconnect();
      shadowGain.disconnect();
      analyser.disconnect();
      master.disconnect();
      limiter.disconnect();
      if (ctx.state !== "closed") ctx.close().catch(() => {});
    },
  };

  // ── the accompanist voice: soft 2-op FM bell ────────────────────────────────
  function answerNote(midi: number, velocity: number): void {
    if (ctx.state === "closed") return;
    const now = ctx.currentTime;
    const f = midiToFreq(midi);
    const vel = Math.max(0.15, Math.min(1, velocity));

    const car = ctx.createOscillator();
    car.type = "sine";
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = f * 2.01; // inharmonic-ish ratio → bell shimmer
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(f * 1.6 * vel, now);
    modGain.gain.setTargetAtTime(f * 0.15, now, 0.16);
    mod.connect(modGain);
    modGain.connect(car.frequency);

    const env = ctx.createGain();
    env.gain.value = 0;
    car.connect(env);
    env.connect(shadowGain);

    // glide from the previous answer for a legato, listening feel
    if (lastAnswerFreq > 0) {
      car.frequency.setValueAtTime(lastAnswerFreq, now);
      car.frequency.setTargetAtTime(f, now, 0.035);
    } else {
      car.frequency.setValueAtTime(f, now);
    }
    lastAnswerFreq = f;

    const peak = 0.28 * vel;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(peak, now + 0.014);
    env.gain.setTargetAtTime(0.0001, now + 0.06, 0.32);

    car.start(now);
    mod.start(now);
    const stopAt = now + 1.8;
    car.stop(stopAt);
    mod.stop(stopAt);

    const rec = { a: car, b: mod, g: env };
    activeVoices.add(rec);
    car.onended = () => {
      env.disconnect();
      modGain.disconnect();
      activeVoices.delete(rec);
    };
  }

  // ── procedural fallback: a looping pentatonic piano-ish phrase ──────────────
  // Only used when Karel's recording can't be fetched/decoded. Feeds the SAME
  // Karel bus so the analyser (and thus the whole piece) still reacts.
  const PENTA = [60, 62, 64, 67, 69, 72, 74]; // C major pentatonic + passing
  function scheduleFallbackNote(midi: number, at: number, dur: number): void {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = midiToFreq(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.5, at + 0.008);
    g.gain.setTargetAtTime(0.0001, at + 0.04, 0.22);
    osc.connect(g);
    g.connect(karelGain);
    osc.start(at);
    osc.stop(at + dur + 0.4);
    osc.onended = () => g.disconnect();
  }
  function startFallback(): void {
    const bpm = 96;
    const step = 60 / bpm / 2; // eighth notes
    fallbackNextTime = ctx.currentTime + 0.1;
    fallbackTimer = window.setInterval(() => {
      const ahead = ctx.currentTime + 0.25;
      while (fallbackNextTime < ahead) {
        if (fallbackRnd() < 0.8) {
          const midi = PENTA[Math.floor(fallbackRnd() * PENTA.length)];
          scheduleFallbackNote(midi, fallbackNextTime, step);
        }
        fallbackNextTime += step;
      }
    }, 40);
  }

  return engine;
}
