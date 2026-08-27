// ─────────────────────────────────────────────────────────────────────────────
// 16208 · loomvoice — engine.ts
//
// The loom: four of Karel's COMPLETE recordings loop simultaneously, forever, as
// four threads of one cloth. A live human voice is the shuttle — but it only ever
// CONTROLS the weave, it is never heard.
//
//   pitch    → surface position (which take rises to the top of the cloth)
//   loudness → weave tightness + stereo spread (whisper packs the threads to a
//              tight center; a strong voice throws them wide across the field)
//
// Every audible strand:  source(loop) → lowpass → gain → stereo pan → safeMaster.
// The mic:               getUserMedia → MediaStreamSource → analyser  (and STOPS
//                        there — never routed to the master or the speakers).
//
// This module holds the audio-graph construction, the control-only mic tap, and
// the pure math that turns one 2-D control point into per-strand targets. React,
// SVG and the animation loop live in page.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { loadRealTrackBuffer } from "../_shared/welcomeHome";

/** The four whole takes woven into the cloth, in surface order 0→3 (low→high).
 *  One polychrome hue per thread — art-layer hsl, distinct around the wheel. */
export const LOOM_TRACKS: ReadonlyArray<{
  id: string;
  title: string;
  hue: number; // hsl hue, 0..360
}> = [
  { id: "d57cfae6-f234-4d24-85fe-72a8ad93a44a", title: "Interplay", hue: 192 }, // cyan
  { id: "eba95845-cdbf-41d8-9c5d-8679686811ad", title: "Bath", hue: 45 }, // gold
  { id: "1f0a541e-df60-44a9-b839-5dc69a007d9f", title: "2019", hue: 148 }, // green
  { id: "d2eeee58-832b-4872-a4be-8fbf030b981d", title: "Rolling", hue: 14 }, // coral
] as const;

export const STRAND_COUNT = LOOM_TRACKS.length;

/** Per-strand stereo fan (strand order → left…right). Scaled by spread. */
export const PAN_FAN: readonly number[] = [-0.8, -0.27, 0.27, 0.8];

// ── voice-read tuning ─────────────────────────────────────────────────────────
const PITCH_LO_HZ = 90;
const PITCH_HI_HZ = 700;
const LN_LO = Math.log(PITCH_LO_HZ);
const LN_HI = Math.log(PITCH_HI_HZ);
const NOISE_FLOOR_RMS = 0.012; // below this the room is treated as silent
const VOICED_BIN_DB = 138; // byte-magnitude a peak bin must clear to count as voiced

// ── control point in the 2-D loom space ────────────────────────────────────────
export interface Control {
  /** 0 = strand 0 surfaced (low voice) … 1 = strand 3 surfaced (high voice). */
  surface: number;
  /** 0 = tight & centered (whisper) … 1 = spread wide across the field (strong). */
  spread: number;
}

// ── per-strand targets + visual geometry for one control point ─────────────────
export interface WeaveFrame {
  prominence: number[]; // 0..1, how surfaced each strand is
  gain: number[]; // audio gain target
  cutoff: number[]; // lowpass corner (Hz)
  pan: number[]; // stereo pan target -0.8..0.8
  x: number[]; // SVG x-position of each thread (viewBox 0..100)
  strokeW: number[]; // SVG stroke width
  bright: number[]; // 0..1 art brightness
  order: number[]; // strand indices sorted dim→bright (draw order)
}

export interface Strand {
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  panner: StereoPannerNode;
  title: string;
  hue: number;
  present: boolean;
}

export interface LoomAudio {
  ctx: AudioContext;
  master: SafeMaster;
  strands: Strand[];
  loadedCount: number;
}

export interface MicTap {
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  timeBuf: Uint8Array<ArrayBuffer>;
  freqBuf: Uint8Array<ArrayBuffer>;
  binHz: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ── build the four-strand loom, start every take at sample 0, looping ───────────
export async function loadLoom(): Promise<LoomAudio | null> {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;

  const ctx = new AC();
  try {
    await ctx.resume();
  } catch {
    /* may already be running */
  }

  const master = createSafeMaster(ctx);
  master.setGain(0.85);

  const results = await Promise.allSettled(
    LOOM_TRACKS.map((t) => loadRealTrackBuffer(ctx, t.id)),
  );

  if (!results.some((r) => r.status === "fulfilled")) {
    master.disconnect();
    void ctx.close().catch(() => {});
    return null;
  }

  const start = ctx.currentTime + 0.08; // everyone in at the same instant
  const strands: Strand[] = [];

  results.forEach((res, i) => {
    const meta = LOOM_TRACKS[i];
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1200;
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    const panner = ctx.createStereoPanner();
    panner.pan.value = PAN_FAN[i] * 0.25;

    const source = ctx.createBufferSource();
    source.loop = true;

    const present = res.status === "fulfilled";
    if (present) {
      source.buffer = res.value.buffer;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      panner.connect(master.input);
      source.start(start);
      // a gentle fade-in so the four takes bloom together, none from full silence
      gain.gain.setTargetAtTime(0.12, start, 1.0);
    }

    strands.push({
      source,
      filter,
      gain,
      panner,
      title: present ? res.value.title : meta.title,
      hue: meta.hue,
      present,
    });
  });

  return {
    ctx,
    master,
    strands,
    loadedCount: results.filter((r) => r.status === "fulfilled").length,
  };
}

// ── open the mic as a CONTROL-ONLY analyser (rule 10: never routed onward) ──────
export async function attachMic(ctx: AudioContext): Promise<MicTap> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.5;
  source.connect(analyser);
  // DELIBERATELY nothing after `analyser` — the mic is control-only, never audible.

