// 1824-reverie — audio engine
//
// A CINEMATIC-NARRATIVE journey engine: a generative "score to an unseen film"
// that walks Freytag's dramatic pyramid —
//   Establishing -> Inciting incident -> Rising action -> Climax
//     -> Falling action -> Resolution
// — as a continuous TENSION curve driving a small synthesized orchestra
// (string-pad bed, a leitmotif melody voice, a low ostinato/pulse that
// intensifies through the rising action, and timpani/cymbal impacts for the
// climax).
//
// The intellectual core is the TRANSITION between acts. Rather than hard-cutting
// from one act to the next, a lightweight rule-based "director" — inspired by
// JenBridge's adaptive transition mechanism (arXiv:2606.01703) — inspects the
// tension delta at each boundary and RENDERS a generative musical BRIDGE:
//   swell · suspended · ritardando · pivot
// so the seams between acts are audible and legible.
//
// A short leitmotif is stated in Act 1, returns transformed (register +
// orchestration) at the Climax, and settles at the Resolution — same intervals,
// different voicing. All output is mood-seeded (noir / wonder / dread / elegy),
// deterministic (mulberry32 seeded 0x1824), and routed through a compressor
// into a master gain capped well under 0.18. See README.md for citations.

export type ActKind =
  | "establishing"
  | "inciting"
  | "rising"
  | "climax"
  | "falling"
  | "resolution";

export type BridgeKind = "swell" | "suspended" | "ritardando" | "pivot";

export type MoodKey = "noir" | "wonder" | "dread" | "elegy";

export interface Segment {
  kind: "act" | "bridge";
  name: string;
  actKind?: ActKind;
  bridgeKind?: BridgeKind;
  beats: number;
  t0: number; // tension at start
  t1: number; // tension at end
  hue: number; // base hue for the structure ribbon
  chords: number[]; // scale-degree roots, one per bar (acts only)
  startBeat: number; // filled during layout
}

export interface Snapshot {
  running: boolean;
  finished: boolean;
  segIndex: number;
  segName: string;
  segKind: "act" | "bridge";
  actLabel: string; // current act (bridges report the act they lead into)
  bridgeKind: BridgeKind | null;
  tension: number; // 0..1 current dramatic tension
  playhead: number; // 0..1 across the whole timeline
  beatPhase: number; // 0..1 within the current beat
  impact: number; // 0..1 decaying timpani/impact flash
  motifPulse: number; // 0..1 glow when a leitmotif note sounds
  bloom: number; // 0..1 slow climax luminance (no strobe)
  cardAlpha: number; // 0..1 chapter-title-card fade at each act boundary
  cardText: string; // act name for the current title card
}

