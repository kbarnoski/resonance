// audio.ts — head-tracked binaural drone field for 576-presence-room.
//
// A sustained just-intonation chord of ~6 voices, each placed at a fixed point
// on a ring around the listener and fed through its own HRTF PannerNode. You
// (your face) ARE the AudioListener: every frame we move + re-orient the
// listener from head pose, so the warmth re-spatialises around wherever you
// look. Lean toward a voice → it blooms (gets nearer + louder).
//
// Signal graph:
//   per voice:  [osc + 2 low partials] → voiceGain → PannerNode(HRTF) ─┐
//                                                                       ├→ masterGain
//                                                                       │   → lowpass
//                                                                       │   → DynamicsCompressor (limiter)
//                                                                       │   → destination
//
// All level changes use multi-second setTargetAtTime so nothing snaps; the
// field breathes. The chain ALWAYS ends in a DynamicsCompressor so it can
// never clip, regardless of how many voices bloom at once.

import type { HeadPose } from "./face";

// ── Just-intonation chord over a warm low root (~A2, 110 Hz region) ──────────
// Ratios chosen for a soft, consonant, enveloping drone.
const ROOT_HZ = 110; // A2

interface VoiceDef {
  ratio: number; // frequency = ROOT_HZ * ratio
  /** Azimuth around the listener, radians (0 = front, + = right/clockwise). */
  azimuth: number;
  /** Elevation, radians (+ = up). */
  elevation: number;
  /** Base radius (metres) from listener. */
  radius: number;
  /** Resting gain for this voice. */
  level: number;
  /** GL colour for the orb (warm palette). */
  color: [number, number, number];
}

export const VOICES: VoiceDef[] = [
  { ratio: 1 / 1, azimuth: 0.0, elevation: -0.05, radius: 2.6, level: 0.5, color: [1.0, 0.55, 0.28] }, // amber, front, root
  { ratio: 9 / 8, azimuth: Math.PI * 0.66, elevation: 0.1, radius: 2.9, level: 0.32, color: [0.98, 0.42, 0.5] }, // rose
  { ratio: 5 / 4, azimuth: Math.PI * 1.15, elevation: -0.12, radius: 2.7, level: 0.34, color: [1.0, 0.72, 0.4] }, // warm gold
  { ratio: 3 / 2, azimuth: Math.PI * 1.62, elevation: 0.14, radius: 3.0, level: 0.32, color: [0.78, 0.5, 0.95] }, // violet
  { ratio: 15 / 8, azimuth: Math.PI * 0.32, elevation: 0.22, radius: 3.2, level: 0.24, color: [0.95, 0.6, 0.85] }, // pink-violet
  { ratio: 2 / 1, azimuth: Math.PI * 1.0, elevation: -0.2, radius: 2.4, level: 0.28, color: [1.0, 0.66, 0.32] }, // amber, behind
];

// ── Per-voice runtime state ────────────────────────────────────────────────────

interface VoiceNode {
  def: VoiceDef;
  panner: PannerNode;
  gain: GainNode;
  oscs: OscillatorNode[];
  /** Current bloom 0..1 (how much you're facing/leaning toward it). */
  bloom: number;
}

// ── Listener API shim ──────────────────────────────────────────────────────────
// The modern AudioParam-based listener API isn't on every browser; fall back to
// the deprecated setPosition / setOrientation.

interface ModernListener extends AudioListener {
  positionX: AudioParam;
  positionY: AudioParam;
  positionZ: AudioParam;
  forwardX: AudioParam;
  forwardY: AudioParam;
  forwardZ: AudioParam;
  upX: AudioParam;
  upY: AudioParam;
  upZ: AudioParam;
}

function hasModernListener(l: AudioListener): l is ModernListener {
  return (l as ModernListener).positionX !== undefined;
}

// ── Engine ─────────────────────────────────────────────────────────────────────

