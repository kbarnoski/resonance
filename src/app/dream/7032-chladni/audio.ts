// ─────────────────────────────────────────────────────────────────────────────
// 7032-chladni · audio.ts — the EXCITER + the ANALYSER + the RE-SONIFIER.
//
//   Two exciter sources, exclusive:
//     · SWEEP  — one OscillatorNode whose frequency is the slider (50–2000 Hz).
//                This is the classic Chladni bow: sweeping it walks the plate
//                through its mode sequence with ZERO file. Always available.
//     · FILE   — a dropped recording (the owner's piano) looped as a
//                BufferSource. Its live spectrum drives the plate.
//
//   An AnalyserNode taps the active source; `analyse()` pulls an FFT, picks the
//   loudest spectral peaks (→ which plate modes light up) and the broadband
//   amplitude (→ how hard the plate shakes).
//
//   The RE-SONIFIER is a bank of up to 8 sine oscillators. `setPartials`
//   retunes them to the geometry the sand just drew (see chladni.modesToPartials)
//   so the emergent figure rings back as a soft additive drone under the source.
//
//   Master ≤ 0.3 behind a DynamicsCompressor limiter. Full teardown on dispose.
// ─────────────────────────────────────────────────────────────────────────────

import type { Partial, SpectralPeak } from "./chladni";
import { FREQ_MAX, FREQ_MIN } from "./chladni";

export interface Analysis {
  peaks: SpectralPeak[];
  /** loudest peak frequency in Hz (0 if silent) */
  dominant: number;
  /** 0..1 broadband RMS amplitude */
  amp: number;
}

export type SourceKind = "sweep" | "file";

export interface ChladniAudio {
  start(): Promise<void>;
  setSource(kind: SourceKind): void;
  readonly source: SourceKind;
  setSweepFreq(hz: number): void;
  decode(data: ArrayBuffer): Promise<void>;
  analyse(): Analysis;
  /** Retune the re-sonification drone to the emergent geometry. */
  setPartials(partials: Partial[]): void;
  setDroneGain(g: number): void;
  readonly started: boolean;
  readonly hasFile: boolean;
  dispose(): void;
}

const DRONE_VOICES = 8;