  return {
    stream,
    source,
    analyser,
    timeBuf: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
    freqBuf: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
    binHz: ctx.sampleRate / analyser.fftSize,
  };
}

/** One frame of voice-reading: loudness (RMS) + rough dominant pitch. */
export interface VoiceRead {
  level: number; // 0..1 loudness
  pitchHz: number | null; // dominant pitch in 90–700 Hz, or null if unvoiced
}

export function readVoice(mic: MicTap): VoiceRead {
  mic.analyser.getByteTimeDomainData(mic.timeBuf);
  let sumSq = 0;
  for (let i = 0; i < mic.timeBuf.length; i++) {
    const v = (mic.timeBuf[i] - 128) / 128;
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / mic.timeBuf.length);
  const level = clamp01(rms * 6);

  if (rms < NOISE_FLOOR_RMS) return { level, pitchHz: null };

  mic.analyser.getByteFrequencyData(mic.freqBuf);
  const loBin = Math.max(1, Math.floor(PITCH_LO_HZ / mic.binHz));
  const hiBin = Math.min(mic.freqBuf.length - 1, Math.ceil(PITCH_HI_HZ / mic.binHz));
  let peakBin = -1;
  let peakVal = 0;
  for (let b = loBin; b <= hiBin; b++) {
    if (mic.freqBuf[b] > peakVal) {
      peakVal = mic.freqBuf[b];
      peakBin = b;
    }
  }
  if (peakBin < 0 || peakVal < VOICED_BIN_DB) return { level, pitchHz: null };

  // parabolic interpolation around the peak for a smoother pitch estimate
  const l = mic.freqBuf[peakBin - 1];
  const c = mic.freqBuf[peakBin];
  const r = mic.freqBuf[peakBin + 1] ?? c;
  const denom = l - 2 * c + r;
  const shift = denom !== 0 ? (0.5 * (l - r)) / denom : 0;
  const pitchHz = (peakBin + shift) * mic.binHz;
  return { level, pitchHz };
}

/** Map a dominant pitch (Hz) to the surface axis 0..1 (log-scaled). */
export function pitchToSurface(pitchHz: number): number {
  return clamp01((Math.log(pitchHz) - LN_LO) / (LN_HI - LN_LO));
}

// ── the pure heart: one control point → per-strand targets + geometry ───────────
const CENTER_X = 50;
const BASE_SPREAD_X = 6; // tight cluster half-width (still four distinct threads)
const MAX_SPREAD_X = 39; // extra half-width at full loudness

export function computeWeave(control: Control): WeaveFrame {
  const surfacePos = control.surface * (STRAND_COUNT - 1); // 0..3
  const sigma = 0.9;

  const prominence: number[] = [];
  for (let i = 0; i < STRAND_COUNT; i++) {
    const d = i - surfacePos;
    prominence.push(Math.exp(-(d * d) / (2 * sigma * sigma)));
  }

  const gain: number[] = [];
  const cutoff: number[] = [];
  const pan: number[] = [];
  const x: number[] = [];
  const strokeW: number[] = [];
  const bright: number[] = [];

  for (let i = 0; i < STRAND_COUNT; i++) {
    const p = prominence[i];
    // a gain floor keeps every strand faintly present — real polyphony, never mute
    gain.push(0.06 + 0.42 * p);
    // receded strands close down to a muffled 500 Hz; the surfaced one opens up
    cutoff.push(500 * Math.pow(24, p));
    const panVal = PAN_FAN[i] * control.spread;
    pan.push(panVal);
    x.push(CENTER_X + PAN_FAN[i] * (BASE_SPREAD_X + control.spread * MAX_SPREAD_X));
    strokeW.push(1.4 + 5.2 * p);
    bright.push(0.34 + 0.66 * p);
  }

  const order = [...Array(STRAND_COUNT).keys()].sort(
    (a, b) => prominence[a] - prominence[b],
  );

  return { prominence, gain, cutoff, pan, x, strokeW, bright, order };
}

/** Ease the audio graph toward a control point (musical ~0.4 s time-constant). */
export function applyWeaveToAudio(audio: LoomAudio, frame: WeaveFrame): void {
  const t = audio.ctx.currentTime;
  const TC = 0.4;
  audio.strands.forEach((s, i) => {
    if (!s.present) return;
    s.gain.gain.setTargetAtTime(frame.gain[i], t, TC);
    s.filter.frequency.setTargetAtTime(frame.cutoff[i], t, TC);
    s.panner.pan.setTargetAtTime(frame.pan[i], t, TC);
  });
}

// ── teardown: stop sources, drop the mic, close the context ─────────────────────
export function teardownLoom(audio: LoomAudio | null, mic: MicTap | null): void {
  if (mic) {
    try {
      mic.stream.getTracks().forEach((tr) => tr.stop());
    } catch {
      /* noop */
    }
    try {
      mic.source.disconnect();
      mic.analyser.disconnect();
    } catch {
      /* noop */
    }
  }
  if (audio) {
    for (const s of audio.strands) {
      try {
        if (s.present) s.source.stop();
      } catch {
        /* already stopped */
      }
      try {
        s.source.disconnect();
        s.filter.disconnect();
        s.gain.disconnect();
        s.panner.disconnect();
      } catch {
        /* noop */
      }
    }
    audio.master.disconnect();
    void audio.ctx.close().catch(() => {});
  }
}
