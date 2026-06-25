// PhISEM-style stochastic shaker synthesis + warm drone + groove-loop capture.
//
// Reference: Perry Cook, "Physically Informed Stochastic Event Modeling
// (PhISEM)", ICMC/CMJ 1997 — model a shaker as N virtual beans in a gourd.
// A per-frame collision probability rises with shake energy; each collision is
// a short resonant-filtered noise burst. Summed, they make the rattle. We map
// shake energy to collision RATE and resonance BRIGHTNESS, never to loudness.

export interface ShakeVoice {
  name: string;
  // resonant "shell" center frequency at rest and at max energy (Hz)
  baseFreq: number;
  brightFreq: number;
  // bandpass Q
  q: number;
  // grain amplitude decay time constant (seconds)
  decay: number;
  // overall voice gain (kept low — kids-safe)
  gain: number;
}

// A small band of 3 shakers + a low stomp on hard onsets.
export const VOICES: ShakeVoice[] = [
  { name: "maraca", baseFreq: 2600, brightFreq: 5200, q: 7, decay: 0.011, gain: 0.5 },
  { name: "cabasa", baseFreq: 1700, brightFreq: 3400, q: 5, decay: 0.018, gain: 0.42 },
  { name: "shaker", baseFreq: 3600, brightFreq: 6000, q: 9, decay: 0.008, gain: 0.4 },
];

// Pre-rendered short white-noise buffer reused for every grain.
function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.06);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export interface GrainEvent {
  voice: number; // index into VOICES
  energy: number; // 0..1 at trigger time
}

// A captured groove loop: a sequence of {time, energy} envelope samples.
export interface Loop {
  // time (s, relative to loop start) -> energy 0..1
  times: Float32Array;
  energies: Float32Array;
  duration: number;
  // playback bookkeeping
  startedAt: number;
  // visual: per-voice color tint index assigned at capture
  hue: number;
}

export class ShakeEngine {
  ctx: AudioContext;
  master: GainNode;
  lowpass: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  noiseBuf: AudioBuffer;

  // drone
  droneGain: GainNode;
  droneOscs: OscillatorNode[] = [];
  droneLFO: OscillatorNode | null = null;

  // shake state
  energy = 0; // smoothed 0..1
  // PhISEM running "sound level" decays each frame, bumped by energy
  private soundLevel = 0;

  // loop capture
  private capTimes: number[] = [];
  private capEnergies: number[] = [];
  loops: Loop[] = [];
  maxLoops = 3;

  // callback so visuals can react to grains
  onGrain: ((g: GrainEvent) => void) | null = null;

  private running = false;
  private lastFrame = 0;

