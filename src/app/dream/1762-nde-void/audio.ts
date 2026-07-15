// ─────────────────────────────────────────────────────────────────────────────
// 1762-nde-void · audio.ts — HRTF spatial engine welded to the SAME geometry
//
//   One PannerNode per structure (panningModel:"HRTF", distanceModel:"inverse").
//   Every frame each panner's position is written from scene.ts's camera-relative
//   coordinates — the identical numbers the shader marches — and the AudioListener
//   forward/up is set from the gaze basis. So the moment a structure sweeps from
//   in-front, across your head, to behind, its bell-tone relocates in the HRTF
//   field to match exactly where its glow now is. Sight and sound cannot drift
//   apart because there is only one geometry.
//
//   Each structure sings a COLD, INHARMONIC bell: partials at off-integer ratios
//   (Risset 1.0 / 2.76 / 5.40) with tiny detune, so nothing lands on clean just
//   intonation — it shimmers and beats instead of droning sweetly. A near-silent
//   sub underpins the void; createVoidReverb() supplies the cavern tail. The
//   master ends in a DynamicsCompressor → low gain (≤0.14) → destination so it
//   never clips. Best on headphones (HRTF); on speakers it collapses to stereo,
//   which is still audibly directional.
//
//   Deterministic: all envelopes/strikes come from the integer frame counter.
//   No Math.random / Date.now / performance.now anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { createVoidReverb } from "../_shared/psych/convolutionVoid";
import { STRUCTURES } from "./scene";
import type { RelStruct } from "./scene";

const BELL_RATIOS = [1.0, 2.76, 5.4]; // inharmonic bell partials (Risset)
const BELL_DETUNE = [1.0, 1.006, 0.9925]; // tiny detune → shimmer/beat
const PARTIAL_GAIN = [1.0, 0.5, 0.28]; // upper partials quieter (cold, hollow)

interface Voice {
  oscs: OscillatorNode[];
  voiceGain: GainNode;
  panner: PannerNode;
  env: number;
  nextStrike: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export class VoidAudio {
  private ctx: AudioContext;
  private voices: Voice[] = [];
  private bus: GainNode;
  private masterGain: GainNode;
  private reverb: ReturnType<typeof createVoidReverb>;
  private sub: OscillatorNode | null = null;
  private subGain: GainNode;
  private started = false;
  private muted = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    // ── master chain: bus → compressor → low gain → destination ──────────────
    this.bus = ctx.createGain();
    this.bus.gain.value = 1.0;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 24;
    comp.ratio.value = 6;
    comp.attack.value = 0.006;
    comp.release.value = 0.28;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.0; // faded up on start

    this.bus.connect(comp);
    comp.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);

    // ── cavern reverb (wet-heavy void tail) ──────────────────────────────────
    this.reverb = createVoidReverb(ctx, { seconds: 6, decay: 2.4, wet: 0.72 });
    this.reverb.output.connect(this.bus);

