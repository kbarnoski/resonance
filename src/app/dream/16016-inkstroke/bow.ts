// bow.ts — granular buffer-BOW of Karel's REAL recording.
//
// RULE 10: this synthesizes NOTHING. Every grain is a short slice of his actual
// AudioBuffer, Hann-windowed and re-voiced. The calligraphic stroke is a
// score-cursor that BOWS the take — it scrubs a play-head across his recording
// and overlaps grains, it does not generate a synth voice or a melody.
//
// The stroke drives the grain cloud:
//   scrub (stroke x) → play-head offset across the whole buffer
//   speed            → grain density (grains/sec) + a ±6% playbackRate lean
//   pressure         → grain length (Hann, ~30–160ms) + a shared lowpass cutoff
//                      ("ink wetness": harder press = wetter/darker = lower cut)
//   pan/curvature    → stereo pan + a whisper of detune
//
// Every grain routes: source → per-grain Hann gain → panner → shared lowpass →
// (caller's safe master). Polyphony is capped so the cloud can't pile up.

export interface BowStroke {
  scrub: number; // 0..1 position in the buffer
  speed: number; // 0..1 normalized stroke speed
  pressure: number; // 0..1
  pan: number; // -1..1
  active: boolean; // emitting grains right now
}

export interface Bow {
  setStroke(s: Partial<BowStroke>): void;
  start(): void;
  stop(): void;
  dispose(): void;
}

const MAX_VOICES = 24;
const LOOKAHEAD = 0.12; // seconds scheduled ahead
const TICK_MS = 25;

/** Precomputed Hann window (unit peak) — scaled per grain for a click-free env. */
function makeHann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}
const HANN = makeHann(48);

export function makeBow(
  ctx: AudioContext,
  buffer: AudioBuffer,
  destination: AudioNode,
): Bow {
  // shared "ink wetness" lowpass every grain passes through
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 3200;
  lowpass.Q.value = 0.6;
  const busGain = ctx.createGain();
  busGain.gain.value = 0.9;
  lowpass.connect(busGain);
  busGain.connect(destination);

  const stroke: BowStroke = {
    scrub: 0.3,
    speed: 0.3,
    pressure: 0.5,
    pan: 0,
    active: false,
  };

  let voices = 0;
  let nextGrainTime = 0;
  let timer: number | null = null;

  function scheduleGrain(when: number) {
    if (voices >= MAX_VOICES) return;
    const p = stroke.pressure;
    const spd = stroke.speed;

    // grain length: 30..160 ms, longer under pressure (Hann-windowed real time)
    const grainSec = 0.03 + p * 0.13;
    // ±6% playback-rate lean: faster stroke = brighter/faster grains
    const rate = 1 + (spd - 0.5) * 0.12;
    // buffer seconds consumed = real seconds * rate
    const bufSpan = grainSec * rate;
    const maxOffset = Math.max(0, buffer.duration - bufSpan - 0.01);
    // small jitter so the cloud is textured, not a comb
    const jitter = (Math.random() - 0.5) * 0.03;
    const offset = Math.min(
      maxOffset,
      Math.max(0, stroke.scrub * maxOffset + jitter * maxOffset),
    );

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    // curvature/vertical → a whisper of detune (±18 cents)
    src.detune.value = stroke.pan * 18;

    const g = ctx.createGain();
    g.gain.value = 0;

    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, stroke.pan));

    src.connect(g);
    g.connect(pan);
    pan.connect(lowpass);

    // amplitude: tame overlap (density-normalized), lift a touch with pressure
    const density = 8 + spd * 46;
    const amp = (0.5 * (0.45 + 0.55 * p)) / Math.sqrt(Math.max(1, density / 10));
    const env = new Float32Array(HANN.length);
    for (let i = 0; i < HANN.length; i++) env[i] = HANN[i] * amp;

    const t = Math.max(when, ctx.currentTime + 0.001);
    g.gain.setValueCurveAtTime(env, t, grainSec);

    voices++;
    src.onended = () => {
      voices--;
      try {
        g.disconnect();
        pan.disconnect();
      } catch {
        /* closing */
      }
    };
    src.start(t, offset, bufSpan);
    src.stop(t + grainSec + 0.02);
  }

  function tick() {
    // ink wetness: harder press → lower cutoff (wetter, darker take)
    const cut = 900 + (1 - stroke.pressure) * 5200; // ~900..6100 Hz
    lowpass.frequency.setTargetAtTime(cut, ctx.currentTime, 0.05);

    if (!stroke.active) {
      // keep the play-head aligned so it re-enters cleanly on the next stroke
      nextGrainTime = Math.max(nextGrainTime, ctx.currentTime);
      return;
    }
    const density = 8 + stroke.speed * 46; // grains/sec
    const gap = 1 / density;
    const horizon = ctx.currentTime + LOOKAHEAD;
    if (nextGrainTime < ctx.currentTime) nextGrainTime = ctx.currentTime;
    while (nextGrainTime < horizon) {
      scheduleGrain(nextGrainTime);
      nextGrainTime += gap;
    }
  }

  return {
    setStroke(s) {
      if (s.scrub !== undefined) stroke.scrub = Math.max(0, Math.min(1, s.scrub));
      if (s.speed !== undefined) stroke.speed = Math.max(0, Math.min(1, s.speed));
      if (s.pressure !== undefined)
        stroke.pressure = Math.max(0, Math.min(1, s.pressure));
      if (s.pan !== undefined) stroke.pan = Math.max(-1, Math.min(1, s.pan));
      if (s.active !== undefined) stroke.active = s.active;
    },
    start() {
      if (timer !== null) return;
      nextGrainTime = ctx.currentTime;
      timer = window.setInterval(tick, TICK_MS);
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      stroke.active = false;
    },
    dispose() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      try {
        busGain.disconnect();
        lowpass.disconnect();
      } catch {
        /* closing */
      }
    },
  };
}
