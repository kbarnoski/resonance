// 1818-bigroom — audio engine
//
// A long-form, STATEFUL EDM build-and-drop journey engine. It runs a full
// multi-minute arrangement through a sample-accurate look-ahead sequencer and
// maintains a continuous energy/tension curve that drives the DSP (lead filter
// cutoff, sidechain-pump depth, riser pitch, layer add/drop).
//
// Structure follows the EDMFormer section taxonomy (arXiv:2603.08759):
//   intro -> buildup -> drop -> breakdown -> build2 -> drop2 -> outro
// where sections are defined by changes in ENERGY, RHYTHM and TIMBRE rather
// than harmony or lyrics. See README.md for the citation and the model.

export type SectionKind =
  | "intro"
  | "buildup"
  | "drop"
  | "breakdown"
  | "outro";

export interface Section {
  name: string;
  kind: SectionKind;
  bars: number; // mutable — "Drop now" shortens a live buildup
  e0: number; // energy at section start
  e1: number; // energy at section end
  hue: number; // for the structure ribbon (violet family)
}

export interface Snapshot {
  running: boolean;
  finished: boolean;
  sectionIndex: number;
  sectionName: string;
  sectionKind: SectionKind;
  energy: number; // nudged energy actually driving DSP, 0..1
  baseEnergy: number; // curve-only energy (no intensity nudge)
  playhead: number; // 0..1 across the whole arrangement
  beatPhase: number; // 0..1 within the current beat
  pumpPunch: number; // 0..1 sidechain visual punch, spikes on each kick
  bloom: number; // 0..1 smooth drop bloom
  buildProgress: number; // 0..1 how far through a buildup (for riser viz)
  dropArmed: boolean;
}

// ── seeded PRNG (deterministic, constant seed) ──────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x: number, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);
const smoothstep = (p: number) => p * p * (3 - 2 * p);

// ── musical constants ───────────────────────────────────────────────────────
const BPM = 126;
const SEC_BEAT = 60 / BPM;
const SEC16 = SEC_BEAT / 4;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.1;

// A euphoric 4-bar loop:  Fm  Ab  Eb  Db   (i - III - VII - VI)
const BAR_ROOTS = [53, 56, 51, 49]; // F3 Ab3 Eb3 Db3
const CHORDS = [
  [53, 56, 60], // Fm  : F  Ab C
  [56, 60, 63], // Ab  : Ab C  Eb
  [51, 55, 58], // Eb  : Eb G  Bb
  [49, 53, 56], // Db  : Db F  Ab
];

// The full arrangement. ~102 bars @126bpm ≈ 3m14s.
function buildSections(): Section[] {
  return [
    { name: "intro", kind: "intro", bars: 16, e0: 0.12, e1: 0.32, hue: 262 },
    { name: "buildup", kind: "buildup", bars: 16, e0: 0.3, e1: 0.98, hue: 288 },
    { name: "drop", kind: "drop", bars: 16, e0: 0.92, e1: 0.92, hue: 312 },
    { name: "breakdown", kind: "breakdown", bars: 12, e0: 0.58, e1: 0.22, hue: 248 },
    { name: "build2", kind: "buildup", bars: 16, e0: 0.28, e1: 1.0, hue: 292 },
    { name: "drop2", kind: "drop", bars: 16, e0: 1.0, e1: 1.0, hue: 330 },
    { name: "outro", kind: "outro", bars: 10, e0: 0.62, e1: 0.0, hue: 256 },
  ];
}

// energy shape within a section for a given kind (base curve, 0..1 of e0->e1)
function shapeFor(kind: SectionKind, p: number): number {
  switch (kind) {
    case "intro":
      return smoothstep(p);
    case "buildup":
      return Math.pow(p, 2.2); // surges at the end
    case "drop":
      return 1;
    case "breakdown":
      return smoothstep(p);
    case "outro":
      return p;
  }
}

