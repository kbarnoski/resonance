// ─────────────────────────────────────────────────────────────────────────────
// 24600-stillpoint · audio.ts — the whole piece lives here, because the piece
// IS the sound. One of Karel's real takes is split into four perceptual VOICES
// (bass / low-mid / mid / air) and each is HRTF-panned to a fixed spot on a dome
// AROUND the listener's head. The field is WORLD-LOCKED: turning your body
// (setFacing) re-aims the AudioListener within the fixed field, so you face
// different voices; leaning (setLean) TRANSLATES the listener forward so the
// voice you face comes closer in real HRTF distance — not a volume knob.
//
// After Chen & Boren, "A real-time 6DoF HRTF binaural rendering system for
// musicians," AES Convention 159 (Oct 2025): rotational head-tracking plus a
// translational LEAN that moves the listener in distance. The lean→distance
// control here is the embodiment of that finding.
//
// 0 oscillators. 0 synthesized tones. Every voice is his piano, re-placed in
// space. Everything mixes → field gain → createSafeMaster(ctx).input, never
// ctx.destination. Full teardown stops the source and closes the context.
// ─────────────────────────────────────────────────────────────────────────────

import { loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

/** Wrap an angle to (-π, π]. */
function wrapPi(a: number): number {
  a = (((a + Math.PI) % TAU) + TAU) % TAU;
  return a - Math.PI;
}

// ── the four perceptual voices on the dome ──────────────────────────────────
// Each is a contiguous frequency register of the SAME take, parked at a fixed
// azimuth + elevation on a dome of radius ~3 m. They are spread ~90° apart so
// turning your body sweeps each one through the front over a full circle.
export interface VoiceSpec {
  id: "bass" | "lowmid" | "mid" | "air";
  label: string;
  /** base azimuth on the dome, radians (0 = straight ahead, −Z). */
  az: number;
  /** elevation on the dome, radians (+ up). */
  el: number;
  /** dome radius for this voice, metres. */
  radius: number;
  /** resting band level. */
  level: number;
}

export const VOICES: readonly VoiceSpec[] = [
  { id: "bass", label: "bass", az: (20 * Math.PI) / 180, el: (-8 * Math.PI) / 180, radius: 3.0, level: 0.95 },
  { id: "lowmid", label: "low-mid", az: (110 * Math.PI) / 180, el: (6 * Math.PI) / 180, radius: 3.0, level: 0.9 },
  { id: "mid", label: "mid", az: (200 * Math.PI) / 180, el: (15 * Math.PI) / 180, radius: 3.1, level: 0.82 },
  { id: "air", label: "air", az: (290 * Math.PI) / 180, el: (26 * Math.PI) / 180, radius: 3.4, level: 0.72 },
] as const;

const ORBIT_HZ = 0.045; // breath pace — the whole field drifts a full turn ~22s
const SWELL_HZ = 0.02; // slow global swell riding the field
const LEAN_MAX = 2.0; // metres the listener translates forward at full lean
const SMOOTH = 0.12; // setTargetAtTime time-constant for positions/gains

interface Voice {
  spec: VoiceSpec;
  gain: GainNode; // resting band level
  focusGain: GainNode; // lifts when you face this voice
  tone: BiquadFilterNode; // lowpass that opens (brighter) when faced
  panner: PannerNode; // HRTF spatializer — the instrument
  focus: number; // last computed facing focus 0..1
  relAz: number; // last azimuth relative to facing (radians)
}

/** What the page's breath-glow needs each frame. All screen-space, −1..1. */
export interface FieldSnapshot {
  /** horizontal bearing of the sound field's focus relative to your facing. */
  bearingX: number;
  /** vertical bearing of the field's focus relative to your facing. */
  bearingY: number;
  /** overall loudness 0..1 from the safe-master analyser. */
  level: number;
  /** label of the voice you are most facing. */
  dominant: string;
  /** current lean amount 0..1. */
  lean: number;
}

export class StillpointEngine {
  private ctx: AudioContext | null = null;
  private safe: SafeMaster | null = null;
  private src: AudioBufferSourceNode | null = null;
  private field: GainNode | null = null;
  private voices: Voice[] = [];
  private analyserData: Uint8Array<ArrayBuffer> | null = null;

  private clock = 0; // accumulated seconds (orbit + swell phase)
  private yaw = 0; // facing yaw, radians (world-locked)
  private pitch = 0; // facing pitch, radians
  private lean = 0; // 0..1
  private smoothLevel = 0;
  private started = false;

  /** The title of the take that actually loaded (for chrome). */
  public title = "";

  get audioCtx(): AudioContext | null {
    return this.ctx;
  }
  get isRunning(): boolean {
    return this.started;
  }

  /** Boot the context, load ONE real take, build the dome. Throws on decode
   *  failure so the page can show a designed notice (never a synth fallback). */
  async start(trackId?: string): Promise<void> {
    if (this.started) return;

    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio is unavailable in this browser.");

    const ctx = new Ctor();
    this.ctx = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    const safe = createSafeMaster(ctx, { gain: 0.82 });
    this.safe = safe;
    this.analyserData = new Uint8Array(safe.analyser.frequencyBinCount);

    // ── the whole field mixes through here, with a slow master swell ────────
    const fieldGain = ctx.createGain();
    fieldGain.gain.value = 0.5;
    fieldGain.connect(safe.input);
    this.field = fieldGain;

    // ── ONE real take (throws on failure → caller surfaces a designed notice)
    const { buffer, title } = await loadRealTrackBuffer(ctx, trackId);
    this.title = title;
    if (!this.ctx) return; // torn down mid-load

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    this.src = source;

    // ── listener at origin, facing −Z, world-locked ─────────────────────────
    this.applyListener(0);

    // ── build the four voices: source fans out into contiguous registers ────
    for (const spec of VOICES) {
      this.voices.push(this.makeVoice(ctx, spec, source, fieldGain));
    }

    source.start();
    this.started = true;
  }

  private makeVoice(
    ctx: AudioContext,
    spec: VoiceSpec,
    source: AudioBufferSourceNode,
    field: GainNode,
  ): Voice {
    // Contiguous registers: bass < 220 < low-mid < 760 < mid < 2600 < air.
    const filters: BiquadFilterNode[] = [];
    const band = (type: BiquadFilterType, hz: number) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = hz;
      f.Q.value = 0.707;
      filters.push(f);
      return f;
    };
    if (spec.id === "bass") {
      band("lowpass", 220);
    } else if (spec.id === "lowmid") {
      band("highpass", 220);
      band("lowpass", 760);
    } else if (spec.id === "mid") {
      band("highpass", 760);
      band("lowpass", 2600);
    } else {
      band("highpass", 2600);
    }

    const gain = ctx.createGain();
    gain.gain.value = spec.level;

    const focusGain = ctx.createGain();
    focusGain.gain.value = 0.7;

    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2000;
    tone.Q.value = 0.5;

    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1.2;
    panner.maxDistance = 20;
    panner.rolloffFactor = 1.0;

    // source → [band filters…] → gain → focusGain → tone → panner → field
    source.connect(filters[0]);
    for (let i = 0; i < filters.length - 1; i++) {
      filters[i].connect(filters[i + 1]);
    }
    filters[filters.length - 1].connect(gain);
    gain.connect(focusGain);
    focusGain.connect(tone);
    tone.connect(panner);
    panner.connect(field);

    const v: Voice = { spec, gain, focusGain, tone, panner, focus: 0, relAz: spec.az };
    // seed its resting dome position
    this.placeVoice(v, 0, true);
    return v;
  }

  /** Re-aim the AudioListener from yaw/pitch, and translate it forward by lean
   *  so the faced voice comes closer in real distance (6DoF). */
  private applyListener(dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;

    const cp = Math.cos(this.pitch);
    const fx = Math.sin(this.yaw) * cp;
    const fy = Math.sin(this.pitch);
    const fz = -Math.cos(this.yaw) * cp;

    const d = this.lean * LEAN_MAX; // translate toward whatever you face
    const px = fx * d;
    const py = fy * d;
    const pz = fz * d;

    const lis = ctx.listener;
    const tc = dt > 0 ? SMOOTH : 0.001;
    if (lis.forwardX) {
      lis.forwardX.setTargetAtTime(fx, t, tc);
      lis.forwardY.setTargetAtTime(fy, t, tc);
      lis.forwardZ.setTargetAtTime(fz, t, tc);
      lis.upX.setTargetAtTime(0, t, tc);
      lis.upY.setTargetAtTime(1, t, tc);
      lis.upZ.setTargetAtTime(0, t, tc);
      lis.positionX.setTargetAtTime(px, t, tc);
      lis.positionY.setTargetAtTime(py, t, tc);
      lis.positionZ.setTargetAtTime(pz, t, tc);
    } else {
      // Deprecated Safari fallback.
      const l = lis as unknown as {
        setPosition(x: number, y: number, z: number): void;
        setOrientation(
          fx: number,
          fy: number,
          fz: number,
          ux: number,
          uy: number,
          uz: number,
        ): void;
      };
      l.setOrientation(fx, fy, fz, 0, 1, 0);
      l.setPosition(px, py, pz);
    }
  }

  /** Move one voice to its (orbiting) dome spot. */
  private placeVoice(v: Voice, dt: number, seed = false): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const orbit = this.clock * TAU * ORBIT_HZ;
    const az = v.spec.az + orbit;
    // a gentle elevation bob so the field feels alive even when idle
    const el = v.spec.el + Math.sin(this.clock * TAU * 0.03 + v.spec.az) * 0.06;
    const ce = Math.cos(el);
    const r = v.spec.radius;
    const x = Math.sin(az) * ce * r;
    const y = Math.sin(el) * r;
    const z = -Math.cos(az) * ce * r;
    const tc = seed ? 0.001 : SMOOTH;
    if (v.panner.positionX) {
      v.panner.positionX.setTargetAtTime(x, t, tc);
      v.panner.positionY.setTargetAtTime(y, t, tc);
      v.panner.positionZ.setTargetAtTime(z, t, tc);
    } else {
      (
        v.panner as unknown as {
          setPosition(x: number, y: number, z: number): void;
        }
      ).setPosition(x, y, z);
    }
    v.relAz = wrapPi(az - this.yaw);
  }

  // ── control inputs — every INPUT path writes the SAME facing+lean state ───
  /** yaw: turn your body (world-locked). pitch: look up/down. radians. */
  setFacing(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = clamp(pitch, -0.9, 0.9);
  }
  /** 0..1 — lean toward the faced voice to pull it closer in distance. */
  setLean(amount: number): void {
    this.lean = clamp(amount, 0, 1);
  }
  /** Gentle master swell trim 0..1 (the page can hint louder/softer). */
  setGain(v: number): void {
    this.safe?.setGain(v);
  }

  /** Advance orbit + swell, re-aim the listener, re-place + re-focus voices.
   *  Call once per animation frame with the frame delta in seconds. */
  update(dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.started || !this.field) return;
    this.clock += dt;
    const t = ctx.currentTime;

    this.applyListener(dt);

    // slow global swell rides the whole field
    const swell = 0.5 + 0.12 * Math.sin(this.clock * TAU * SWELL_HZ);
    this.field.gain.setTargetAtTime(swell, t, 0.4);

    for (const v of this.voices) {
      this.placeVoice(v, dt);
      // facing focus: cosine lobe, 1 when the voice is dead ahead
      const focus = Math.pow(0.5 * (1 + Math.cos(v.relAz)), 1.4);
      v.focus = focus;
      // the voice you face comes forward (louder) and brighter in timbre
      v.focusGain.gain.setTargetAtTime(0.5 + focus * 0.95, t, SMOOTH);
      const cut = 500 * Math.pow(14000 / 500, focus);
      v.tone.frequency.setTargetAtTime(clamp(cut, 400, 14000), t, SMOOTH);
    }
  }

  /** Read the field for the breath-glow: the focus-weighted bearing of the
   *  sound relative to your facing, plus overall loudness. */
  snapshot(): FieldSnapshot {
    let wx = 0;
    let wy = 0;
    let wsum = 0;
    let best = -1;
    let dominant = "";
    for (const v of this.voices) {
      const w = v.focus * v.focus + 0.02;
      wx += Math.sin(v.relAz) * w;
      // vertical: voice elevation minus where you're looking
      wy += (Math.sin(v.spec.el) - Math.sin(this.pitch)) * w;
      wsum += w;
      if (v.focus > best) {
        best = v.focus;
        dominant = v.spec.label;
      }
    }
    const bearingX = wsum > 0 ? clamp(wx / wsum, -1, 1) : 0;
    const bearingY = wsum > 0 ? clamp(wy / wsum, -1, 1) : 0;

    // overall loudness from the safe-master analyser (RMS of time domain)
    let level = 0;
    const a = this.safe?.analyser;
    const data = this.analyserData;
    if (a && data) {
      a.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const s = (data[i] - 128) / 128;
        sum += s * s;
      }
      level = Math.sqrt(sum / data.length);
    }
    this.smoothLevel += (level - this.smoothLevel) * 0.2;

    return {
      bearingX,
      bearingY,
      level: clamp(this.smoothLevel * 3.2, 0, 1),
      dominant,
      lean: this.lean,
    };
  }

  /** Full teardown: stop the source, detach the master, close the context. */
  async stop(): Promise<void> {
    const ctx = this.ctx;
    this.started = false;
    try {
      if (this.field && ctx) {
        const t = ctx.currentTime;
        this.field.gain.cancelScheduledValues(t);
        this.field.gain.setValueAtTime(this.field.gain.value, t);
        this.field.gain.linearRampToValueAtTime(0.0001, t + 0.35);
      }
      try {
        this.src?.stop((ctx?.currentTime ?? 0) + 0.4);
      } catch {
        /* already stopped */
      }
      await new Promise((r) => setTimeout(r, 380));
      try {
        this.safe?.disconnect();
      } catch {
        /* closing */
      }
      if (ctx) await ctx.close();
    } catch {
      /* best-effort teardown */
    } finally {
      this.ctx = null;
      this.safe = null;
      this.src = null;
      this.field = null;
      this.voices = [];
      this.analyserData = null;
    }
  }
}
