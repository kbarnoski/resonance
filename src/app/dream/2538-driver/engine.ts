// engine.ts — the arrangement state machine for 2538-driver.
//
// This is the heart of the piece: a rhythm-first, long-form generative techno
// controller that walks a multi-minute arc (intro → build → drop → breakdown →
// build → drop …) and mutates its pattern bank every bar so it never plays the
// same bar twice. All variation is driven by a seeded mulberry32(0x2538) PRNG +
// a monotonic bar/step counter — no Math.random / Date.now anywhere, so a
// replay of the same seed reproduces the same performance.
//
// Design refs: arXiv:2605.21874 (infinite, stylistically-coherent, monitoring-
// style EDM sonification); Eno/Koan generative lineage (rules + state, not a
// loop); Roland TR-909 / TB-303 as the voice reference. The harmony is
// deliberately NOT snapped to a consonant grid — the acid line draws from a
// pool that includes the b9 and the tritone and is allowed to clash.

export type VoiceName = "kick" | "sub" | "clap" | "chat" | "ohat" | "acid";
export const VOICES: VoiceName[] = [
  "kick",
  "sub",
  "clap",
  "chat",
  "ohat",
  "acid",
];
export type PercVoice = Exclude<VoiceName, "acid">;
const PERC: PercVoice[] = ["kick", "sub", "clap", "chat", "ohat"];

export type PhaseName = "intro" | "build" | "drop" | "breakdown";
const STEPS = 16;

export interface Step {
  on: boolean;
  vel: number;
}
export interface AcidStep {
  on: boolean;
  off: number; // semitone offset from the drifting root
  accent: boolean;
  slide: boolean;
}

export interface PercEvent {
  voice: PercVoice;
  velocity: number;
}
export interface AcidEvent {
  voice: "acid";
  velocity: number;
  midi: number;
  accent: boolean;
  slide: boolean;
  decay: number;
}
export type VoiceEvent = PercEvent | AcidEvent;

export interface TickResult {
  step: number;
  bar: number;
  newBar: boolean;
  riser: boolean;
  events: VoiceEvent[];
}

export interface EngineSnapshot {
  bar: number;
  step: number;
  phase: PhaseName;
  phaseBar: number;
  phaseLen: number;
  energy: number;
  tension: number;
  cutoff: number;
  bpm: number;
  fillActive: boolean;
  distinctBars: number;
  active: Record<VoiceName, boolean>;
  muted: Record<VoiceName, boolean>;
  acidOn: boolean;
}