export class PresenceEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private voices: VoiceNode[] = [];
  private started = false;

  /** Per-voice bloom for the visualiser (0..1). */
  readonly bloomOut: number[] = VOICES.map(() => 0);

  get isRunning(): boolean {
    return this.started;
  }

  /** Build the graph + start all drone voices swelling in. Idempotent. */
  async start(): Promise<void> {
    if (this.started) {
      await this.ctx?.resume();
      return;
    }
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    await ctx.resume();
    this.ctx = ctx;

    // Master chain: gain → lowpass → limiter → destination.
    const master = ctx.createGain();
    master.gain.value = 0.0001; // swell up from silence

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1800; // warm, rounded top
    lowpass.Q.value = 0.4;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 12;
    limiter.ratio.value = 20; // hard-ish limit → never clips
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;

    master.connect(lowpass);
    lowpass.connect(limiter);
    limiter.connect(ctx.destination);

    this.master = master;
    this.lowpass = lowpass;
    this.limiter = limiter;

    // Build voices.
    const now = ctx.currentTime;
    for (const def of VOICES) {
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;

      const panner = ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 1;
      panner.maxDistance = 12;
      panner.rolloffFactor = 1.1;
      this.placePanner(panner, def, def.radius);

      gain.connect(panner);
      panner.connect(master);

      const oscs: OscillatorNode[] = [];
      const freq = ROOT_HZ * def.ratio;
      // Fundamental (sine), a soft triangle octave below for body, and a quiet
      // fifth partial for shimmer.
      const partials: Array<{ type: OscillatorType; mul: number; lvl: number }> = [
        { type: "sine", mul: 1, lvl: 1.0 },
        { type: "triangle", mul: 0.5, lvl: 0.35 },
        { type: "sine", mul: 2.003, lvl: 0.18 }, // slight detune → liveliness
      ];
      for (const p of partials) {
        const o = ctx.createOscillator();
        o.type = p.type;
        o.frequency.value = freq * p.mul;
        const pg = ctx.createGain();
        pg.gain.value = p.lvl;
        // gentle vibrato via slow detune drift
        o.detune.value = (Math.random() - 0.5) * 6;
        o.connect(pg);
        pg.connect(gain);
        o.start(now);
        oscs.push(o);
      }

      this.voices.push({ def, panner, gain, oscs, bloom: 0 });
    }

    // Swell everything in over several seconds (breathing onset).
    master.gain.setTargetAtTime(0.85, now, 2.5);
    this.voices.forEach((v) => {
      v.gain.gain.setTargetAtTime(v.def.level, now + 0.2, 3.0);
    });

    // Initial listener placement.
    this.applyPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, presence: 1 });

    this.started = true;
  }

  /** Drive the listener + per-voice bloom from head pose. Call every frame. */
  applyPose(pose: HeadPose): void {
    const ctx = this.ctx;
    if (!ctx || !this.started) return;
    const now = ctx.currentTime;
    const SMOOTH = 0.12; // setTargetAtTime time-constant → buttery motion.

    // --- Listener position (the body translates a little in the plane) ---
    const px = pose.x;
    const py = pose.y;
    const pz = pose.z;

    // --- Listener forward vector from yaw + pitch ---
    // yaw around Y, pitch around X. Front is −Z in WebAudio's right-handed space.
    const cy = Math.cos(pose.yaw);
    const sy = Math.sin(pose.yaw);
    const cp = Math.cos(pose.pitch);
    const sp = Math.sin(pose.pitch);
    const fx = sy * cp;
    const fy = sp;
    const fz = -cy * cp;

    const l = ctx.listener;
    if (hasModernListener(l)) {
      l.positionX.setTargetAtTime(px, now, SMOOTH);
      l.positionY.setTargetAtTime(py, now, SMOOTH);
      l.positionZ.setTargetAtTime(pz, now, SMOOTH);
      l.forwardX.setTargetAtTime(fx, now, SMOOTH);
      l.forwardY.setTargetAtTime(fy, now, SMOOTH);
      l.forwardZ.setTargetAtTime(fz, now, SMOOTH);
      l.upX.setTargetAtTime(0, now, SMOOTH);
      l.upY.setTargetAtTime(1, now, SMOOTH);
      l.upZ.setTargetAtTime(0, now, SMOOTH);
    } else {
      // Deprecated API fallback.
      l.setPosition(px, py, pz);
      l.setOrientation(fx, fy, fz, 0, 1, 0);
    }

    // --- Per-voice bloom: how much you face / lean toward each voice ---
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      const def = v.def;
      // Voice world position on the ring (static).
      const vx = Math.sin(def.azimuth) * def.radius;
      const vy = Math.sin(def.elevation) * def.radius;
      const vz = -Math.cos(def.azimuth) * def.radius;
      // Direction from listener to voice.
      const dx = vx - px;
      const dy = vy - py;
      const dz = vz - pz;
      const dlen = Math.hypot(dx, dy, dz) + 1e-4;
      // Alignment of your gaze with that direction (1 = looking straight at it).
      const dot = (dx * fx + dy * fy + dz * fz) / dlen;
      const facing = Math.max(0, dot); // 0..1
      // Proximity bloom: closer = warmer.
      const near = Math.max(0, 1 - dlen / 5);
      const bloom = Math.min(1, facing * 0.7 + near * 0.6);
      v.bloom = bloom;
      this.bloomOut[i] = bloom;

      // Pull a faced voice slightly nearer (it "leans in") and lift its level.
      const targetRadius = def.radius * (1 - facing * 0.28);
      this.placePanner(v.panner, def, targetRadius, now, SMOOTH);
      const targetGain = def.level * (1 + bloom * 0.9);
      v.gain.gain.setTargetAtTime(targetGain, now, 0.5);
    }

    // Open the lowpass a touch when you're moving into the field (forward lean).
    if (this.lowpass) {
      const lean = Math.max(0, -pz);
      this.lowpass.frequency.setTargetAtTime(1500 + lean * 1400, now, 0.6);
    }
  }

  private placePanner(
    panner: PannerNode,
    def: VoiceDef,
    radius: number,
    now?: number,
    smooth?: number,
  ): void {
    const x = Math.sin(def.azimuth) * radius;
    const y = Math.sin(def.elevation) * radius;
    const z = -Math.cos(def.azimuth) * radius;
    if (now !== undefined && smooth !== undefined && panner.positionX) {
      panner.positionX.setTargetAtTime(x, now, smooth);
      panner.positionY.setTargetAtTime(y, now, smooth);
      panner.positionZ.setTargetAtTime(z, now, smooth);
    } else if (panner.positionX) {
      panner.positionX.value = x;
      panner.positionY.value = y;
      panner.positionZ.value = z;
    } else {
      panner.setPosition(x, y, z);
    }
  }

  /** Gentle fade-out + teardown. */
  async stop(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.master?.gain.setTargetAtTime(0.0001, now, 0.5);
    this.started = false;
    await new Promise((r) => setTimeout(r, 800));
    this.voices.forEach((v) => v.oscs.forEach((o) => o.stop()));
    this.voices = [];
    await ctx.close();
    this.ctx = null;
  }
}