    // ── listener at origin; orientation is written each frame from the gaze ──
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = 0;
      L.positionY.value = 0;
      L.positionZ.value = 0;
      L.forwardX.value = 0;
      L.forwardY.value = 0;
      L.forwardZ.value = -1;
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      // deprecated API fallback
      L.setPosition?.(0, 0, 0);
      L.setOrientation?.(0, 0, -1, 0, 1, 0);
    }

    // ── one HRTF panner + inharmonic bell voice per structure ────────────────
    for (let i = 0; i < STRUCTURES.length; i++) {
      const s = STRUCTURES[i];
      const panner = ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 6;
      panner.maxDistance = 130;
      panner.rolloffFactor = 1.1;
      panner.coneInnerAngle = 360;
      panner.coneOuterAngle = 360;

      const voiceGain = ctx.createGain();
      voiceGain.gain.value = 0.0001;

      const oscs: OscillatorNode[] = [];
      for (let p = 0; p < BELL_RATIOS.length; p++) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = s.freq * BELL_RATIOS[p] * BELL_DETUNE[p];
        const pg = ctx.createGain();
        pg.gain.value = PARTIAL_GAIN[p];
        osc.connect(pg);
        pg.connect(voiceGain);
        oscs.push(osc);
      }

      voiceGain.connect(panner);
      panner.connect(this.bus); // dry (directional) path
      panner.connect(this.reverb.input); // wet cavern path

      this.voices.push({
        oscs,
        voiceGain,
        panner,
        env: 0,
        nextStrike: i * 17 + 24, // staggered first strikes
      });
    }

    // ── dark, near-silent sub — the pressure of the void ─────────────────────
    this.sub = ctx.createOscillator();
    this.sub.type = "sine";
    this.sub.frequency.value = 36;
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0.0001;
    this.sub.connect(this.subGain);
    this.subGain.connect(this.bus);
  }

  start() {
    if (this.started) return;
    this.started = true;
    const now = this.ctx.currentTime;
    for (const v of this.voices) for (const o of v.oscs) o.start();
    this.sub?.start();
    // slow fade-in so the void opens, never a click
    this.masterGain.gain.setValueAtTime(0.0001, now);
    this.masterGain.gain.linearRampToValueAtTime(this.muted ? 0.0001 : 0.14, now + 2.2);
    this.subGain.gain.setTargetAtTime(0.05, now, 1.5);
  }

  setMuted(m: boolean) {
    this.muted = m;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(m ? 0.0001 : 0.14, now, 0.15);
  }

  /**
   * Per-frame drive. rel = the SHARED geometry from scene.ts (same as shader).
   * fwd/up = the gaze basis (same rotation the shader uses for ray direction).
   */
  update(frame: number, rel: RelStruct[], fwd: Vec3, up: Vec3) {
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // ── listener orientation = the gaze (welds ears to the marched scene) ────
    const L = ctx.listener;
    if (L.forwardX) {
      L.forwardX.setTargetAtTime(fwd.x, t, 0.08);
      L.forwardY.setTargetAtTime(fwd.y, t, 0.08);
      L.forwardZ.setTargetAtTime(fwd.z, t, 0.08);
      L.upX.setTargetAtTime(up.x, t, 0.08);
      L.upY.setTargetAtTime(up.y, t, 0.08);
      L.upZ.setTargetAtTime(up.z, t, 0.08);
    } else {
      L.setOrientation?.(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }

    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      const r = rel[i];

      // panner position = camera-relative world coords (identical to shader)
      if (v.panner.positionX) {
        v.panner.positionX.setTargetAtTime(r.rx, t, 0.05);
        v.panner.positionY.setTargetAtTime(r.ry, t, 0.05);
        v.panner.positionZ.setTargetAtTime(r.rz, t, 0.05);
      } else {
        v.panner.setPosition?.(r.rx, r.ry, r.rz);
      }

      // deterministic bell strikes; denser as a structure passes close
      if (frame >= v.nextStrike) {
        v.env = 1.0;
        const prox = Math.max(0, Math.min(1, 1 - r.dist / 120));
        const period = Math.round(170 - 95 * prox); // ~75..170 frames
        v.nextStrike = frame + Math.max(60, period);
      }
      v.env *= 0.986; // long cold decay tail

      // gain shaped by strike envelope; distance handled by the inverse model
      const g = Math.max(0.0001, v.env * 0.9);
      v.voiceGain.gain.setTargetAtTime(g, t, 0.02);
    }

    // sub breathes very slowly (well under 0.3 Hz), stays near-silent
    if (this.sub) {
      const drift = 36 + 2.5 * Math.sin((frame / 60) * 0.05 * Math.PI * 2);
      this.sub.frequency.setTargetAtTime(drift, t, 0.4);
    }
  }

  stop() {
    const now = this.ctx.currentTime;
    try {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(0.0001, now, 0.1);
    } catch {
      /* noop */
    }
    // stop oscillators shortly after the fade so there is no tail click
    const stopAt = now + 0.4;
    for (const v of this.voices) {
      for (const o of v.oscs) {
        try {
          o.stop(stopAt);
        } catch {
          /* already stopped */
        }
      }
    }
    try {
      this.sub?.stop(stopAt);
    } catch {
      /* noop */
    }
  }
}
