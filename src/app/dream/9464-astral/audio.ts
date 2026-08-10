// audio.ts — Karel's real "Welcome Home" piano as the light-field's source,
// with a seeded warm-drone fallback so the piece is never silent.
//
// The recording is fetched on Begin, decoded to a looping AudioBufferSource,
// and routed BOTH into the ear-safety master bus (to the speakers) AND into a
// private AnalyserNode (fftSize 2048) that page.tsx reads for spectral-flux
// onsets and RMS loudness. If the fetch/decode fails or times out (~4s), a
// deterministic detuned-oscillator drone + slow arpeggio takes its place and
// feeds the identical analysis — so onsets keep spawning stars either way.

import type { SafeMaster } from "../_shared/visionary/safeMaster";
import { mulberry32, SEED } from "./nebula";

export const DEFAULT_UUID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

export type AudioMode = "real" | "synth";

export interface SynthEngine {
  stop(): void;
}

export interface LoadedAudio {
  mode: AudioMode;
  /** fftSize 2048 tap for spectral-flux + RMS. */
  analyser: AnalyserNode;
  source: AudioBufferSourceNode | null;
  synth: SynthEngine | null;
  statusMsg: string;
  errorMsg: string;
}

function makeAnalyser(ctx: AudioContext): AnalyserNode {
  const a = ctx.createAnalyser();
  a.fftSize = 2048;
  a.smoothingTimeConstant = 0.5;
  return a;
}

// ── Seeded warm-drone fallback ──────────────────────────────────────────────
// A few detuned oscillators through a soft lowpass form a felt-piano-ish pad;
// a lookahead scheduler drops gentle arpeggio tones so there are real onsets
// for the flux detector to find. Fully deterministic (seeded), no wall clock.
function buildSynth(ctx: AudioContext, out: AudioNode): SynthEngine {
  const rand = mulberry32(SEED ^ 0x51ee);
  const now = ctx.currentTime;

  const bus = ctx.createGain();
  bus.gain.value = 0.9;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1400;
  lp.Q.value = 0.4;
  bus.connect(lp);
  lp.connect(out);

  // Sustained drone: three detuned voices around a low A.
  const drone = ctx.createGain();
  drone.gain.value = 0.12;
  drone.connect(bus);
  const base = 110; // A2
  const detunes = [-0.15, 0, 0.16];
  const oscs: OscillatorNode[] = [];
  for (const d of detunes) {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = base * Math.pow(2, d / 12);
    o.connect(drone);
    o.start(now);
    oscs.push(o);
  }
  // Slow breathing on the drone (well under any flicker concern; audio only).
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.06;
  lfoGain.gain.value = 0.05;
  lfo.connect(lfoGain);
  lfoGain.connect(drone.gain);
  lfo.start(now);

  // Arpeggio scheduler — a warm pentatonic drifting upward.
  const scale = [220, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
  let nextTime = now + 0.4;
  let stopped = false;

  function stepNote(t: number): void {
    const f = scale[Math.floor(rand() * scale.length)] * (rand() < 0.25 ? 2 : 1);
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + 1.8);
  }

  const timer = window.setInterval(() => {
    if (stopped) return;
    const ahead = ctx.currentTime + 0.5;
    while (nextTime < ahead) {
      stepNote(nextTime);
      nextTime += 0.42 + rand() * 0.5;
    }
  }, 120);

  return {
    stop() {
      stopped = true;
      window.clearInterval(timer);
      try {
        for (const o of oscs) o.stop();
        lfo.stop();
      } catch {
        /* already stopped */
      }
      try {
        bus.disconnect();
      } catch {
        /* ctx closing */
      }
    },
  };
}

/** ~4s network budget before we fall to the synth. */
const FETCH_BUDGET_MS = 4000;

export async function loadPianoAudio(
  ctx: AudioContext,
  master: SafeMaster,
  uuid: string,
  unmountSignal: AbortSignal,
): Promise<LoadedAudio> {
  const analyser = makeAnalyser(ctx);

  // Local controller bounds the fetch; the unmount signal chains into it. We
  // distinguish the two afterwards so a timeout yields the synth but a genuine
  // unmount re-throws and lets the caller bail.
  const localCtrl = new AbortController();
  const onUnmount = () => localCtrl.abort();
  unmountSignal.addEventListener("abort", onUnmount);
  const timer = window.setTimeout(() => localCtrl.abort(), FETCH_BUDGET_MS);

  try {
    if (typeof ctx.decodeAudioData !== "function") {
      throw new Error("decodeAudioData unsupported");
    }
    const signal = localCtrl.signal;
    const metaRes = await fetch(`/api/audio/${uuid}`, { signal });
    if (!metaRes.ok) throw new Error(`audio API ${metaRes.status}`);
    const meta = (await metaRes.json()) as { url?: string };
    if (!meta.url) throw new Error("no url in response");

    const audioRes = await fetch(meta.url, { signal });
    if (!audioRes.ok) throw new Error(`audio file ${audioRes.status}`);
    const decoded = await ctx.decodeAudioData((await audioRes.arrayBuffer()).slice(0));

    const src = ctx.createBufferSource();
    src.buffer = decoded;
    src.loop = true;
    src.connect(master.input);
    src.connect(analyser);
    src.start();

    return {
      mode: "real",
      analyser,
      source: src,
      synth: null,
      statusMsg: "real recording — Karel's piano is falling into light",
      errorMsg: "",
    };
  } catch {
    // A real unmount aborted us — re-throw so the caller tears down cleanly.
    if (unmountSignal.aborted) throw new DOMException("unmounted", "AbortError");

    // Timeout OR network/decode failure → seeded drone, so the nebula always
    // has onsets to spawn on.
    const feed = ctx.createGain();
    feed.gain.value = 1;
    feed.connect(master.input);
    feed.connect(analyser);
    const synth = buildSynth(ctx, feed);
    return {
      mode: "synth",
      analyser,
      source: null,
      synth,
      statusMsg: "offline demo (synth) — a seeded warm drone stands in",
      errorMsg: "",
    };
  } finally {
    window.clearTimeout(timer);
    unmountSignal.removeEventListener("abort", onUnmount);
  }
}

// ── Spectral-flux + RMS reader ──────────────────────────────────────────────
export interface Listened {
  /** Positive bin-to-bin magnitude increase, normalized ~0..1. Onset energy. */
  flux: number;
  /** Time-domain RMS loudness, ~0..1. */
  rms: number;
}

export interface SpectralReader {
  read(): Listened;
}

export function makeSpectralReader(analyser: AnalyserNode): SpectralReader {
  const bins = analyser.frequencyBinCount;
  const freq = new Float32Array(bins);
  const prev = new Float32Array(bins);
  const time = new Uint8Array(analyser.fftSize);
  let primed = false;

  return {
    read(): Listened {
      analyser.getFloatFrequencyData(freq);
      let flux = 0;
      for (let i = 0; i < bins; i++) {
        // dB (~ -100..0) → soft linear 0..1
        const cur = Math.max(0, (freq[i] + 100) / 100);
        const d = cur - prev[i];
        if (d > 0) flux += d;
        prev[i] = cur;
      }
      flux /= bins;

      analyser.getByteTimeDomainData(time);
      let sum = 0;
      for (let i = 0; i < time.length; i++) {
        const v = (time[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / time.length);

      if (!primed) {
        primed = true;
        return { flux: 0, rms };
      }
      return { flux, rms };
    },
  };
}