export interface MoodConfig {
  key: MoodKey;
  label: string;
  root: number; // tonic MIDI
  scale: number[]; // semitone offsets, 7 degrees
  hue: number; // canvas base hue
  bright: number; // 0..1 palette + timbre brightness
  padType: OscillatorType;
  leadType: OscillatorType;
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
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const smoothstep = (p: number) => {
  const c = clamp(p);
  return c * c * (3 - 2 * c);
};

// ── musical constants ───────────────────────────────────────────────────────
const BPM = 63;
const SEC_BEAT = 60 / BPM;
const BEATS_PER_BAR = 4;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;
const CEILING = 0.16; // master gain ceiling — well under the 0.18 cap

export const MOODS: Record<MoodKey, MoodConfig> = {
  noir: {
    key: "noir",
    label: "noir",
    root: 45, // A2
    scale: [0, 2, 3, 5, 7, 8, 10], // natural minor
    hue: 220,
    bright: 0.5,
    padType: "sawtooth",
    leadType: "triangle",
  },
  wonder: {
    key: "wonder",
    label: "wonder",
    root: 48, // C3
    scale: [0, 2, 4, 6, 7, 9, 11], // lydian
    hue: 268,
    bright: 0.92,
    padType: "triangle",
    leadType: "triangle",
  },
  dread: {
    key: "dread",
    label: "dread",
    root: 40, // E2
    scale: [0, 1, 3, 5, 7, 8, 10], // phrygian
    hue: 302,
    bright: 0.32,
    padType: "sawtooth",
    leadType: "sawtooth",
  },
  elegy: {
    key: "elegy",
    label: "elegy",
    root: 43, // G2
    scale: [0, 2, 3, 5, 7, 9, 10], // dorian
    hue: 250,
    bright: 0.6,
    padType: "triangle",
    leadType: "triangle",
  },
};

// The leitmotif: scale-degree indices + durations (beats). A rising-then-
// resolving arc that mirrors the drama. Intervals are constant across the piece;
// only register + orchestration change on its return.
const MOTIF_DEGREES = [0, 3, 4, 2, 0];
const MOTIF_DURS = [1, 1, 2, 1, 3];

// The narrative timeline (acts interleaved with director bridges). Chords are
// scale-degree roots (one per bar). Tensions define the dramatic curve.
function buildActs(): Segment[] {
  const acts: Segment[] = [
    {
      kind: "act",
      name: "Establishing",
      actKind: "establishing",
      beats: 24,
      t0: 0.14,
      t1: 0.24,
      hue: 250,
      chords: [0, 4, 3, 5, 0, 4, 3, 5],
      startBeat: 0,
    },
    {
      kind: "act",
      name: "Inciting incident",
      actKind: "inciting",
      beats: 20,
      t0: 0.26,
      t1: 0.46,
      hue: 276,
      chords: [1, 4, 0, 6, 1, 4, 0, 6],
      startBeat: 0,
    },
    {
      kind: "act",
      name: "Rising action",
      actKind: "rising",
      beats: 28,
      t0: 0.42,
      t1: 0.82,
      hue: 292,
      chords: [0, 3, 4, 5, 0, 3, 4, 5],
      startBeat: 0,
    },
    {
      kind: "act",
      name: "Climax",
      actKind: "climax",
      beats: 20,
      t0: 0.9,
      t1: 1.0,
      hue: 318,
      chords: [0, 5, 4, 4, 0, 5, 4, 4],
      startBeat: 0,
    },
    {
      kind: "act",
      name: "Falling action",
      actKind: "falling",
      beats: 22,
      t0: 0.72,
      t1: 0.34,
      hue: 262,
      chords: [3, 0, 5, 4, 3, 0, 5, 4],
      startBeat: 0,
    },
    {
      kind: "act",
      name: "Resolution",
      actKind: "resolution",
      beats: 28,
      t0: 0.3,
      t1: 0.08,
      hue: 246,
      chords: [0, 3, 0, 0, 0, 3, 0, 0],
      startBeat: 0,
    },
  ];
  return acts;
}

// The director: choose a bridge for the seam between two acts from the tension
// delta into the next act. Rule-based — no LLM, no API calls — but modelled on
// JenBridge's idea of selecting a transition STYLE per narrative shift.
export function chooseBridge(fromT: number, toT: number, toKind: ActKind): BridgeKind {
  const d = toT - fromT;
  if (toKind === "climax") return "suspended"; // withhold, then release into the climax
  if (d > 0.18) return "swell"; // building momentum -> crescendo
  if (d < -0.18) return "ritardando"; // big release -> slow, decay
  return "pivot"; // modest shift -> a borrowed pivot chord
}

const BRIDGE_BEATS: Record<BridgeKind, number> = {
  swell: 6,
  suspended: 6,
  ritardando: 8,
  pivot: 4,
};

const BRIDGE_HUE: Record<BridgeKind, number> = {
  swell: 300,
  suspended: 330,
  ritardando: 236,
  pivot: 210,
};

// Assemble acts + director-chosen bridges into one flat timeline.
function buildTimeline(): Segment[] {
  const acts = buildActs();
  const timeline: Segment[] = [];
  for (let i = 0; i < acts.length; i++) {
    timeline.push(acts[i]);
    if (i < acts.length - 1) {
      const next = acts[i + 1];
      const bk = chooseBridge(acts[i].t1, next.t0, next.actKind as ActKind);
      timeline.push({
        kind: "bridge",
        name: bk,
        bridgeKind: bk,
        beats: BRIDGE_BEATS[bk],
        t0: acts[i].t1,
        t1: next.t0,
        hue: BRIDGE_HUE[bk],
        chords: [],
        startBeat: 0,
      });
    }
  }
  // fill absolute start beats
  let b = 0;
  for (const seg of timeline) {
    seg.startBeat = b;
    b += seg.beats;
  }
  return timeline;
}

// tension shape within a segment
function tensionAt(seg: Segment, p: number): number {
  const c = clamp(p);
  if (seg.kind === "bridge") {
    switch (seg.bridgeKind) {
      case "swell":
        return lerp(seg.t0, seg.t1, Math.pow(c, 1.8)); // surge late
      case "suspended":
        return lerp(seg.t0, seg.t1, smoothstep(c));
      case "ritardando":
        return lerp(seg.t0, seg.t1, Math.pow(c, 0.6)); // fall fast then ease
      case "pivot":
        return lerp(seg.t0, seg.t1, smoothstep(c));
    }
  }
  switch (seg.actKind) {
    case "rising":
      return lerp(seg.t0, seg.t1, Math.pow(c, 1.6));
    case "climax":
      return lerp(seg.t0, seg.t1, smoothstep(c));
    case "falling":
      return lerp(seg.t0, seg.t1, Math.pow(c, 0.7));
    default:
      return lerp(seg.t0, seg.t1, smoothstep(c));
  }
}

export class ReverieEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private padBus: GainNode;
  private voiceBus: GainNode;
  private noiseBuf: AudioBuffer;
  private rng = mulberry32(0x1824);
  private mood: MoodConfig;

