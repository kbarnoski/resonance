// 766 · Sky Orrery — audio engine.
//
// Atlas-Eclipticalis-literal phrase scheduler: Karel's real *Welcome Home*
// piano recording is segmented into whole continuous PHRASE regions (energy-dip
// split). Each celestial body owns a phrase-voice. A self-rescheduling loop
// plays continuous buffer REGIONS — NOT grains — joined by equal-power
// crossfades. A body's ALTITUDE drives its voice gain (sky position → score
// position), its AZIMUTH drives stereo pan. Highest bodies "conduct."
//
// Master chain: per-voice gain → panner → master → analyser → lowpass →
// compressor → destination, with a reverb send (deeper at night).

export const PIANO_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

export async function fetchPianoBuffer(
  ctx: BaseAudioContext,
): Promise<AudioBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`/api/audio/${PIANO_RECORDING_ID}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    let arrayBuf: ArrayBuffer;
    if (ct.includes("application/json")) {
      const json = (await res.json()) as { url?: string };
      if (!json.url) return null;
      const r2 = await fetch(json.url, { signal: controller.signal });
      if (!r2.ok) return null;
      arrayBuf = await r2.arrayBuffer();
    } else {
      arrayBuf = await res.arrayBuffer();
    }
    return await ctx.decodeAudioData(arrayBuf);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Offline fallback buffer: a soft, warm, lyrical piano-ish phrase with several
// distinct sub-phrases, so the piece ALWAYS sounds.
// ---------------------------------------------------------------------------

export async function synthFallbackBuffer(
  sampleRate: number,
): Promise<AudioBuffer> {
  const seconds = 16;
  const offline = new OfflineAudioContext(2, Math.floor(seconds * sampleRate), sampleRate);

  // A gentle warm reverb tail bus.
  const verb = offline.createConvolver();
  verb.buffer = makeImpulse(offline, 2.4, 2.6);
  const verbGain = offline.createGain();
  verbGain.gain.value = 0.25;
  verb.connect(verbGain).connect(offline.destination);

  // Pentatonic-ish warm phrases (Hz). Four sub-phrases over 16s.
  const phrases = [
    [220.0, 261.63, 329.63, 392.0, 329.63],
    [196.0, 246.94, 293.66, 246.94],
    [174.61, 220.0, 261.63, 329.63, 392.0, 440.0],
    [146.83, 196.0, 261.63, 246.94, 196.0],
  ];

  let t = 0.2;
  for (let p = 0; p < phrases.length; p++) {
    const notes = phrases[p];
    const noteDur = (seconds / phrases.length - 0.4) / notes.length;
    for (let n = 0; n < notes.length; n++) {
      runPianoNote(offline, verb, notes[n], t, noteDur * 1.7);
      t += noteDur;
    }
    t += 0.4; // breath between sub-phrases (creates the energy dip)
  }

  return await offline.startRendering();
}

function runPianoNote(
  ctx: BaseAudioContext,
  verb: AudioNode,
  freq: number,
  start: number,
  dur: number,
): void {
  const out = ctx.createGain();
  const peak = 0.16;
  out.gain.setValueAtTime(0, start);
  out.gain.linearRampToValueAtTime(peak, start + 0.012);
  out.gain.exponentialRampToValueAtTime(0.0001, start + dur);

  // Two-partial warm tone + soft attack noise body.
  const partials = [1, 2, 3, 4.2];
  const partialGain = [1, 0.4, 0.18, 0.07];
  for (let i = 0; i < partials.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * partials[i];
    const g = ctx.createGain();
    g.gain.value = partialGain[i];
    osc.connect(g).connect(out);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  out.connect(ctx.destination);
  const send = ctx.createGain();
  send.gain.value = 0.5;
  out.connect(send).connect(verb);
}

function makeImpulse(
  ctx: BaseAudioContext,
  seconds: number,
  decay: number,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(seconds * rate);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Phrase segmentation: energy-dip split, even-slice fallback.
// ---------------------------------------------------------------------------

export type Region = { offset: number; duration: number };

export function segmentBuffer(buffer: AudioBuffer): Region[] {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const total = buffer.duration;
  const win = Math.floor(sr * 0.05); // 50ms RMS window
  const env: number[] = [];
  for (let i = 0; i < data.length; i += win) {
    let sum = 0;
    const end = Math.min(i + win, data.length);
    for (let j = i; j < end; j++) sum += data[j] * data[j];
    env.push(Math.sqrt(sum / Math.max(1, end - i)));
  }
  // Find local minima of energy as phrase boundaries.
  let peak = 0;
  for (const e of env) peak = Math.max(peak, e);
  const thresh = peak * 0.12;

  const boundaries: number[] = [0];
  const minGapWin = Math.floor(2.8 / 0.05); // >=2.8s between cuts
  for (let i = 2; i < env.length - 2; i++) {
    const isDip =
      env[i] < thresh &&
      env[i] <= env[i - 1] &&
      env[i] <= env[i + 1];
    if (isDip) {
      const last = boundaries[boundaries.length - 1];
      if (i - last >= minGapWin) boundaries.push(i);
    }
  }
  boundaries.push(env.length);

  const regions: Region[] = [];
  for (let b = 0; b < boundaries.length - 1; b++) {
    const offset = (boundaries[b] * win) / sr;
    const duration = ((boundaries[b + 1] - boundaries[b]) * win) / sr;
    if (duration >= 2.2 && duration <= 9.0) {
      regions.push({ offset, duration: Math.min(duration, 8) });
    } else if (duration > 9.0) {
      // Split long regions into ~6s chunks.
      let o = offset;
      const end = offset + duration;
      while (end - o > 2.2) {
        const d = Math.min(6, end - o);
        regions.push({ offset: o, duration: d });
        o += d;
      }
    }
  }

  // Even-slice fallback if energy-dip split yielded too few regions.
  if (regions.length < 6) {
    regions.length = 0;
    const n = 8;
    const seg = total / n;
    for (let i = 0; i < n; i++) {
      regions.push({
        offset: i * seg,
        duration: Math.min(seg, 8),
      });
    }
  }

  return regions;
}

// ---------------------------------------------------------------------------
// Voices: one per celestial body. Each owns a phrase region and a panner/gain.
// ---------------------------------------------------------------------------

export type VoiceTarget = {
  id: string;
  /** 0..1 gain target derived from altitude */
  gain: number;
  /** -1..1 pan derived from azimuth */
  pan: number;
  /** brightness 0..1 → lowpass on the voice send */
  bright: number;
};

type Voice = {
  id: string;
  region: Region;
  gain: GainNode;
  panner: StereoPannerNode;
  filter: BiquadFilterNode;
  targetGain: number;
  targetPan: number;
  targetBright: number;
  /** absolute ctx time when the current region's crossfade-out should begin */
  nextScheduleAt: number;
  active: number; // running source count
  onPulse?: () => void;
};

export type Engine = {
  ctx: AudioContext;
  analyser: AnalyserNode;
  start: () => Promise<void>;
  stop: () => void;
  setSource: (label: string) => void;
  setTargets: (targets: VoiceTarget[]) => void;
  setReverb: (amount: number) => void;
  getLevel: () => number;
  sourceLabel: () => string;
};

const FADE = 1.1; // equal-power crossfade seconds

export function createEngine(
  bodyIds: string[],
  onPulse: (id: string) => void,
): Engine {
  const ctx = new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext)();

  let buffer: AudioBuffer | null = null;
  let regions: Region[] = [];
  let label = "loading";
  let running = false;
  let rafTimer: number | null = null;

  // Master chain.
  const master = ctx.createGain();
  master.gain.value = 0.0;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 14000;
  lowpass.Q.value = 0.4;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;

  master.connect(analyser);
  analyser.connect(lowpass);
  lowpass.connect(comp);
  comp.connect(ctx.destination);

  // Reverb send.
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx, 3.2, 2.8);
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.25;
  reverbSend.connect(reverb);
  reverb.connect(comp);

  const voices: Voice[] = bodyIds.map((id) => {
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    const panner = ctx.createStereoPanner();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 3000;
    filter.Q.value = 0.3;
    // per-voice: sources → filter → gain (body-level macro) → panner → master
    //            (+ reverb send post-panner)
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(master);
    panner.connect(reverbSend);
    return {
      id,
      region: { offset: 0, duration: 4 },
      gain,
      panner,
      filter,
      targetGain: 0,
      targetPan: 0,
      targetBright: 0.5,
      nextScheduleAt: 0,
      active: 0,
      onPulse: () => onPulse(id),
    };
  });

  function assignRegions(): void {
    if (regions.length === 0) return;
    voices.forEach((v, i) => {
      v.region = regions[i % regions.length];
    });
  }

  function scheduleVoice(v: Voice, when: number): void {
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const env = ctx.createGain();
    env.gain.value = 0.0001;
    src.connect(env);
    env.connect(v.filter);

    const dur = v.region.duration;
    const startAt = Math.max(when, ctx.currentTime + 0.02);
    // Equal-power fade in.
    env.gain.setValueAtTime(0.0001, startAt);
    env.gain.linearRampToValueAtTime(1, startAt + FADE);
    env.gain.setValueAtTime(1, startAt + dur - FADE);
    env.gain.linearRampToValueAtTime(0.0001, startAt + dur);

    src.start(startAt, v.region.offset, dur + 0.05);
    src.stop(startAt + dur + 0.1);
    v.active++;
    if (v.onPulse) {
      const ms = Math.max(0, (startAt - ctx.currentTime) * 1000);
      setTimeout(() => {
        if (running) v.onPulse?.();
      }, ms + 30);
    }
    src.onended = () => {
      v.active = Math.max(0, v.active - 1);
      try {
        env.disconnect();
        src.disconnect();
      } catch {
        // already torn down
      }
    };

    // Next region begins FADE before this one ends (crossfade); occasionally
    // hop to a neighbouring region so the arrangement keeps evolving.
    v.nextScheduleAt = startAt + dur - FADE;
    if (Math.random() < 0.45 && regions.length > 1) {
      const idx = Math.floor(Math.random() * regions.length);
      v.region = regions[idx];
    }
  }

  function tick(): void {
    if (!running) return;
    const now = ctx.currentTime;
    const look = now + 0.5;
    for (const v of voices) {
      // Apply smoothed targets.
      v.gain.gain.setTargetAtTime(Math.max(0.0001, v.targetGain), now, 0.6);
      v.panner.pan.setTargetAtTime(v.targetPan, now, 0.5);
      const cutoff = 600 + v.targetBright * 7000;
      v.filter.frequency.setTargetAtTime(cutoff, now, 0.7);

      // Only schedule phrases for voices that are reasonably audible (body up).
      if (v.targetGain > 0.04 && look >= v.nextScheduleAt) {
        scheduleVoice(v, v.nextScheduleAt > 0 ? v.nextScheduleAt : now + 0.05);
      } else if (v.targetGain <= 0.04) {
        // body set; let its tail finish, push schedule out.
        v.nextScheduleAt = now + 2;
      }
    }
    rafTimer = window.setTimeout(tick, 120);
  }

  return {
    ctx,
    analyser,
    async start() {
      if (ctx.state === "suspended") await ctx.resume();
      buffer = await fetchPianoBuffer(ctx);
      if (buffer) {
        label = "Karel — Welcome Home (real piano)";
      } else {
        buffer = await synthFallbackBuffer(ctx.sampleRate);
        label = "synthesized stand-in (no network)";
      }
      regions = segmentBuffer(buffer);
      assignRegions();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(0.0001, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 2.5);
      running = true;
      // prime each up-voice so sound starts promptly.
      const now = ctx.currentTime;
      voices.forEach((v) => {
        v.nextScheduleAt = now + 0.1 + Math.random() * 0.6;
      });
      tick();
    },
    stop() {
      running = false;
      if (rafTimer !== null) {
        clearTimeout(rafTimer);
        rafTimer = null;
      }
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
      } catch {
        // ignore
      }
      setTimeout(() => {
        if (ctx.state !== "closed") ctx.close().catch(() => undefined);
      }, 600);
    },
    setSource(l: string) {
      label = l;
    },
    setTargets(targets: VoiceTarget[]) {
      const byId = new Map(targets.map((t) => [t.id, t]));
      for (const v of voices) {
        const t = byId.get(v.id);
        if (!t) {
          v.targetGain = 0;
          continue;
        }
        v.targetGain = t.gain;
        v.targetPan = t.pan;
        v.targetBright = t.bright;
      }
    },
    setReverb(amount: number) {
      reverbSend.gain.setTargetAtTime(
        Math.max(0.05, Math.min(0.6, amount)),
        ctx.currentTime,
        0.8,
      );
    },
    getLevel() {
      const arr = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(arr);
      let sum = 0;
      for (let i = 0; i < arr.length; i++) {
        const x = (arr[i] - 128) / 128;
        sum += x * x;
      }
      return Math.sqrt(sum / arr.length);
    },
    sourceLabel() {
      return label;
    },
  };
}
