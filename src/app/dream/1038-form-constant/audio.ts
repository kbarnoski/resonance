// ════════════════════════════════════════════════════════════════════════════
// Inline Web Audio engine for 1038-form-constant.
//
// Two sources, one analyser:
//  - MIC: getUserMedia -> AnalyserNode (primary, non-pointer input).
//  - DRONE fallback: a Shepard-Risset-style bank of octave-spaced detuned sine
//    oscillators under a slow Gaussian amplitude window for an endless-ascent
//    feel, routed through the same analyser so the piece is always audio-visual.
//
// getByteFrequencyData feeds shader uniforms (bass/mids/highs/loudness).
// ════════════════════════════════════════════════════════════════════════════

export type AudioBands = {
  bass: number; // 0..1
  mids: number; // 0..1
  highs: number; // 0..1
  level: number; // 0..1 overall loudness
};

type DroneVoice = {
  osc: OscillatorNode;
  detune: OscillatorNode;
  gain: GainNode;
  baseRatio: number; // octave index within the bank
};

export class FormAudioEngine {
  private ctx: AudioContext;
  private analyser: AnalyserNode;
  private freqData: Uint8Array<ArrayBuffer>;
  private masterGain: GainNode;

  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;

  private droneVoices: DroneVoice[] = [];
  private droneGain: GainNode | null = null;
  private droneRunning = false;
  private droneStartTime = 0;

  // smoothed bands
  private sBass = 0;
  private sMids = 0;
  private sHighs = 0;
  private sLevel = 0;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.78;
    this.freqData = new Uint8Array(
      new ArrayBuffer(this.analyser.frequencyBinCount)
    );

    // analyser is a passive tap; master routes audible sources to speakers.
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.0;
    this.masterGain.connect(this.ctx.destination);
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  // ── MIC input (primary) ────────────────────────────────────────────────────
  async startMic(): Promise<void> {
    await this.resume();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.micStream = stream;
    this.micSource = this.ctx.createMediaStreamSource(stream);
    // tap into analyser only (do NOT route mic to speakers -> feedback).
    this.micSource.connect(this.analyser);
  }

  // ── DRONE fallback (Shepard-Risset endless ascent) ─────────────────────────
  async startDrone(): Promise<void> {
    await this.resume();
    if (this.droneRunning) return;

    const out = this.ctx.createGain();
    out.gain.value = 0.9;
    out.connect(this.analyser); // drive analyser
    out.connect(this.masterGain); // and make it audible
    this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.masterGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(0.5, this.ctx.currentTime + 2.0);
    this.droneGain = out;

    const baseFreq = 55; // A1
    const numOctaves = 7;
    for (let i = 0; i < numOctaves; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      const detune = this.ctx.createOscillator();
      detune.type = "sine";
      detune.frequency.value = 0.07 + i * 0.013; // slow LFO per voice
      const detuneGain = this.ctx.createGain();
      detuneGain.gain.value = 5 + i; // cents of slow wobble
      detune.connect(detuneGain);
      detuneGain.connect(osc.detune);

      const g = this.ctx.createGain();
      g.gain.value = 0.0;
      osc.connect(g);
      g.connect(out);

      osc.frequency.value = baseFreq * Math.pow(2, i);
      osc.start();
      detune.start();
      this.droneVoices.push({ osc, detune, gain: g, baseRatio: i });
    }

    this.droneRunning = true;
    this.droneStartTime = this.ctx.currentTime;
  }

  // Update the Shepard-Risset window each frame so pitch perpetually ascends.
  private updateDrone() {
    if (!this.droneRunning) return;
    const t = this.ctx.currentTime - this.droneStartTime;
    const period = 22; // seconds for a full glide cycle
    const phase = (t / period) % 1; // 0..1 climbing index
    const n = this.droneVoices.length;
    const sigma = 0.22; // width of Gaussian loudness window over octaves
    const center = 0.5; // perceptual mid of the bank
    for (const v of this.droneVoices) {
      // each voice slowly climbs an octave then wraps; loudness follows a
      // Gaussian centered in the band so wrap-arounds are inaudible.
      const climbed = v.baseRatio + phase;
      const wrapped = climbed % n;
      const freq = 55 * Math.pow(2, wrapped);
      v.osc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);
      const x = (wrapped / (n - 1) - center) / sigma;
      const amp = Math.exp(-0.5 * x * x) * 0.16;
      v.gain.gain.setTargetAtTime(amp, this.ctx.currentTime, 0.1);
    }
  }

  // ── per-frame analysis ──────────────────────────────────────────────────────
  read(): AudioBands {
    this.updateDrone();
    this.analyser.getByteFrequencyData(this.freqData);

    const data = this.freqData;
    const n = data.length;
    // band splits across the spectrum
    const bassEnd = Math.floor(n * 0.08);
    const midEnd = Math.floor(n * 0.4);

    let bSum = 0;
    let mSum = 0;
    let hSum = 0;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const val = data[i] / 255;
      total += val;
      if (i < bassEnd) bSum += val;
      else if (i < midEnd) mSum += val;
      else hSum += val;
    }
    const bass = bassEnd > 0 ? bSum / bassEnd : 0;
    const mids = midEnd - bassEnd > 0 ? mSum / (midEnd - bassEnd) : 0;
    const highs = n - midEnd > 0 ? hSum / (n - midEnd) : 0;
    const level = total / n;

    // smooth (attack/decay) so visuals never jump abruptly
    const a = 0.25;
    this.sBass += (bass - this.sBass) * a;
    this.sMids += (mids - this.sMids) * a;
    this.sHighs += (highs - this.sHighs) * a;
    this.sLevel += (level - this.sLevel) * a;

    return {
      bass: this.sBass,
      mids: this.sMids,
      highs: this.sHighs,
      level: this.sLevel,
    };
  }

  dispose(): void {
    try {
      for (const v of this.droneVoices) {
        try {
          v.osc.stop();
        } catch {
          /* already stopped */
        }
        try {
          v.detune.stop();
        } catch {
          /* already stopped */
        }
        v.osc.disconnect();
        v.detune.disconnect();
        v.gain.disconnect();
      }
      this.droneVoices = [];
      if (this.droneGain) this.droneGain.disconnect();
      if (this.micSource) this.micSource.disconnect();
      if (this.micStream) {
        for (const track of this.micStream.getTracks()) track.stop();
      }
      this.analyser.disconnect();
      this.masterGain.disconnect();
      void this.ctx.close();
    } catch {
      /* best-effort teardown */
    }
  }
}