  private timeline = buildTimeline();
  private totalBeats: number;
  private beatIndex = 0;
  private nextBeatTime = 0;
  private startTime = 0;
  private timer: number | null = null;
  private running = false;
  private finished = false;
  private muted = false;

  // viz event timestamps (absolute ctx time, scheduled ahead)
  private impactTimes: number[] = [];
  private motifTimes: number[] = [];
  private actStarts: { beat: number; name: string }[] = [];

  onFinished: (() => void) | null = null;

  constructor(ctx: AudioContext, mood: MoodKey) {
    this.ctx = ctx;
    this.mood = MOODS[mood];
    this.totalBeats = this.timeline.reduce((s, x) => s + x.beats, 0);

    // note where each ACT begins for the chapter-title cards
    for (const seg of this.timeline) {
      if (seg.kind === "act") this.actStarts.push({ beat: seg.startBeat, name: seg.name });
    }

    // master safety chain: sources -> comp -> master(<=0.16) -> destination
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 8;
    this.comp.ratio.value = 12;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.25;
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    this.padBus = ctx.createGain();
    this.padBus.gain.value = 1;
    this.padBus.connect(this.comp);
    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = 1;
    this.voiceBus.connect(this.comp);

    // one deterministic noise buffer, reused for swells / cymbals / timpani skin
    const len = Math.floor(ctx.sampleRate * 2.5);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = this.rng() * 2 - 1;
  }

