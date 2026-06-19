// audio.ts — Inkblot Bloom sound engine.
//
// Everything is gentle and consonant. Bloom events ring soft additive bells in
// a pentatonic scale; an always-on drone pad keeps the piece alive; the mic is
// analysis-only (RMS energy + a cheap pitch estimate) and is NEVER connected to
// the destination. A scripted "ghost hum" takes over hands-free when the mic is
// denied or idle so a silent glance still blooms and sings.
//
// Signal chain (safe-sounds): voices/drone -> master gain (<=0.3) ->
//   lowpass (<=7.5kHz) -> DynamicsCompressor(-10, 20:1) -> destination.

// C major pentatonic spread across a few octaves (no "wrong" note exists).
// C3 D3 E3 G3 A3 C4 D4 E4 G4 A4 C5 D5 E5 G5
const PENTATONIC_HZ = [
  130.81, 146.83, 164.81, 196.0, 220.0, 261.63, 293.66, 329.63, 392.0, 440.0,
  523.25, 587.33, 659.25, 783.99,
];

export interface BloomEvent {
  /** 0..1 — normalized radius of the bloom from centre (0 = centre). */
  radius: number;
  /** 0..1 — strength/brightness of this bloom (front speed). */
  strength: number;
}

export class InkAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private lp: BiquadFilterNode;
  private comp: DynamicsCompressorNode;

  // Drone pad nodes (kept so we can fade them on teardown).
  private droneGain: GainNode;
  private droneOscs: OscillatorNode[] = [];

  // Per-pitch-index refractory so an avalanche never machine-guns one note.
  private lastVoiceAt: number[] = [];
  // Global voice budget so a huge avalanche can't get loud.
  private lastAnyVoiceAt = 0;

  // Mic analysis (never routed to output).
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private timeBuf: Float32Array<ArrayBuffer> | null = null;

  // "Lift" from mic pitch — raises chosen scale degrees. 0..1.
  private pitchLift = 0;

  constructor() {
    const Ctx: typeof AudioContext =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctx();

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 20;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.25;

    this.lp = this.ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.frequency.value = 7000; // <= 7.5kHz, soft top end
    this.lp.Q.value = 0.4;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0; // fade in on start

    this.master.connect(this.lp);
    this.lp.connect(this.comp);
    this.comp.connect(this.ctx.destination);

    // Always-on drone pad: C2 + G2 + a faint C3, slightly detuned for warmth.
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.0;
    this.droneGain.connect(this.master);
    const droneFreqs = [65.41, 98.0, 130.81];
    for (let i = 0; i < droneFreqs.length; i++) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = droneFreqs[i];
      o.detune.value = (i - 1) * 4;
      const g = this.ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.28;
      o.connect(g);
      g.connect(this.droneGain);
      o.start();
      this.droneOscs.push(o);
    }

    this.lastVoiceAt = new Array(PENTATONIC_HZ.length).fill(0);
  }

  /** Resume context + fade master/drone in. Call from the Start gesture. */
  async start() {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.26, now + 1.2);
    this.droneGain.gain.setValueAtTime(0.0, now);
    this.droneGain.gain.linearRampToValueAtTime(0.09, now + 3.0);
  }

  /** Open the mic for analysis only. Returns true on success. Created inside the
   *  Start tap so iOS is happy. The analyser is never connected to destination. */
  async openMic(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      this.micStream = stream;
      const source = this.ctx.createMediaStreamSource(stream);
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      // NOTE: analyser is NOT connected to destination — analysis only.
      this.analyser = analyser;
      this.timeBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      return true;
    } catch {
      return false;
    }
  }

  /** Read the mic: { rms (breath energy 0..1), pitch (Hz, 0 if none) }.
   *  Returns null when no mic is open. */
  readMic(): { rms: number; pitch: number } | null {
    const analyser = this.analyser;
    const buf = this.timeBuf;
    if (!analyser || !buf) return null;
    analyser.getFloatTimeDomainData(buf);

    // RMS energy.
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.min(1, Math.sqrt(sum / buf.length) * 6);

    // Cheap pitch via zero-crossing rate over the windowed buffer. Robust enough
    // for "is the hum higher or lower" — we only use it to lift blooms.
    let crossings = 0;
    for (let i = 1; i < buf.length; i++) {
      if (buf[i - 1] <= 0 && buf[i] > 0) crossings++;
    }
    const sr = this.ctx.sampleRate;
    const freq = (crossings * sr) / buf.length;
    // Only trust it inside a hum-ish band and when there's energy.
    const pitch = rms > 0.06 && freq > 80 && freq < 900 ? freq : 0;

    // Track pitch lift smoothly (80Hz..600Hz -> 0..1).
    if (pitch > 0) {
      const target = Math.max(0, Math.min(1, (pitch - 110) / 400));
      this.pitchLift += (target - this.pitchLift) * 0.08;
    } else {
      this.pitchLift += (0 - this.pitchLift) * 0.02;
    }

    return { rms, pitch };
  }

  /** Current smoothed pitch-lift 0..1 (higher hum = higher blooms). */
  get lift() {
    return this.pitchLift;
  }

  /** Ring one soft bell for a bloom. Pitch from radius+lift; gentle envelope.
   *  Per-note and global refractory keep avalanches calm. */
  ringBloom(ev: BloomEvent) {
    const now = this.ctx.currentTime;
    const nowMs = now * 1000;
    // Global throttle: at most ~one new voice per 70ms.
    if (nowMs - this.lastAnyVoiceAt < 70) return;

    // Map radius -> a scale degree; outer blooms ring higher. Pitch lift from the
    // hum nudges the selection up so a higher voice lifts the chord.
    const n = PENTATONIC_HZ.length;
    const liftIdx = this.pitchLift * (n * 0.45);
    let idx = Math.round(ev.radius * (n - 1) * 0.85 + liftIdx);
    idx = Math.max(0, Math.min(n - 1, idx));

    // Per-note refractory (350ms) so the same bell can't stutter.
    if (nowMs - this.lastVoiceAt[idx] < 350) return;
    this.lastVoiceAt[idx] = nowMs;
    this.lastAnyVoiceAt = nowMs;

    const freq = PENTATONIC_HZ[idx];
    const peak = 0.05 + ev.strength * 0.09; // never loud
    this.playBell(freq, peak, now);

    // Occasionally add a soft fifth above for a chord-y shimmer on stronger blooms.
    if (ev.strength > 0.6 && Math.random() < 0.4) {
      this.playBell(freq * 1.5, peak * 0.4, now + 0.02);
    }
  }

  /** Additive triangle-ish bell: fundamental + a faint octave partial, with a
   *  slow rounded attack and a long soft tail. */
  private playBell(freq: number, peak: number, when: number) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 2.4);
    g.connect(this.master);

    const o1 = this.ctx.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = freq;
    o1.connect(g);
    o1.start(when);
    o1.stop(when + 2.5);

    // Faint octave partial for bell sparkle.
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.0001, when);
    og.gain.exponentialRampToValueAtTime(peak * 0.3, when + 0.03);
    og.gain.exponentialRampToValueAtTime(0.0001, when + 1.2);
    og.connect(this.master);
    const o2 = this.ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq * 2;
    o2.connect(og);
    o2.start(when);
    o2.stop(when + 1.3);
  }

  /** Stop all sound and free the mic + context. */
  async destroy() {
    try {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.linearRampToValueAtTime(0.0001, now + 0.2);
    } catch {
      /* ignore */
    }
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.analyser = null;
    this.timeBuf = null;
    for (const o of this.droneOscs) {
      try {
        o.stop();
      } catch {
        /* ignore */
      }
    }
    this.droneOscs = [];
    // Give the fade a moment, then close.
    await new Promise((r) => setTimeout(r, 240));
    try {
      await this.ctx.close();
    } catch {
      /* ignore */
    }
  }
}