/** Deterministic PRNG — the ONLY source of randomness in this prototype. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function emptySteps(): Step[] {
  return Array.from({ length: STEPS }, () => ({ on: false, vel: 0 }));
}

// A deliberately un-pretty pool: minor colour plus the b9 (1), the tritone (6)
// and the b13 (8) so the acid line can bend into dissonance against the sub.
const ACID_POOL = [0, 1, 3, 5, 6, 7, 8, 10, 12, 13, 15];

const PHASE_ORDER: Record<PhaseName, PhaseName> = {
  intro: "build",
  build: "drop",
  drop: "breakdown",
  breakdown: "build",
};

export class Arrangement {
  readonly bpm: number;
  private rnd: () => number;

  private bar = 0;
  private step = -1;
  private phase: PhaseName = "intro";
  private phaseBar = 0;
  private phaseLen = 4;
  private pendingPhase: PhaseName | null = null;

  private energyTarget = 0.12;
  private energy = 0.04;
  private tension = 0;
  private userBias = 0;

  private acidOn = true;
  private acidRoot = 33; // A1 region — a bass anchor that is allowed to drift.
  private fillCountdown = 0;
  private fillActive = false;
  private distinctBars = 0;

  private muted: Record<VoiceName, boolean> = {
    kick: false,
    sub: false,
    clap: false,
    chat: false,
    ohat: false,
    acid: false,
  };
  private patterns: Record<PercVoice, Step[]> = {
    kick: emptySteps(),
    sub: emptySteps(),
    clap: emptySteps(),
    chat: emptySteps(),
    ohat: emptySteps(),
  };
  private acidSeq: AcidStep[] = Array.from({ length: STEPS }, () => ({
    on: false,
    off: 0,
    accent: false,
    slide: false,
  }));

  private history: number[] = [];

  constructor(seed = 0x2538, bpm = 128) {
    this.rnd = mulberry32(seed);
    this.bpm = bpm;
    // Prime a first bar so the silent auto-demo has something to show.
    this.onNewBar(true);
  }

  // ── Public controls (keyboard performance surface) ────────────────────────
  nudgeEnergy(delta: number): void {
    this.userBias = Math.max(-0.35, Math.min(0.45, this.userBias + delta));
  }
  triggerFill(): void {
    this.fillCountdown = 1;
  }
  forceDrop(): void {
    this.pendingPhase = "drop";
    this.userBias = Math.min(0.45, this.userBias + 0.15);
  }
  forceBreak(): void {
    this.pendingPhase = "breakdown";
  }
  toggleMute(v: VoiceName): void {
    this.muted[v] = !this.muted[v];
  }
  toggleAcid(): void {
    this.acidOn = !this.acidOn;
  }

  // ── Transport ─────────────────────────────────────────────────────────────
  tick(): TickResult {
    this.step = (this.step + 1) % STEPS;
    const newBar = this.step === 0;
    if (newBar) {
      this.bar++;
      this.onNewBar(false);
    }

    // Smooth energy + tension per step for gentle (photosensitive-safe) drift.
    const target = Math.max(0, Math.min(1, this.energyTarget + this.userBias));
    this.energy += (target - this.energy) * 0.06;
    const tTarget = this.computeTensionTarget();
    this.tension += (tTarget - this.tension) * 0.06;

    const events: VoiceEvent[] = [];
    for (const v of PERC) {
      if (!this.isActive(v)) continue;
      const s = this.patterns[v][this.step];
      if (s.on) events.push({ voice: v, velocity: s.vel });
    }
    if (this.isActive("acid")) {
      const a = this.acidSeq[this.step];
      if (a.on) {
        const decay = 0.1 + (a.slide ? 0.11 : 0.03) + (1 - this.energy) * 0.05;
        events.push({
          voice: "acid",
          midi: this.acidRoot + a.off,
          accent: a.accent,
          slide: a.slide,
          decay,
          velocity: 0.7 + (a.accent ? 0.3 : 0),
        });
      }
    }

    const riser = newBar && this.fillActive;
    return { step: this.step, bar: this.bar, newBar, riser, events };
  }

  getSnapshot(): EngineSnapshot {
    const active = {} as Record<VoiceName, boolean>;
    for (const v of VOICES) active[v] = this.isActive(v);
    return {
      bar: this.bar,
      step: this.step < 0 ? 0 : this.step,
      phase: this.phase,
      phaseBar: this.phaseBar,
      phaseLen: this.phaseLen,
      energy: this.energy,
      tension: this.tension,
      cutoff: this.acidCutoff(),
      bpm: this.bpm,
      fillActive: this.fillActive,
      distinctBars: this.distinctBars,
      active,
      muted: { ...this.muted },
      acidOn: this.acidOn,
    };
  }

  acidFreq(midi: number): number {
    return midiToFreq(midi);
  }
  private acidCutoff(): number {
    return Math.max(0.12, Math.min(1, 0.14 + 0.82 * this.energy));
  }

  // ── Arrangement walk ──────────────────────────────────────────────────────
  private onNewBar(first: boolean): void {
    if (!first) {
      this.phaseBar++;
      if (this.pendingPhase) {
        this.enterPhase(this.pendingPhase);
        this.pendingPhase = null;
      } else if (this.phaseBar >= this.phaseLen) {
        this.enterPhase(PHASE_ORDER[this.phase]);
      }
    }

    // A fill fires on the final bar of a build, or when the player triggered it.
    this.fillActive =
      (this.phase === "build" && this.phaseBar >= this.phaseLen - 1) ||
      this.fillCountdown > 0;
    if (this.fillCountdown > 0) this.fillCountdown--;

    this.energyTarget = this.computeEnergyTarget();
    this.mutate();
  }

  private enterPhase(p: PhaseName): void {
    this.phase = p;
    this.phaseBar = 0;
    // Vary phase length every time so no two passes of a phase line up.
    const r = this.rnd();
    if (p === "intro") this.phaseLen = 4;
    else if (p === "build") this.phaseLen = 6 + Math.floor(r * 5); // 6–10
    else if (p === "drop") this.phaseLen = 8 + Math.floor(r * 9); // 8–16
    else this.phaseLen = 4 + Math.floor(r * 5); // breakdown 4–8
  }

  private computeEnergyTarget(): number {
    const p = this.phaseLen > 0 ? this.phaseBar / this.phaseLen : 0;
    switch (this.phase) {
      case "intro":
        return 0.1 + 0.14 * p;
      case "build":
        return 0.32 + 0.55 * p;
      case "drop":
        return 0.9 + 0.06 * Math.sin(p * Math.PI * 3);
      case "breakdown":
        return 0.5 * (1 - p) + 0.12;
    }
  }

  private computeTensionTarget(): number {
    const p = this.phaseLen > 0 ? this.phaseBar / this.phaseLen : 0;
    let t = this.energy * 0.55;
    if (this.phase === "build") t += 0.35 * p;
    else if (this.phase === "drop") t += 0.25;
    if (this.fillActive) t += 0.15;
    if (this.acidOn) t += 0.08;
    return Math.max(0, Math.min(1, t));
  }

  private isActive(v: VoiceName): boolean {
    if (this.muted[v]) return false;
    const e = this.energy;
    switch (v) {
      case "kick":
        return e >= 0.2;
      case "sub":
        return e >= 0.42;
      case "clap":
        return e >= 0.38;
      case "chat":
        return e >= 0.28;
      case "ohat":
        return e >= 0.55;
      case "acid":
        return this.acidOn && e >= 0.34;
    }
  }

  // ── Per-bar mutation — the never-repeat machinery ─────────────────────────
  private mutate(): void {
    const e = this.energyTarget;
    const fill = this.fillActive;
    const r = this.rnd;

    // KICK — steady four-on-floor with drifting ghosts; roll on a fill.
    const kick = emptySteps();
    for (const i of [0, 4, 8, 12]) kick[i] = { on: true, vel: 0.95 };
    if (r() < 0.3 * e) kick[7] = { on: true, vel: 0.45 };
    if (r() < 0.25 * e) kick[14] = { on: true, vel: 0.4 };
    if (fill) for (const i of [12, 13, 14, 15]) kick[i] = { on: true, vel: 0.7 };
    this.patterns.kick = kick;

    // SUB — roots under the kick, thickening with energy.
    const sub = emptySteps();
    for (const i of [0, 8]) sub[i] = { on: true, vel: 0.9 };
    if (e > 0.6 && r() < 0.6) sub[4] = { on: true, vel: 0.7 };
    if (e > 0.7 && r() < 0.5) sub[12] = { on: true, vel: 0.7 };
    this.patterns.sub = sub;

    // CLAP — backbeat plus wandering ghosts; a 16th roll on a fill.
    const clap = emptySteps();
    for (const i of [4, 12]) clap[i] = { on: true, vel: 0.85 };
    if (r() < 0.25) clap[7] = { on: true, vel: 0.4 };
    if (r() < 0.2) clap[15] = { on: true, vel: 0.4 };
    if (fill)
      for (let i = 8; i < 16; i++) clap[i] = { on: true, vel: 0.55 };
    this.patterns.clap = clap;

    // CLOSED HAT — offbeat 8ths plus probabilistic 16th ghosts (the main source
    // of bar-to-bar variety). Density rides the energy scalar.
    const chat = emptySteps();
    for (const i of [2, 6, 10, 14]) chat[i] = { on: true, vel: 0.6 };
    for (let i = 0; i < STEPS; i++) {
      if (!chat[i].on && r() < 0.15 + 0.4 * e)
        chat[i] = { on: true, vel: 0.28 + 0.2 * r() };
    }
    this.patterns.chat = chat;

    // OPEN HAT — sparse offbeat lift, more at high energy.
    const ohat = emptySteps();
    if (r() < 0.7) ohat[2] = { on: true, vel: 0.55 };
    if (e > 0.6 && r() < 0.6) ohat[10] = { on: true, vel: 0.55 };
    if (e > 0.75 && r() < 0.4) ohat[14] = { on: true, vel: 0.45 };
    this.patterns.ohat = ohat;

    // ACID — gradual evolution: re-roll ~40% of steps each bar so the line is
    // continuous yet never identical, plus an occasional dissonant root drift.
    if (r() < 0.35) {
      const drift = r() < 0.5 ? (r() < 0.5 ? 1 : -1) : r() < 0.5 ? 5 : -5;
      this.acidRoot = Math.max(28, Math.min(40, this.acidRoot + drift));
    }
    const density = 0.28 + 0.5 * e;
    for (let i = 0; i < STEPS; i++) {
      if (r() < 0.4) {
        const on = r() < density;
        this.acidSeq[i] = {
          on,
          off: ACID_POOL[Math.floor(r() * ACID_POOL.length)] + (r() < 0.15 ? 12 : 0),
          accent: r() < 0.22 + 0.3 * e,
          slide: r() < 0.32,
        };
        if (!on) this.acidSeq[i].on = false;
      }
    }

    this.recordBar();
  }

  /** Hash the whole active bar; count only genuinely new bars. */
  private recordBar(): void {
    let h = 0x2538 >>> 0;
    const mix = (n: number) => {
      h = Math.imul(h ^ (n >>> 0), 0x01000193) >>> 0;
    };
    for (const v of PERC)
      for (let i = 0; i < STEPS; i++) {
        const s = this.patterns[v][i];
        mix((s.on ? 1 : 0) + Math.round(s.vel * 15) * 2);
      }
    for (let i = 0; i < STEPS; i++) {
      const a = this.acidSeq[i];
      mix((a.on ? 1 : 0) + a.off * 2 + (a.accent ? 64 : 0) + (a.slide ? 128 : 0));
    }
    mix(this.acidRoot);
    if (!this.history.includes(h)) this.distinctBars++;
    this.history.push(h);
    if (this.history.length > 64) this.history.shift();
  }
}