  // ── transport ──────────────────────────────────────────────────────────────
  start() {
    if (this.running) return;
    this.running = true;
    this.finished = false;
    const t = this.ctx.currentTime + 0.15;
    this.startTime = t;
    this.nextBeatTime = t;
    this.beatIndex = 0;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.linearRampToValueAtTime(CEILING, t + 1.2);
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
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), t);
    this.master.gain.linearRampToValueAtTime(0.0001, t + 0.12);
  }

  setMuted(m: boolean) {
    this.muted = m;
    const t = this.ctx.currentTime;
    const target = m ? 0.0001 : CEILING;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), t);
    this.master.gain.linearRampToValueAtTime(target, t + 0.08);
  }

  now(): number {
    return this.ctx.currentTime;
  }

  getSegments(): Segment[] {
    return this.timeline;
  }

  getMood(): MoodConfig {
    return this.mood;
  }

  tensionForSegment(seg: Segment, p: number): number {
    return tensionAt(seg, p);
  }

  // ── the look-ahead scheduler ────────────────────────────────────────────────
  private scheduler() {
    if (!this.running) return;
    const ctx = this.ctx;
    while (this.nextBeatTime < ctx.currentTime + SCHEDULE_AHEAD) {
      if (this.beatIndex >= this.totalBeats) {
        this.finish();
        return;
      }
      this.scheduleBeat(this.beatIndex, this.nextBeatTime);
      this.beatIndex++;
      this.nextBeatTime += SEC_BEAT;
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
    this.master.gain.linearRampToValueAtTime(0.0001, t + 3.0);
    this.onFinished?.();
  }

  private segmentForBeat(beat: number): { seg: Segment; local: number } {
    let seg = this.timeline[this.timeline.length - 1];
    for (const s of this.timeline) {
      if (beat < s.startBeat + s.beats) {
        seg = s;
        break;
      }
    }
    return { seg, local: beat - seg.startBeat };
  }

  private scheduleBeat(beat: number, t: number) {
    const { seg, local } = this.segmentForBeat(beat);
    const p = seg.beats > 0 ? local / seg.beats : 0;
    const tension = tensionAt(seg, p);

    // segment-entry gestures (motif statements, bridge renders)
    if (local === 0) this.onSegmentStart(seg, t);

    if (seg.kind === "act") {
      // string-pad chord bed, retriggered per bar
      if (local % BEATS_PER_BAR === 0) {
        const barIdx = Math.floor(local / BEATS_PER_BAR);
        const deg = seg.chords[barIdx % seg.chords.length];
        const dur = SEC_BEAT * BEATS_PER_BAR;
        this.playPad(t, deg, dur, tension, seg.actKind === "resolution");
      }
      // low ostinato/pulse — subdivides (intensifies) with tension
      this.playOstinato(t, tension);
      // climax: timpani impacts on the downbeat of each bar
      if (seg.actKind === "climax" && local % BEATS_PER_BAR === 0) {
        this.playTimpani(t, 0.9);
      }
    } else {
      // bridges keep the pulse alive only when building momentum (swell)
      if (seg.bridgeKind === "swell") this.playOstinato(t, tension);
    }
  }

  // ── segment-entry gestures ───────────────────────────────────────────────────
  private onSegmentStart(seg: Segment, t: number) {
    if (seg.kind === "act") {
      switch (seg.actKind) {
        case "establishing":
          // state the leitmotif, soft, mid register
          this.playMotif(t + SEC_BEAT * 4, "state");
          break;
        case "climax":
          // the leitmotif returns transformed: up an octave, full brass
          this.playMotif(t + SEC_BEAT, "climax");
          break;
        case "resolution":
          // settle: the motif slow and low, one last time
          this.playMotif(t + SEC_BEAT * 3, "resolution");
          break;
      }
      return;
    }
    // render the director's bridge
    const span = seg.beats * SEC_BEAT;
    switch (seg.bridgeKind) {
      case "swell":
        this.renderSwell(t, span);
        break;
      case "suspended":
        this.renderSuspended(t, span);
        break;
      case "ritardando":
        this.renderRitardando(t, span);
        break;
      case "pivot":
        this.renderPivot(t, span);
        break;
    }
  }

  // ── harmony helpers ──────────────────────────────────────────────────────────
  private chordNotes(degree: number, octave = 0): number[] {
    const { root, scale } = this.mood;
    const out: number[] = [];
    for (const step of [0, 2, 4]) {
      const di = degree + step;
      const oct = Math.floor(di / 7) + octave;
      const pc = scale[((di % 7) + 7) % 7];
      out.push(root + oct * 12 + pc);
    }
    return out;
  }

  private degreeToMidi(degree: number, octave = 0): number {
    const { root, scale } = this.mood;
    const oct = Math.floor(degree / 7) + octave;
    const pc = scale[((degree % 7) + 7) % 7];
    return root + oct * 12 + pc;
  }

  // ── instruments ──────────────────────────────────────────────────────────────
  private noiseSource(): AudioBufferSourceNode {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    return n;
  }

  // string-pad bed: detuned oscillator stack through a slow lowpass
  private playPad(t: number, degree: number, dur: number, tension: number, soft: boolean) {
    if (this.muted) return;
    const ctx = this.ctx;
    const notes = this.chordNotes(degree, 1); // up an octave from the tonic bass
    const cutoff = 320 + tension * tension * 2600 * (0.6 + this.mood.bright * 0.6);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(cutoff * 0.7, t);
    lp.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.5);
    lp.Q.value = 0.6;
    const g = ctx.createGain();
    const peak = (soft ? 0.05 : 0.075) * (0.6 + tension * 0.5);
    const atk = soft ? dur * 0.4 : dur * 0.22;
    g.gain.setValueAtTime(0.0008, t);
    g.gain.linearRampToValueAtTime(peak, t + atk);
    g.gain.setValueAtTime(peak, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur * 1.02);
    lp.connect(g).connect(this.padBus);
    const detunes = [-7, 0, 6];
    for (const note of notes) {
      const f = mtof(note);
      for (const d of detunes) {
        const o = ctx.createOscillator();
        o.type = this.mood.padType;
        o.frequency.value = f;
        o.detune.value = d;
        const og = ctx.createGain();
        og.gain.value = 1 / (notes.length * detunes.length);
        o.connect(og).connect(lp);
        o.start(t);
        o.stop(t + dur * 1.05);
      }
    }
  }

  // low ostinato/pulse — a soft heartbeat that subdivides as tension rises
  private playOstinato(t: number, tension: number) {
    if (this.muted) return;
    let offsets: number[];
    if (tension < 0.3) offsets = this.beatIndex % 2 === 0 ? [0] : [];
    else if (tension < 0.6) offsets = [0];
    else if (tension < 0.85) offsets = [0, 0.5];
    else offsets = [0, 0.25, 0.5, 0.75];
    const freq = mtof(this.mood.root - 12);
    for (const off of offsets) {
      const at = t + off * SEC_BEAT;
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq;
      const g = ctx.createGain();
      const vel = 0.05 + tension * 0.06;
      g.gain.setValueAtTime(0.0008, at);
      g.gain.linearRampToValueAtTime(vel, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0008, at + 0.24);
      o.connect(g).connect(this.padBus);
      o.start(at);
      o.stop(at + 0.28);
    }
  }

  // the leitmotif — same intervals every time, different voicing per variant
  private playMotif(t: number, variant: "state" | "climax" | "resolution") {
    const octave = variant === "climax" ? 2 : variant === "resolution" ? 0 : 1;
    const timeScale = variant === "resolution" ? 1.5 : 1;
    const type: OscillatorType =
      variant === "climax" ? "sawtooth" : this.mood.leadType;
    const gainPeak = variant === "climax" ? 0.1 : variant === "resolution" ? 0.055 : 0.06;
    let cursor = t;
    for (let i = 0; i < MOTIF_DEGREES.length; i++) {
      const dur = MOTIF_DURS[i] * SEC_BEAT * timeScale;
      const midi = this.degreeToMidi(MOTIF_DEGREES[i], octave);
      this.playLeadNote(cursor, midi, dur, gainPeak, type, variant === "climax");
      this.motifTimes.push(cursor);
      cursor += dur;
    }
  }

  private playLeadNote(
    t: number,
    midi: number,
    dur: number,
    peak: number,
    type: OscillatorType,
    doubled: boolean,
  ) {
    if (this.muted) return;
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1600 + this.mood.bright * 2400;
    lp.Q.value = 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.08, dur * 0.2));
    g.gain.setValueAtTime(peak, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur * 0.98);
    lp.connect(g).connect(this.voiceBus);
    const voices = doubled ? [0, 12] : [0];
    for (const semi of voices) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = mtof(midi + semi);
      const og = ctx.createGain();
      og.gain.value = 1 / voices.length;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + dur);
    }
  }

  // timpani impact for the climax — pitched membrane thump + a little skin noise
  private playTimpani(t: number, vel: number) {
    if (this.muted) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "sine";
    const base = mtof(this.mood.root - 12);
    o.frequency.setValueAtTime(base * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(base, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel * 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.7);
    o.connect(g).connect(this.voiceBus);
    o.start(t);
    o.stop(t + 0.72);
    // skin transient
    const n = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 220;
    bp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vel * 0.05, t);
    ng.gain.exponentialRampToValueAtTime(0.0006, t + 0.09);
    n.connect(bp).connect(ng).connect(this.voiceBus);
    n.start(t);
    n.stop(t + 0.1);
    this.impactTimes.push(t);
  }

  private playCymbalSwell(t: number, span: number, vel: number) {
    if (this.muted) return;
    const ctx = this.ctx;
    const n = this.noiseSource();
    n.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 5200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0006, t);
    g.gain.linearRampToValueAtTime(vel, t + span * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0006, t + span * 1.05);
    n.connect(hp).connect(g).connect(this.voiceBus);
    n.start(t);
    n.stop(t + span * 1.1);
  }

  // ── director bridges ─────────────────────────────────────────────────────────
  // swell: a crescendo riser — filtered-noise sweep + a rising low pad
  private renderSwell(t: number, span: number) {
    if (this.muted) return;
    const ctx = this.ctx;
    const n = this.noiseSource();
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(4200, t + span);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0006, t);
    g.gain.linearRampToValueAtTime(0.08, t + span * 0.92);
    g.gain.exponentialRampToValueAtTime(0.0006, t + span * 1.02);
    n.connect(bp).connect(g).connect(this.voiceBus);
    n.start(t);
    n.stop(t + span * 1.05);
    // a low sustained note swelling up beneath it
    const o = ctx.createOscillator();
    o.type = this.mood.padType;
    o.frequency.value = mtof(this.mood.root);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0008, t);
    og.gain.linearRampToValueAtTime(0.07, t + span * 0.9);
    og.gain.exponentialRampToValueAtTime(0.0008, t + span * 1.02);
    o.connect(og).connect(this.padBus);
    o.start(t);
    o.stop(t + span * 1.05);
  }

  // suspended: hold an unresolved sus chord (root + 4th + 5th, no third) with a
  // slow cymbal swell — the withheld breath before the climax
  private renderSuspended(t: number, span: number) {
    if (this.muted) return;
    const ctx = this.ctx;
    const { root } = this.mood;
    const susNotes = [root, root + 5, root + 7, root + 12];
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900 + this.mood.bright * 1200;
    lp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, t);
    g.gain.linearRampToValueAtTime(0.08, t + span * 0.4);
    g.gain.setValueAtTime(0.08, t + span * 0.86);
    g.gain.exponentialRampToValueAtTime(0.0008, t + span * 1.02);
    lp.connect(g).connect(this.padBus);
    for (const note of susNotes) {
      const o = ctx.createOscillator();
      o.type = this.mood.padType;
      o.frequency.value = mtof(note + 12);
      // slow tremolo to keep the suspension "alive"
      const trem = ctx.createGain();
      trem.gain.value = 1 / susNotes.length;
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 5.5;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.25 / susNotes.length;
      lfo.connect(lfoGain).connect(trem.gain);
      o.connect(trem).connect(lp);
      o.start(t);
      o.stop(t + span * 1.05);
      lfo.start(t);
      lfo.stop(t + span * 1.05);
    }
    this.playCymbalSwell(t, span, 0.045);
  }

  // ritardando: a descending arpeggio that slows and decays into the release
  private renderRitardando(t: number, span: number) {
    if (this.muted) return;
    const degrees = [7, 5, 4, 2, 0]; // descending through the scale
    let cursor = t;
    let step = span / 10; // starts brisk...
    for (let i = 0; i < degrees.length; i++) {
      const midi = this.degreeToMidi(degrees[i], 1);
      const dur = step * 2.4;
      this.playLeadNote(cursor, midi, dur, 0.05, this.mood.leadType, false);
      cursor += step;
      step *= 1.35; // ...and progressively slows (ritardando)
    }
  }

  // pivot: a single sustained borrowed chord (chromatic mediant) that reframes
  // the harmony, then eases into the next act
  private renderPivot(t: number, span: number) {
    if (this.muted) return;
    const ctx = this.ctx;
    const { root } = this.mood;
    // borrowed major-ish triad a major third above the tonic
    const pivotNotes = [root + 4, root + 8, root + 11];
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100 + this.mood.bright * 900;
    lp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, t);
    g.gain.linearRampToValueAtTime(0.07, t + span * 0.3);
    g.gain.setValueAtTime(0.07, t + span * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0008, t + span * 1.02);
    lp.connect(g).connect(this.padBus);
    for (const note of pivotNotes) {
      const o = ctx.createOscillator();
      o.type = this.mood.padType;
      o.frequency.value = mtof(note + 12);
      const og = ctx.createGain();
      og.gain.value = 1 / pivotNotes.length;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + span * 1.05);
    }
  }

  // ── viz snapshot ─────────────────────────────────────────────────────────────
  snapshot(): Snapshot {
    const now = this.ctx.currentTime;
    const elapsed = Math.max(0, now - this.startTime);
    const beatF = elapsed / SEC_BEAT;
    const curBeat = clamp(beatF, 0, this.totalBeats);
    const { seg } = this.segmentForBeat(Math.min(this.totalBeats - 1, Math.floor(curBeat)));
    const pLocal = seg.beats > 0 ? clamp((curBeat - seg.startBeat) / seg.beats) : 0;
    const tension = this.running || this.finished ? tensionAt(seg, pLocal) : seg.t0;

    // find the act this segment belongs to (bridges lead into the next act)
    let actLabel = seg.name;
    if (seg.kind === "bridge") {
      const idx = this.timeline.indexOf(seg);
      for (let i = idx + 1; i < this.timeline.length; i++) {
        if (this.timeline[i].kind === "act") {
          actLabel = this.timeline[i].name;
          break;
        }
      }
    }

    const playhead = this.totalBeats > 0 ? clamp(curBeat / this.totalBeats) : 0;
    const beatPhase = this.running ? ((beatF % 1) + 1) % 1 : 0;

    // decaying impact flash (timpani)
    this.impactTimes = this.impactTimes.filter((x) => now - x < 1.2);
    let impact = 0;
    for (const x of this.impactTimes) {
      if (now >= x) impact = Math.max(impact, clamp(1 - (now - x) / 0.9));
    }

    // leitmotif glow
    this.motifTimes = this.motifTimes.filter((x) => now - x < 1.5);
    let motifPulse = 0;
    for (const x of this.motifTimes) {
      if (now >= x) motifPulse = Math.max(motifPulse, clamp(1 - (now - x) / 0.7));
    }

    // slow climax bloom from tension (no strobe)
    const bloom = smoothstep(clamp((tension - 0.74) / 0.26));

    // chapter title card: fade in/out over the first ~3.6s of each act
    let cardAlpha = 0;
    let cardText = "";
    if (this.running || this.finished) {
      for (let i = this.actStarts.length - 1; i >= 0; i--) {
        const a = this.actStarts[i];
        const at = this.startTime + a.beat * SEC_BEAT;
        if (now >= at) {
          const dt = now - at;
          cardText = a.name;
          const rise = clamp(dt / 0.7);
          const fall = clamp(1 - (dt - 2.6) / 1.1);
          cardAlpha = smoothstep(rise) * clamp(fall);
          break;
        }
      }
    }

    return {
      running: this.running,
      finished: this.finished,
      segIndex: this.timeline.indexOf(seg),
      segName: seg.name,
      segKind: seg.kind,
      actLabel,
      bridgeKind: seg.kind === "bridge" ? (seg.bridgeKind as BridgeKind) : null,
      tension,
      playhead,
      beatPhase,
      impact,
      motifPulse,
      bloom,
      cardAlpha,
      cardText,
    };
  }
}