  constructor() {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctx();

    // ── kids-safe master chain: gain ceiling → lowpass ~6k → soft compressor
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;

    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 6000;
    this.lowpass.Q.value = 0.4;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -22;
    this.comp.knee.value = 28;
    this.comp.ratio.value = 12;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.2;

    this.master.connect(this.lowpass);
    this.lowpass.connect(this.comp);
    this.comp.connect(this.ctx.destination);

    this.noiseBuf = makeNoiseBuffer(this.ctx);

    // ── always-on warm drone pad ───────────────────────────────────────────
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.16;
    this.droneGain.connect(this.master);

    // soft low chord: root + fifth + octave, sine/triangle bed
    const roots = [65.41, 98.0, 130.81]; // C2, G2, C3
    const types: OscillatorType[] = ["sine", "triangle", "sine"];
    roots.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = types[i];
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.32;
      o.connect(g);
      g.connect(this.droneGain);
      o.start();
      this.droneOscs.push(o);
    });

    // gentle movement: slow LFO wobbling drone gain a touch
    this.droneLFO = this.ctx.createOscillator();
    this.droneLFO.type = "sine";
    this.droneLFO.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.05;
    this.droneLFO.connect(lfoGain);
    lfoGain.connect(this.droneGain.gain);
    this.droneLFO.start();
  }

  resume() {
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  // Feed smoothed shake energy (0..1) from input layer each animation frame.
  setEnergy(e: number) {
    this.energy = Math.max(0, Math.min(1, e));
  }

  // ── one PhISEM grain: filtered-noise burst at a resonant shell freq ───────
  private triggerGrain(voiceIdx: number, energy: number, when: number) {
    const v = VOICES[voiceIdx];
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    // random start offset into the noise buffer for variety
    const off = Math.random() * 0.04;

    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    // brightness tracks energy
    const f = v.baseFreq + (v.brightFreq - v.baseFreq) * energy;
    // tiny per-grain jitter so the rattle isn't sterile
    bp.frequency.value = f * (0.92 + Math.random() * 0.16);
    bp.Q.value = v.q;

    const g = this.ctx.createGain();
    // amplitude per grain rises only slightly with energy (density carries it)
    const amp = v.gain * (0.35 + 0.4 * energy);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(amp, when + 0.0008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + v.decay);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(when, off, v.decay + 0.01);
    src.stop(when + v.decay + 0.02);

    if (this.onGrain) this.onGrain({ voice: voiceIdx, energy });
  }

  // ── low stomp thud on a very hard onset ──────────────────────────────────
  private triggerStomp(when: number, energy: number) {
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(120, when);
    o.frequency.exponentialRampToValueAtTime(48, when + 0.16);
    const g = this.ctx.createGain();
    const amp = 0.28 * (0.6 + 0.4 * energy);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(amp, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    o.connect(g);
    g.connect(this.master);
    o.start(when);
    o.stop(when + 0.26);
  }

  // ── PhISEM stochastic process driven from energy, per frame ───────────────
  // Returns nothing; schedules grains in real time.
  private prevEnergy = 0;
  private stompCooldown = 0;

  private phisem(dt: number) {
    const now = this.ctx.currentTime;
    const e = this.energy;

    // running sound level (system "shake-shake" reservoir) — bumped by motion,
    // decays exponentially. This is the energy stored from shaking.
    const decayFactor = Math.exp(-dt / 0.09);
    this.soundLevel = this.soundLevel * decayFactor + e * dt * 9;
    this.soundLevel = Math.min(this.soundLevel, 1.6);

    // collision probability rises with stored sound level.
    // expected collisions this frame ~ rate * dt.
    const baseRate = 22; // collisions/sec at full reservoir per voice
    const rate = baseRate * this.soundLevel;
    const eEff = Math.min(1, this.soundLevel * 0.85);

    for (let vi = 0; vi < VOICES.length; vi++) {
      // each voice slightly detuned in rate so the band isn't locked
      const vr = rate * (0.8 + vi * 0.18);
      let expected = vr * dt;
      // emit grains via Poisson-ish sampling spread across the frame
      while (expected > 0) {
        if (Math.random() < expected) {
          const when = now + Math.random() * dt;
          this.triggerGrain(vi, eEff * (0.85 + Math.random() * 0.3), when);
        }
        expected -= 1;
      }
    }

    // hard onset → stomp
    this.stompCooldown -= dt;
    const jerk = e - this.prevEnergy;
    if (e > 0.62 && jerk > 0.12 && this.stompCooldown <= 0) {
      this.triggerStomp(now + 0.005, e);
      this.stompCooldown = 0.18;
    }
    this.prevEnergy = e;
  }

  // ── groove loop capture ──────────────────────────────────────────────────
  // Continuously sample the energy envelope. When the child pauses, freeze a
  // ~3.2s window into a Loop the critters keep playing back.
  private idleTime = 0;

  private captureTick(dt: number) {
    // sample envelope at ~60Hz into the rolling capture buffer
    this.capTimes.push(this.ctx.currentTime);
    this.capEnergies.push(this.energy);
    // keep only last ~3.2s
    const cutoff = this.ctx.currentTime - 3.2;
    while (this.capTimes.length > 2 && this.capTimes[0] < cutoff) {
      this.capTimes.shift();
      this.capEnergies.shift();
    }

    // detect "was shaking, now paused" → commit a loop
    if (this.energy > 0.18) {
      this.idleTime = 0;
      this.everShook = true;
    } else {
      this.idleTime += dt;
      if (
        this.everShook &&
        this.idleTime > 0.45 &&
        this.idleTime - dt <= 0.45 &&
        this.peakInWindow() > 0.3
      ) {
        this.commitLoop();
      }
    }
  }

  everShook = false;

  private peakInWindow(): number {
    let p = 0;
    for (let i = 0; i < this.capEnergies.length; i++)
      if (this.capEnergies[i] > p) p = this.capEnergies[i];
    return p;
  }

  private commitLoop() {
    if (this.capTimes.length < 8) return;
    const t0 = this.capTimes[0];
    const times = new Float32Array(this.capTimes.length);
    const energies = new Float32Array(this.capEnergies.length);
    for (let i = 0; i < this.capTimes.length; i++) {
      times[i] = this.capTimes[i] - t0;
      energies[i] = this.capEnergies[i];
    }
    const duration = Math.max(1.2, times[times.length - 1] + 0.25);
    const loop: Loop = {
      times,
      energies,
      duration,
      startedAt: this.ctx.currentTime,
      hue: Math.floor(Math.random() * 360),
    };
    this.loops.push(loop);
    if (this.loops.length > this.maxLoops) this.loops.shift();
    if (this.onLoopAdded) this.onLoopAdded(this.loops.length);
  }

  onLoopAdded: ((count: number) => void) | null = null;

  // playback level of all loops summed (for visuals), updated each frame
  loopEnergy = 0;

  private playLoops(dt: number) {
    const now = this.ctx.currentTime;
    let totalE = 0;
    for (const loop of this.loops) {
      const elapsed = (now - loop.startedAt) % loop.duration;
      // advance cursor; emit grains for envelope samples crossed since last frame
      const prev = (elapsed - dt + loop.duration) % loop.duration;
      // find samples whose time is within (prev, elapsed]
      for (let i = 0; i < loop.times.length; i++) {
        const t = loop.times[i];
        const crossed =
          prev <= elapsed
            ? t > prev && t <= elapsed
            : t > prev || t <= elapsed;
        if (crossed) {
          const e = loop.energies[i];
          if (e > 0.12 && Math.random() < e * 0.9) {
            const vi = Math.floor(Math.random() * VOICES.length);
            this.triggerGrain(vi, e * 0.8, now + 0.004);
          }
          totalE = Math.max(totalE, e);
        }
      }
    }
    this.loopEnergy = totalE;
  }

  clearLoops() {
    this.loops = [];
    this.everShook = false;
  }

  // ── main scheduler frame ─────────────────────────────────────────────────
  frame(timeMs: number) {
    if (!this.running) return;
    if (this.lastFrame === 0) this.lastFrame = timeMs;
    let dt = (timeMs - this.lastFrame) / 1000;
    this.lastFrame = timeMs;
    // clamp dt (tab switches etc.)
    dt = Math.max(0.001, Math.min(0.05, dt));

    this.phisem(dt);
    this.captureTick(dt);
    this.playLoops(dt);
  }

  start() {
    this.running = true;
    this.lastFrame = 0;
  }

  dispose() {
    this.running = false;
    this.onGrain = null;
    this.onLoopAdded = null;
    try {
      this.droneOscs.forEach((o) => o.stop());
      this.droneLFO?.stop();
    } catch {
      /* already stopped */
    }
    try {
      void this.ctx.close();
    } catch {
      /* noop */
    }
  }
}