export class BigRoomEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private pumpBus: GainNode; // sidechained (pumped) layers
  private punchBus: GainNode; // kick / crash / riser — never ducked
  private noiseBuf: AudioBuffer;
  private rng = mulberry32(0x1818);

  private sections = buildSections();
  private sectionIndex = 0;
  private sectionStartStep = 0;
  private stepIndex = 0;
  private nextNoteTime = 0;
  private startTime = 0;
  private timer: number | null = null;
  private running = false;
  private finished = false;
  private muted = false;

  // live controls
  private intensity = 0.5; // 0..1, 0.5 neutral
  private dropArmed = false;

  // viz-shared transient state
  private curEnergy = 0;
  private curBaseEnergy = 0;
  private lastKickTime = -1;
  private lastKickDepth = 0;
  private bloomTime = -10;

  // riser voice (one continuous voice during a buildup)
  private riser: {
    noiseGain: GainNode;
    noiseFilter: BiquadFilterNode;
    pitchOsc: OscillatorNode;
    pitchGain: GainNode;
    src: AudioBufferSourceNode;
  } | null = null;

  onFinished: (() => void) | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    // master safety chain: sources -> comp -> master(≤0.18) -> destination
    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.knee.value = 6;
    this.comp.ratio.value = 12;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.15;
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    this.pumpBus = ctx.createGain();
    this.pumpBus.gain.value = 1;
    this.pumpBus.connect(this.comp);
    this.punchBus = ctx.createGain();
    this.punchBus.gain.value = 1;
    this.punchBus.connect(this.comp);

    // one deterministic white-noise buffer, reused
    const len = Math.floor(ctx.sampleRate * 1.2);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = this.rng() * 2 - 1;
  }

  // ── transport ──────────────────────────────────────────────────────────────
  start() {
    if (this.running) return;
    this.running = true;
    this.finished = false;
    const t = this.ctx.currentTime + 0.12;
    this.startTime = t;
    this.nextNoteTime = t;
    this.stepIndex = 0;
    this.sectionIndex = 0;
    this.sectionStartStep = 0;
    // fade master up to a safe ceiling
    const ceiling = 0.18;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.linearRampToValueAtTime(ceiling, t + 0.5);
    this.timer = window.setInterval(() => this.scheduler(), LOOKAHEAD_MS);
  }

  stop() {
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0.0001, t + 0.08);
    this.stopRiser(t);
  }

  setIntensity(v: number) {
    this.intensity = clamp(v);
  }
  setMuted(m: boolean) {
    this.muted = m;
    const t = this.ctx.currentTime;
    const target = m ? 0.0001 : 0.18;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), t);
    this.master.gain.linearRampToValueAtTime(target, t + 0.06);
  }
  armDrop() {
    // trigger the next drop early: collapse the current live buildup
    const cur = this.sections[this.sectionIndex];
    if (cur && cur.kind === "buildup") {
      const relBar = Math.floor((this.stepIndex - this.sectionStartStep) / 16);
      cur.bars = Math.max(2, Math.min(cur.bars, relBar + 2));
    } else {
      this.dropArmed = true; // will fire when we next reach a buildup
    }
  }

  // ── the look-ahead scheduler ────────────────────────────────────────────────
  private scheduler() {
    if (!this.running) return;
    const ctx = this.ctx;
    while (this.nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
      let cur = this.sections[this.sectionIndex];
      // advance section?
      if (this.stepIndex - this.sectionStartStep >= cur.bars * 16) {
        if (this.riser) this.stopRiser(this.nextNoteTime);
        this.sectionStartStep = this.stepIndex;
        this.sectionIndex++;
        if (this.sectionIndex >= this.sections.length) {
          this.finish();
          return;
        }
        cur = this.sections[this.sectionIndex];
        if (cur.kind === "buildup" && this.dropArmed) {
          cur.bars = Math.max(2, Math.min(cur.bars, 4));
          this.dropArmed = false;
        }
      }
      this.scheduleStep(this.stepIndex, this.nextNoteTime, cur);
      this.stepIndex++;
      this.nextNoteTime += SEC16;
    }
  }

  private finish() {
    this.running = false;
    this.finished = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), t);
    this.master.gain.linearRampToValueAtTime(0.0001, t + 2.0);
    this.onFinished?.();
  }

  // energy including the intensity nudge (this is what drives DSP)
  private nudged(base: number): number {
    return clamp(base + (this.intensity - 0.5) * 0.35, 0.02, 1);
  }

  // energy base curve for a section at fraction p (used for viz envelope too)
  energyForSection(sec: Section, p: number): number {
    return sec.e0 + (sec.e1 - sec.e0) * shapeFor(sec.kind, clamp(p));
  }

  private scheduleStep(step: number, t: number, sec: Section) {
    const relStep = step - this.sectionStartStep;
    const totalSteps = sec.bars * 16;
    const relBar = Math.floor(relStep / 16);
    const s = relStep % 16; // 16th within the bar
    const p = totalSteps > 0 ? relStep / totalSteps : 0;
    const base = this.energyForSection(sec, p);
    const energy = this.nudged(base);
    this.curEnergy = energy;
    this.curBaseEnergy = base;

    // harmony flows continuously across the whole piece
    const absBar = Math.floor(step / 16);
    const chord = CHORDS[absBar % 4];
    const root = BAR_ROOTS[absBar % 4];

    // GAP: last two 16ths of a buildup are silent (the classic breath-hold)
    const inGap = sec.kind === "buildup" && relStep >= totalSteps - 2;
    // riser/roll zone: last 4 bars of a buildup (before the gap)
    const rollZone =
      sec.kind === "buildup" && relBar >= sec.bars - 4 && !inGap;

    // ── RISER (continuous) ───────────────────────────────────────────────────
    if (sec.kind === "buildup" && !this.riser && !inGap && relBar >= sec.bars - 4) {
      const gapStep = totalSteps - 2;
      const gapTime = t + (gapStep - relStep) * SEC16;
      this.startRiser(t, gapTime);
    }
    if (inGap && this.riser) this.stopRiser(t);

    // ── KICK (four-on-the-floor) ─────────────────────────────────────────────
    let kick = false;
    if (s === 0 || s === 4 || s === 8 || s === 12) {
      if (sec.kind === "drop") kick = true;
      else if (sec.kind === "buildup" && relBar < sec.bars - 1 && !inGap) kick = true;
      else if (sec.kind === "intro" && relBar >= 8) kick = true;
      else if (sec.kind === "outro" && relBar < sec.bars - 2) kick = true;
    }
    if (kick) {
      this.playKick(t, 0.85 + energy * 0.1);
      const depth = clamp(0.18 + energy * 0.62, 0, 0.85);
      this.duck(t, depth);
      this.lastKickTime = t;
      this.lastKickDepth = depth;
    }

    // ── SUB BASS (pumped) ────────────────────────────────────────────────────
    if (
      (sec.kind === "drop" || (sec.kind === "buildup" && relBar < sec.bars - 1) ||
        (sec.kind === "outro" && relBar < sec.bars - 2)) &&
      (s === 0 || s === 4 || s === 8 || s === 12) &&
      !inGap
    ) {
      this.playSub(t, mtof(root - 24), SEC_BEAT * 0.9, 0.42 * (0.5 + energy * 0.5));
    }

    // ── OFFBEAT OPEN HATS (pumped) ───────────────────────────────────────────
    if ((s === 2 || s === 6 || s === 10 || s === 14) && !inGap) {
      if (sec.kind === "drop" || (sec.kind === "buildup" && !rollZone) || sec.kind === "outro") {
        this.playHat(t, 0.13 + energy * 0.06);
      }
    }

    // ── CLAP on beats 2 & 4 (pumped) ─────────────────────────────────────────
    if ((s === 4 || s === 12) && sec.kind === "drop") {
      this.playClap(t, 0.36);
    }

    // ── SNARE-ROLL ACCELERANDO (build climax) ────────────────────────────────
    if (rollZone) {
      const barsLeft = sec.bars - 1 - relBar; // 3,2,1,0
      let hit = false;
      if (barsLeft >= 2) hit = s % 2 === 0; // 8th notes
      else if (barsLeft === 1) hit = true; // 16ths
      else hit = true; // final bar: 16ths + 32nd offset below
      if (hit) {
        const vel = 0.14 + energy * 0.28;
        this.playSnare(t, vel);
        if (barsLeft === 0) this.playSnare(t + SEC16 / 2, vel); // 32nds
      }
    }

    // ── DROP IMPACT: crash + boom on the very first step of a drop ────────────
    if (sec.kind === "drop" && relStep === 0) {
      this.playCrash(t, 0.34);
      this.playBoom(t, 0.5);
      this.bloomTime = t;
    }

    // ── SUPERSAW LEAD (chord, pumped) ────────────────────────────────────────
    // sustained per bar; the sidechain duck makes it pump on every kick
    if (s === 0 && !inGap) {
      const cutoff = 260 + energy * energy * 7200;
      if (sec.kind === "drop") {
        this.playSupersaw(t, chord, SEC_BEAT * 4 * 0.98, cutoff, 0.16, false);
      } else if (sec.kind === "breakdown") {
        // emotional pad: soft, low cutoff, no kick underneath
        this.playSupersaw(t, chord, SEC_BEAT * 4 * 0.98, 420 + energy * 1600, 0.15, true);
      } else if (sec.kind === "intro" && relBar >= 4) {
        this.playSupersaw(t, chord, SEC_BEAT * 4 * 0.98, 380 + energy * 900, 0.08, true);
      } else if (sec.kind === "buildup" && !rollZone) {
        this.playSupersaw(t, chord, SEC_BEAT * 4 * 0.98, cutoff, 0.11, false);
      }
    }

    // ── PLUCK HOOK (arpeggio, pumped) ────────────────────────────────────────
    // the memorable line; full in drops, teased in intro/breakdown
    const arpHit = s % 2 === 0; // straight 8ths
    if (arpHit && !inGap) {
      const arp = [
        chord[0] + 12,
        chord[1] + 12,
        chord[2] + 12,
        chord[0] + 24,
        chord[2] + 12,
        chord[1] + 12,
        chord[0] + 12,
        chord[2] + 12,
      ];
      const note = arp[(s / 2) % 8 | 0];
      let vel = 0;
      if (sec.kind === "drop") vel = 0.28;
      else if (sec.kind === "breakdown") vel = 0.16;
      else if (sec.kind === "intro" && relBar >= 8) vel = 0.12;
      else if (sec.kind === "outro" && relBar < sec.bars - 2) vel = 0.2;
      if (vel > 0) this.playPluck(t, mtof(note), vel, 220 + energy * 4200);
    }
  }

  // ── sidechain duck applied to the pumped bus ────────────────────────────────
  private duck(t: number, depth: number) {
    const g = this.pumpBus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.05, 1 - depth), t);
    g.linearRampToValueAtTime(1, t + SEC_BEAT * 0.92);
  }

  // ── instruments ─────────────────────────────────────────────────────────────
  private playKick(t: number, vel: number) {
    if (this.muted) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.3);
    osc.connect(g).connect(this.punchBus);
    osc.start(t);
    osc.stop(t + 0.32);
    // click transient
    const n = this.noiseSource();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1200;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vel * 0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.0008, t + 0.02);
    n.connect(hp).connect(ng).connect(this.punchBus);
    n.start(t);
    n.stop(t + 0.03);
  }

  private playSub(t: number, freq: number, dur: number, vel: number) {
    if (this.muted) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.008);
    g.gain.setValueAtTime(vel, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(lp).connect(g).connect(this.pumpBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private playHat(t: number, vel: number) {
    if (this.muted) return;
    const ctx = this.ctx;
    const n = this.noiseSource();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.09);
    n.connect(hp).connect(g).connect(this.pumpBus);
    n.start(t);
    n.stop(t + 0.1);
  }

  private playClap(t: number, vel: number) {
    if (this.muted) return;
    const ctx = this.ctx;
    for (let i = 0; i < 3; i++) {
      const dt = i * 0.008;
      const n = this.noiseSource();
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1600;
      bp.Q.value = 1.1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel * (i === 2 ? 1 : 0.6), t + dt);
      g.gain.exponentialRampToValueAtTime(0.0006, t + dt + (i === 2 ? 0.14 : 0.03));
      n.connect(bp).connect(g).connect(this.pumpBus);
      n.start(t + dt);
      n.stop(t + dt + 0.16);
    }
  }

  private playSnare(t: number, vel: number) {
    if (this.muted) return;
    const ctx = this.ctx;
    const n = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1900;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.07);
    n.connect(bp).connect(g).connect(this.punchBus);
    n.start(t);
    n.stop(t + 0.08);
  }

  private playCrash(t: number, vel: number) {
    if (this.muted) return;
    const ctx = this.ctx;
    const n = this.noiseSource();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 1.4);
    n.connect(hp).connect(g).connect(this.punchBus);
    n.start(t);
    n.stop(t + 1.42);
  }

  private playBoom(t: number, vel: number) {
    if (this.muted) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(72, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.6);
    osc.connect(g).connect(this.punchBus);
    osc.start(t);
    osc.stop(t + 0.62);
  }

  private playSupersaw(
    t: number,
    chord: number[],
    dur: number,
    cutoff: number,
    vel: number,
    soft: boolean,
  ) {
    if (this.muted) return;
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = cutoff;
    lp.Q.value = soft ? 0.7 : 1.1;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0008, t);
    bus.gain.linearRampToValueAtTime(vel, t + (soft ? 0.12 : 0.02));
    bus.gain.setValueAtTime(vel, t + dur * 0.75);
    bus.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    lp.connect(bus).connect(this.pumpBus);
    const detunes = [-19, -11, -4, 4, 11, 19];
    for (const note of chord) {
      const f = mtof(note + 12);
      for (const d of detunes) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f;
        o.detune.value = d;
        const og = ctx.createGain();
        og.gain.value = 1 / (chord.length * detunes.length);
        o.connect(og).connect(lp);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  private playPluck(t: number, freq: number, vel: number, cutoff: number) {
    if (this.muted) return;
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(cutoff, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, cutoff * 0.25), t + 0.16);
    lp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.2);
    lp.connect(g).connect(this.pumpBus);
    for (const d of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq;
      o.detune.value = d;
      o.connect(lp);
      o.start(t);
      o.stop(t + 0.22);
    }
  }

  // ── riser (continuous voice through the build) ──────────────────────────────
  private startRiser(t: number, gapTime: number) {
    if (this.muted) {
      // still track state so it stops cleanly, but make no sound
    }
    const ctx = this.ctx;
    // bandpass noise uprising
    const src = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(9000, gapTime);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0008, t);
    ng.gain.linearRampToValueAtTime(this.muted ? 0.0001 : 0.2, gapTime);
    src.connect(bp).connect(ng).connect(this.punchBus);
    src.start(t);
    src.stop(gapTime + 0.2);
    // pitch riser
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(1500, gapTime);
    const olp = ctx.createBiquadFilter();
    olp.type = "lowpass";
    olp.frequency.setValueAtTime(600, t);
    olp.frequency.exponentialRampToValueAtTime(3000, gapTime);
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0.0008, t);
    pg.gain.linearRampToValueAtTime(this.muted ? 0.0001 : 0.07, gapTime);
    osc.connect(olp).connect(pg).connect(this.punchBus);
    osc.start(t);
    osc.stop(gapTime + 0.2);
    this.riser = { noiseGain: ng, noiseFilter: bp, pitchOsc: osc, pitchGain: pg, src };
  }

  private stopRiser(t: number) {
    if (!this.riser) return;
    const r = this.riser;
    try {
      r.noiseGain.gain.cancelScheduledValues(t);
      r.noiseGain.gain.setValueAtTime(Math.max(0.0001, r.noiseGain.gain.value), t);
      r.noiseGain.gain.linearRampToValueAtTime(0.0001, t + 0.05);
      r.pitchGain.gain.cancelScheduledValues(t);
      r.pitchGain.gain.setValueAtTime(Math.max(0.0001, r.pitchGain.gain.value), t);
      r.pitchGain.gain.linearRampToValueAtTime(0.0001, t + 0.05);
      r.src.stop(t + 0.08);
      r.pitchOsc.stop(t + 0.08);
    } catch {
      /* already stopped */
    }
    this.riser = null;
  }

  private noiseSource(): AudioBufferSourceNode {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    return n;
  }

  // ── viz snapshot ────────────────────────────────────────────────────────────
  getSections(): Section[] {
    return this.sections;
  }

  snapshot(): Snapshot {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const cur = this.sections[this.sectionIndex] ?? this.sections[this.sections.length - 1];

    // approximate current playing position (look-ahead is < 0.1s)
    const stepNow = Math.max(0, Math.floor((now - this.startTime) / SEC16));
    const relStepNow = clamp(stepNow - this.sectionStartStep, 0, cur.bars * 16);
    const relBarNow = relStepNow / 16;

    // overall playhead across current (possibly mutated) arrangement
    let before = 0;
    let total = 0;
    for (let i = 0; i < this.sections.length; i++) {
      if (i < this.sectionIndex) before += this.sections[i].bars;
      total += this.sections[i].bars;
    }
    const playhead = total > 0 ? clamp((before + relBarNow) / total) : 0;

    const beatPhase = this.running
      ? (((now - this.startTime) / SEC_BEAT) % 1 + 1) % 1
      : 0;

    // sidechain visual punch (spike at kick, quick decay)
    const dt = now - this.lastKickTime;
    const pumpPunch = this.lastKickTime >= 0 && dt >= 0
      ? this.lastKickDepth * Math.max(0, 1 - dt / 0.16)
      : 0;

    // smooth drop bloom: rise ~0.25s then decay ~2s (one-shot, no strobe)
    const bt = now - this.bloomTime;
    let bloom = 0;
    if (bt >= 0 && bt < 2.4) {
      const rise = clamp(bt / 0.25);
      const fall = clamp(1 - (bt - 0.25) / 2.15);
      bloom = smoothstep(rise) * fall;
    }

    const buildProgress = cur.kind === "buildup" ? clamp(relStepNow / (cur.bars * 16)) : 0;

    return {
      running: this.running,
      finished: this.finished,
      sectionIndex: this.sectionIndex,
      sectionName: cur.name,
      sectionKind: cur.kind,
      energy: this.curEnergy,
      baseEnergy: this.curBaseEnergy,
      playhead,
      beatPhase,
      pumpPunch,
      bloom,
      buildProgress,
      dropArmed: this.dropArmed,
    };
  }
}
