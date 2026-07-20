// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the responsive harmony + the mic front-end for 2004-oracle-echo.
//
//   OracleAudio: a small tempered chord instrument. A sustained pad holds root +
//   fifth + octave and crossfades a MINOR third against a MAJOR third by valence
//   (a smooth, in-tune major↔dark morph — ordinary 12-TET voicings, no
//   just-intonation partial stack). Arousal opens the filter, lifts the octave
//   shimmer, and quickens a soft arpeggio; level swells the master gain.
//
//   MicInput: opens the microphone, exposes spectral features (centroid → a
//   pseudo-valence "brightness", RMS → a pseudo-arousal "energy") for the
//   no-ML fallback path, AND keeps a rolling PCM ring buffer so whisper can be
//   fed ~4 s windows resampled to 16 kHz.
// ─────────────────────────────────────────────────────────────────────────────

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
}

const ROOT_MIDI = 48; // C3 — steady tonal center

export class OracleAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private padFilter: BiquadFilterNode;
  private arpBus: GainNode;
  private delay: DelayNode;

  private root!: Voice;
  private fifth!: Voice;
  private octave!: Voice;
  private minorThird!: Voice;
  private majorThird!: Voice;

  private valence = 0.5;
  private arousal = 0.4;
  private started = false;

  private schedTimer: number | undefined;
  private nextStep = 0;
  private stepDur = 0.4;
  private arpGain = 0;
  private arpIdx = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // a light feedback delay for air
    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.28;
    const fb = ctx.createGain();
    fb.gain.value = 0.34;
    const wet = ctx.createGain();
    wet.gain.value = 0.18;
    this.delay.connect(fb);
    fb.connect(this.delay);
    this.delay.connect(wet);
    wet.connect(this.master);

    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 600;
    this.padFilter.Q.value = 0.7;
    this.padFilter.connect(this.master);
    this.padFilter.connect(this.delay);

    this.arpBus = ctx.createGain();
    this.arpBus.gain.value = 1;
    this.arpBus.connect(this.master);
    this.arpBus.connect(this.delay);

    this.root = this.makeVoice("triangle", 0.5);
    this.fifth = this.makeVoice("triangle", 0.32);
    this.octave = this.makeVoice("sine", 0.14);
    this.minorThird = this.makeVoice("sine", 0.24);
    this.majorThird = this.makeVoice("sine", 0.0);
    this.applyChord();
  }

  private makeVoice(type: OscillatorType, gain: number): Voice {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    osc.connect(g);
    g.connect(this.padFilter);
    return { osc, gain: g };
  }

  private applyChord() {
    const now = this.ctx.currentTime;
    const set = (v: Voice, semis: number) =>
      v.osc.frequency.setTargetAtTime(midiToFreq(ROOT_MIDI + semis), now, 0.15);
    set(this.root, 0);
    set(this.fifth, 7);
    set(this.octave, 12);
    set(this.minorThird, 3);
    set(this.majorThird, 4);
  }

  async start() {
    if (this.started) return;
    this.started = true;
    try {
      await this.ctx.resume();
    } catch {
      /* resume may already be running */
    }
    const now = this.ctx.currentTime;
    for (const v of [this.root, this.fifth, this.octave, this.minorThird, this.majorThird]) {
      v.osc.start(now);
    }
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.linearRampToValueAtTime(0.2, now + 1.6);
    this.startScheduler();
  }

  /** Drive the whole instrument from the field state. Called ~10 Hz. */
  setDrive(valence: number, arousal: number, level: number) {
    if (!this.started) return;
    this.valence = clamp01(valence);
    this.arousal = clamp01(arousal);
    const now = this.ctx.currentTime;
    const lv = clamp01(level);

    // major↔minor crossfade (tempered, in tune)
    this.minorThird.gain.gain.setTargetAtTime(0.26 * (1 - this.valence), now, 0.2);
    this.majorThird.gain.gain.setTargetAtTime(0.26 * this.valence, now, 0.2);
    // octave shimmer rises with arousal
    this.octave.gain.gain.setTargetAtTime(0.1 + this.arousal * 0.16, now, 0.2);
    // filter opens with brightness + energy + loudness
    const cutoff = Math.min(
      6000,
      420 + this.valence * 700 + this.arousal * 1500 + lv * 900,
    );
    this.padFilter.frequency.setTargetAtTime(cutoff, now, 0.15);
    // master swells slightly with level
    this.master.gain.setTargetAtTime(0.2 + lv * 0.06, now, 0.2);

    // arpeggio: quicker + louder with arousal, silent when very calm
    this.stepDur = 0.52 - this.arousal * 0.36;
    this.arpGain = clamp01(this.arousal * 0.9 - 0.06) * (0.35 + lv * 0.6);
  }

  private startScheduler() {
    const lookahead = 0.12;
    this.nextStep = this.ctx.currentTime + 0.15;
    const tick = () => {
      while (this.nextStep < this.ctx.currentTime + lookahead) {
        this.schedulePluck(this.nextStep);
        this.nextStep += this.stepDur;
      }
      this.schedTimer = window.setTimeout(tick, 25);
    };
    tick();
  }

  private schedulePluck(time: number) {
    const amp = this.arpGain * 0.22;
    if (amp < 0.01) return;
    // cycle chord tones; add an octave lift when energetic
    const third = this.valence >= 0.5 ? 4 : 3;
    const tones = [0, 7, 12, third, 7 + 12];
    const lift = this.arousal > 0.62 ? 12 : 0;
    const semis = tones[this.arpIdx++ % tones.length] + lift;
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = midiToFreq(ROOT_MIDI + 12 + semis);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(amp, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.26);
    osc.connect(g);
    g.connect(this.arpBus);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  dispose() {
    if (this.schedTimer !== undefined) {
      clearTimeout(this.schedTimer);
      this.schedTimer = undefined;
    }
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0, now, 0.1);
    } catch {
      /* ignore */
    }
    for (const v of [this.root, this.fifth, this.octave, this.minorThird, this.majorThird]) {
      try {
        v.osc.stop(now + 0.3);
      } catch {
        /* already stopped */
      }
    }
    this.started = false;
  }
}