export function makeChladniAudio(): ChladniAudio {
  const AudioCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AudioCtor();

  // ── master chain: → limiter → analyser → destination ──────────────────
  const master = ctx.createGain();
  master.gain.value = 0.3;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.6;

  master.connect(limiter);
  limiter.connect(ctx.destination);
  // Analyser taps the exciter bus (NOT the drone) so re-sonification never
  // feeds back into the mode picker.
  const exciterBus = ctx.createGain();
  exciterBus.gain.value = 1;
  exciterBus.connect(analyser); // analyser taps the exciter only (not the drone)
  exciterBus.connect(master);

  // ── sweep exciter: one sine, gently low-passed so it reads as a plate bow ──
  const sweepGain = ctx.createGain();
  sweepGain.gain.value = 0.0; // raised on start when source === "sweep"
  const sweepLP = ctx.createBiquadFilter();
  sweepLP.type = "lowpass";
  sweepLP.frequency.value = 2600;
  sweepLP.Q.value = 0.5;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 220;
  osc.connect(sweepGain);
  sweepGain.connect(sweepLP);
  sweepLP.connect(exciterBus);

  // ── file exciter: looped buffer source, (re)built per decode ───────────
  const fileGain = ctx.createGain();
  fileGain.gain.value = 0.0;
  fileGain.connect(exciterBus);
  let fileSrc: AudioBufferSourceNode | null = null;
  let fileBuffer: AudioBuffer | null = null;

  // ── re-sonification drone: a bank of sines retuned to the geometry ─────
  const droneMix = ctx.createGain();
  droneMix.gain.value = 0.5;
  droneMix.connect(master);
  const voices: { osc: OscillatorNode; gain: GainNode }[] = [];
  for (let i = 0; i < DRONE_VOICES; i++) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 110;
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g);
    g.connect(droneMix);
    voices.push({ osc: o, gain: g });
  }

  const freqData = new Float32Array(analyser.frequencyBinCount);
  const timeData = new Uint8Array(analyser.fftSize);

  let started = false;
  let disposed = false;
  let source: SourceKind = "sweep";
  let hasFile = false;

  function applySourceGains() {
    if (!started) return;
    const now = ctx.currentTime;
    sweepGain.gain.setTargetAtTime(source === "sweep" ? 0.09 : 0.0001, now, 0.05);
    fileGain.gain.setTargetAtTime(source === "file" ? 0.9 : 0.0001, now, 0.05);
  }

  function startFilePlayback() {
    if (!fileBuffer || disposed) return;
    if (fileSrc) {
      try {
        fileSrc.stop();
      } catch {
        /* not started */
      }
      fileSrc.disconnect();
    }
    const s = ctx.createBufferSource();
    s.buffer = fileBuffer;
    s.loop = true;
    s.connect(fileGain);
    try {
      s.start();
    } catch {
      /* context closing */
    }
    fileSrc = s;
  }

  return {
    async start() {
      if (disposed) return;
      try {
        await ctx.resume();
      } catch {
        /* already running or blocked */
      }
      if (!started) {
        started = true;
        try {
          osc.start();
        } catch {
          /* already started */
        }
        for (const v of voices) {
          try {
            v.osc.start();
          } catch {
            /* already started */
          }
        }
        if (source === "file") startFilePlayback();
        applySourceGains();
      }
    },
    setSource(kind: SourceKind) {
      if (kind === "file" && !fileBuffer) return; // nothing to play
      source = kind;
      if (kind === "file") startFilePlayback();
      applySourceGains();
    },
    get source() {
      return source;
    },
    setSweepFreq(hz: number) {
      const f = Math.min(FREQ_MAX, Math.max(FREQ_MIN, hz));
      osc.frequency.setTargetAtTime(f, ctx.currentTime, 0.02);
    },
    async decode(data: ArrayBuffer) {
      const decoded = await ctx.decodeAudioData(data.slice(0));
      fileBuffer = decoded;
      hasFile = true;
      source = "file";
      startFilePlayback();
      applySourceGains();
    },
    analyse(): Analysis {
      analyser.getFloatFrequencyData(freqData);
      analyser.getByteTimeDomainData(timeData);

      // Broadband amplitude (time domain RMS).
      let sumSq = 0;
      for (let i = 0; i < timeData.length; i++) {
        const v = (timeData[i] - 128) / 128;
        sumSq += v * v;
      }
      const amp = Math.min(1, Math.sqrt(sumSq / timeData.length) * 3);

      // Peak picking across the exciter band.
      const binHz = ctx.sampleRate / analyser.fftSize;
      const loBin = Math.max(1, Math.floor(FREQ_MIN / binHz));
      const hiBin = Math.min(freqData.length - 2, Math.ceil(FREQ_MAX / binHz));
      let maxDb = -Infinity;
      for (let i = loBin; i <= hiBin; i++) maxDb = Math.max(maxDb, freqData[i]);

      const found: SpectralPeak[] = [];
      if (maxDb > -Infinity) {
        const floor = maxDb - 34; // ~34 dB below the loudest bin
        for (let i = loBin; i <= hiBin; i++) {
          const d = freqData[i];
          if (d < floor) continue;
          if (d >= freqData[i - 1] && d > freqData[i + 1]) {
            // linear magnitude, normalized to the strongest bin later
            found.push({ freq: i * binHz, mag: Math.pow(10, d / 20) });
          }
        }
      }
      found.sort((a, b) => b.mag - a.mag);
      const top = found.slice(0, 4);
      const peak = top.reduce((mx, p) => Math.max(mx, p.mag), 0);
      if (peak > 0) for (const p of top) p.mag = p.mag / peak;

      return { peaks: top, dominant: top[0]?.freq ?? 0, amp };
    },
    setPartials(partials: Partial[]) {
      const now = ctx.currentTime;
      for (let i = 0; i < voices.length; i++) {
        const v = voices[i];
        const p = partials[i];
        if (p) {
          v.osc.frequency.setTargetAtTime(p.freq, now, 0.12);
          v.gain.gain.setTargetAtTime(Math.min(0.5, p.gain), now, 0.2);
        } else {
          v.gain.gain.setTargetAtTime(0, now, 0.2);
        }
      }
    },
    setDroneGain(g: number) {
      droneMix.gain.setTargetAtTime(Math.min(1, Math.max(0, g)), ctx.currentTime, 0.05);
    },
    get started() {
      return started;
    },
    get hasFile() {
      return hasFile;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        osc.stop();
      } catch {
        /* noop */
      }
      for (const v of voices) {
        try {
          v.osc.stop();
        } catch {
          /* noop */
        }
      }
      if (fileSrc) {
        try {
          fileSrc.stop();
        } catch {
          /* noop */
        }
      }
      try {
        master.disconnect();
        limiter.disconnect();
        analyser.disconnect();
        exciterBus.disconnect();
        sweepGain.disconnect();
        sweepLP.disconnect();
        fileGain.disconnect();
        droneMix.disconnect();
      } catch {
        /* noop */
      }
      window.setTimeout(() => {
        ctx.close().catch(() => {
          /* already closed */
        });
      }, 300);
    },
  };
}