// ── microphone front-end ─────────────────────────────────────────────────────

export interface MicFeatures {
  centroid: number; // Hz
  rms: number; // 0..~1
}

/** Linear resample of a mono buffer to 16 kHz (whisper's expected rate). */
export function resampleTo16k(input: Float32Array, srcRate: number): Float32Array {
  if (srcRate === 16000) return input;
  const ratio = srcRate / 16000;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const f = pos - i0;
    out[i] = input[i0] * (1 - f) + input[i1] * f;
  }
  return out;
}

export function rmsOf(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / Math.max(1, buf.length));
}

export class MicInput {
  private ctx: AudioContext;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private proc: ScriptProcessorNode | null = null;
  private mute: GainNode | null = null;
  private freqBuf: Float32Array | null = null;
  private timeBuf: Float32Array | null = null;

  // rolling PCM ring buffer (~6 s) at ctx.sampleRate
  private ring: Float32Array | null = null;
  private writePos = 0;
  private filled = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  async start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.stream = stream;
    const source = this.ctx.createMediaStreamSource(stream);
    this.source = source;

    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.5;
    this.analyser = analyser;
    this.freqBuf = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));
    this.timeBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));

    this.ring = new Float32Array(Math.floor(this.ctx.sampleRate * 6));

    // ScriptProcessorNode is deprecated but universally available and the
    // simplest lossless capture path; routed through a muted gain so nothing
    // reaches the speakers (no feedback).
    const proc = this.ctx.createScriptProcessor(4096, 1, 1);
    this.proc = proc;
    proc.onaudioprocess = (e) => {
      const inBuf = e.inputBuffer.getChannelData(0);
      const ring = this.ring;
      if (!ring) return;
      for (let i = 0; i < inBuf.length; i++) {
        ring[this.writePos] = inBuf[i];
        this.writePos = (this.writePos + 1) % ring.length;
      }
      this.filled = Math.min(ring.length, this.filled + inBuf.length);
    };
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    this.mute = mute;

    source.connect(analyser);
    source.connect(proc);
    proc.connect(mute);
    mute.connect(this.ctx.destination);
  }

  getFeatures(): MicFeatures {
    const analyser = this.analyser;
    const fbuf = this.freqBuf;
    const tbuf = this.timeBuf;
    if (!analyser || !fbuf || !tbuf) return { centroid: 0, rms: 0 };
    analyser.getFloatFrequencyData(fbuf as unknown as Float32Array<ArrayBuffer>);
    analyser.getFloatTimeDomainData(tbuf as unknown as Float32Array<ArrayBuffer>);
    const binHz = this.ctx.sampleRate / analyser.fftSize;
    let wSum = 0;
    let mSum = 0;
    for (let b = 1; b < fbuf.length; b++) {
      const lin = Math.pow(10, fbuf[b] / 20);
      wSum += b * binHz * lin;
      mSum += lin;
    }
    const centroid = mSum > 0 ? wSum / mSum : 0;
    return { centroid, rms: rmsOf(tbuf) };
  }

  /** Return the most recent `seconds` of PCM at ctx.sampleRate (chronological). */
  getWindow(seconds: number): Float32Array {
    const ring = this.ring;
    if (!ring) return new Float32Array(0);
    const want = Math.min(this.filled, Math.floor(this.ctx.sampleRate * seconds));
    const out = new Float32Array(want);
    let idx = (this.writePos - want + ring.length) % ring.length;
    for (let i = 0; i < want; i++) {
      out[i] = ring[idx];
      idx = (idx + 1) % ring.length;
    }
    return out;
  }

  stop() {
    try {
      if (this.proc) this.proc.onaudioprocess = null;
      this.proc?.disconnect();
      this.mute?.disconnect();
      this.analyser?.disconnect();
      this.source?.disconnect();
    } catch {
      /* ignore */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ring = null;
    this.proc = null;
    this.analyser = null;
    this.source = null;
  }
}

/** Map spectral centroid (Hz) to a pseudo-valence brightness 0..1. */
export function centroidToValence(centroid: number): number {
  if (centroid <= 0) return 0.5;
  const lo = Math.log2(280);
  const hi = Math.log2(3600);
  return clamp01((Math.log2(Math.max(280, centroid)) - lo) / (hi - lo));
}
