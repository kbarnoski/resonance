/**
 * audio.ts — Web Audio synthesis engine for 526-jazz-room
 *
 * Synthesizes:
 *  - Walking upright bass (triangle + saw blend, fast decay, lowpass)
 *  - Rootless piano comping (stacked sines with bell envelope)
 *  - Brushed drum groove (filtered noise bursts + soft kick)
 *  - User "sit-in" melody voice
 *
 * Uses a lookahead scheduler (25ms interval, 120ms lookahead) for tight timing.
 */

import {
  JAZZ_BLUES_F,
  PHASE_ORDER,
  PHASE_CONFIGS,
  HEAD_MELODY,
  PIANO_MOTIFS,
  midiToHz,
  bassRoot,
  pianoRoot,
  chooseSmoothVoicing,
  makeWalkingBar,
  swingTime,
} from "./jazz";

import type { Phase, Voicing } from "./jazz";

// ── Types ────────────────────────────────────────────────────────────────────

export interface TrioEvent {
  type: "bass" | "piano" | "drum" | "melody" | "user";
  time: number;        // audioCtx.currentTime when it fires
  midi?: number;
  velocity: number;    // 0–1
  chord?: string;
  phase?: Phase;
}

export type EventCallback = (evt: TrioEvent) => void;

// ── JazzEngine ───────────────────────────────────────────────────────────────

export class JazzEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;

  // Scheduler state
  private schedulerInterval: ReturnType<typeof setInterval> | null = null;
  private lookahead = 0.12;      // seconds
  private scheduleInterval = 25; // ms

  // Musical position
  private nextBarTime = 0;
  private currentBar = 0;       // 0–11 within 12-bar form
  private currentChorus = 0;
  private currentPhaseIdx = 0;
  private chorussesInPhase = 0;

  // Voice-leading state
  private lastVoicing: Voicing | null = null;

  // Callbacks for visual sync
  private eventCb: EventCallback | null = null;

  // BPM
  private bpm = 132;

  // Playing flag
  private playing = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    // Master gain
    this.master = ctx.createGain();
    this.master.gain.value = 0.75;

    // Brick-wall limiter
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 2;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.05;

    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);
  }

  setEventCallback(cb: EventCallback) {
    this.eventCb = cb;
  }

  start() {
    if (this.playing) return;
    this.playing = true;
    this.nextBarTime = this.ctx.currentTime + 0.05;
    this.currentBar = 0;
    this.currentChorus = 0;
    this.currentPhaseIdx = 0;
    this.chorussesInPhase = 0;
    this.lastVoicing = null;
    this.schedulerInterval = setInterval(() => this.runScheduler(), this.scheduleInterval);
  }

  stop() {
    this.playing = false;
    if (this.schedulerInterval !== null) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }

  get currentPhase(): Phase {
    return PHASE_ORDER[this.currentPhaseIdx] ?? "head-out";
  }

  get barsTotal(): number {
    return this.currentChorus * 12 + this.currentBar;
  }

  playUserNote(midi: number) {
    const t = this.ctx.currentTime + 0.01;
    this.scheduleUserNote(midi, 0.8, t, 0.6);
    this.eventCb?.({ type: "user", time: t, midi, velocity: 0.8 });
  }

  // ── Scheduler ───────────────────────────────────────────────────────────────

  private runScheduler() {
    const horizon = this.ctx.currentTime + this.lookahead;
    while (this.nextBarTime < horizon) {
      this.scheduleBar(this.nextBarTime);
      this.advanceBar();
    }
  }

  private advanceBar() {
    const phase = this.currentPhase;
    const cfg = PHASE_CONFIGS[phase];
    const beatDur = 60 / this.bpm;
    this.nextBarTime += 4 * beatDur;

    this.currentBar++;
    if (this.currentBar >= 12) {
      this.currentBar = 0;
      this.currentChorus++;
      this.chorussesInPhase++;
      if (this.chorussesInPhase >= cfg.choruses) {
        this.chorussesInPhase = 0;
        this.currentPhaseIdx = Math.min(this.currentPhaseIdx + 1, PHASE_ORDER.length - 1);
        // Slight tempo changes per phase
        this.applyPhaseTempo(PHASE_ORDER[this.currentPhaseIdx] ?? "head-out");
      }
    }
  }

  private applyPhaseTempo(phase: Phase) {
    const tempos: Record<Phase, number> = {
      "head":        132,
      "piano-solo":  138,
      "bass-solo":   124,
      "trade-fours": 140,
      "head-out":    132,
    };
    this.bpm = tempos[phase] ?? 132;
  }

  // ── Bar scheduling ───────────────────────────────────────────────────────────

  private scheduleBar(barStart: number) {
    const chord = JAZZ_BLUES_F[this.currentBar];
    const nextChord = JAZZ_BLUES_F[(this.currentBar + 1) % 12];
    const phase = this.currentPhase;
    const cfg = PHASE_CONFIGS[phase];

    // Notify chord change for visuals
    this.eventCb?.({
      type: "piano",
      time: barStart,
      velocity: 0,
      chord: chord.name,
      phase,
    });

    // Walking bass (every bar when bassActivity high enough)
    if (Math.random() < cfg.bassActivity) {
      const bassNotes = makeWalkingBar(chord, bassRoot(chord), bassRoot(nextChord));
      bassNotes.forEach((midi, beat) => {
        const t = barStart + swingTime(beat, 0, this.bpm);
        const vel = 0.55 + Math.random() * 0.25;
        this.scheduleBassNote(midi, vel, t, (60 / this.bpm) * 0.85);
        this.eventCb?.({ type: "bass", time: t, midi, velocity: vel });
      });
    }

    // Piano comping — rootless voicing on beat 1, possible ghost on beat 3
    if (Math.random() < cfg.pianoActivity) {
      const voicing = chooseSmoothVoicing(this.lastVoicing, chord, pianoRoot(chord));
      this.lastVoicing = voicing;
      const beat1 = barStart + swingTime(0, 0, this.bpm);
      const vel = 0.45 + Math.random() * 0.3;
      this.schedulePianoVoicing(voicing.notes, vel, beat1, (60 / this.bpm) * 1.8);
      this.eventCb?.({ type: "piano", time: beat1, velocity: vel, chord: chord.name, phase });

      // Ghost chord on beat 3 (softer)
      if (Math.random() < 0.55 * cfg.pianoActivity) {
        const beat3 = barStart + swingTime(2, 0, this.bpm);
        this.schedulePianoVoicing(voicing.notes, vel * 0.55, beat3, (60 / this.bpm) * 1.2);
        this.eventCb?.({ type: "piano", time: beat3, velocity: vel * 0.55, chord: chord.name, phase });
      }
    }

    // Drums — brush pattern
    if (Math.random() < cfg.drumsActivity) {
      this.scheduleDrumBar(barStart, cfg.drumsActivity);
      // Emit snare-hit events on beat 2 and beat 4 for visual sync
      const b2 = barStart + swingTime(1, 0, this.bpm);
      const b4 = barStart + swingTime(3, 0, this.bpm);
      this.eventCb?.({ type: "drum", time: b2, velocity: 0.38 });
      this.eventCb?.({ type: "drum", time: b4, velocity: 0.35 });
    }

    // Head melody during head / head-out
    if (cfg.melodyOn && this.currentBar < HEAD_MELODY.length) {
      const barMelody = HEAD_MELODY[this.currentBar];
      barMelody.forEach(({ beat, midi, dur }) => {
        const t = barStart + swingTime(Math.floor(beat), beat % 1 > 0.3 ? 1 : 0, this.bpm);
        this.scheduleMelodyNote(midi, 0.5, t, dur * (60 / this.bpm) * 2);
        this.eventCb?.({ type: "melody", time: t, midi, velocity: 0.5 });
      });
    }

    // Piano solo during piano-solo phase
    if (phase === "piano-solo" && Math.random() < 0.8) {
      const motif = PIANO_MOTIFS[Math.floor(Math.random() * PIANO_MOTIFS.length)];
      const rootMidi = pianoRoot(chord) + 12; // solo an octave above voicings
      motif.forEach(({ offset, beat, dur }) => {
        const t = barStart + swingTime(Math.floor(beat), beat % 1 > 0.3 ? 1 : 0, this.bpm);
        const noteMidi = rootMidi + offset;
        this.scheduleMelodyNote(noteMidi, 0.45 + Math.random() * 0.3, t, dur * (60 / this.bpm) * 2.5);
        this.eventCb?.({ type: "melody", time: t, midi: noteMidi, velocity: 0.5 });
      });
    }

    // Bass solo during bass-solo phase — arpeggiate up the chord
    if (phase === "bass-solo" && Math.random() < 0.9) {
      const chordMidis = chord.tones.map(t => {
        let m = bassRoot(chord) + t;
        while (m < 36) m += 12;
        while (m > 55) m -= 12;
        return m;
      });
      const solo = [...chordMidis, chordMidis[0] + 12];
      solo.forEach((midi, i) => {
        const beat = i;
        if (beat >= 4) return;
        const t = barStart + swingTime(beat, 0, this.bpm);
        this.scheduleBassNote(midi, 0.7, t, (60 / this.bpm) * 0.9);
        this.eventCb?.({ type: "bass", time: t, midi, velocity: 0.7 });
      });
    }

    // Trade fours — alternate piano and drums every 4 bars
    if (phase === "trade-fours") {
      const fourBar = this.currentBar % 4;
      if (fourBar === 0) {
        // First 4 bars of "four": piano improvises
        const motif = PIANO_MOTIFS[Math.floor(Math.random() * PIANO_MOTIFS.length)];
        const rootMidi = pianoRoot(chord) + 12;
        motif.forEach(({ offset, beat, dur }) => {
          const t = barStart + swingTime(Math.floor(beat), beat % 1 > 0.3 ? 1 : 0, this.bpm);
          this.scheduleMelodyNote(rootMidi + offset, 0.5, t, dur * (60 / this.bpm) * 2);
        });
      }
    }
  }

  // ── Synth voices ─────────────────────────────────────────────────────────────

  private scheduleBassNote(midi: number, vel: number, t: number, dur: number) {
    const ctx = this.ctx;
    const freq = midiToHz(midi);

    // Triangle + saw blend through lowpass
    const tri = ctx.createOscillator();
    const saw = ctx.createOscillator();
    const blendGain = ctx.createGain();
    const sawGain = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    const env = ctx.createGain();

    tri.type = "triangle";
    tri.frequency.value = freq;
    saw.type = "sawtooth";
    saw.frequency.value = freq;

    blendGain.gain.value = 1.0;
    sawGain.gain.value = 0.22;

    lp.type = "lowpass";
    lp.frequency.value = 700;
    lp.Q.value = 0.8;

    tri.connect(blendGain);
    saw.connect(sawGain);
    blendGain.connect(lp);
    sawGain.connect(lp);
    lp.connect(env);
    env.connect(this.master);

    // Plucked string envelope: fast attack, exponential decay
    const peakVel = vel * 0.55;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peakVel, t + 0.012);
    env.gain.exponentialRampToValueAtTime(peakVel * 0.35, t + dur * 0.4);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    tri.start(t);
    saw.start(t);
    tri.stop(t + dur + 0.05);
    saw.stop(t + dur + 0.05);
  }

  private schedulePianoVoicing(notes: number[], vel: number, t: number, dur: number) {
    notes.forEach((midi, i) => {
      // Stagger slightly for realism
      const stagger = i * 0.012;
      this.scheduleElecPianoNote(midi, vel * (0.7 + i * 0.1), t + stagger, dur);
    });
  }

  private scheduleElecPianoNote(midi: number, vel: number, t: number, dur: number) {
    const ctx = this.ctx;
    const freq = midiToHz(midi);

    // FM-like: carrier + modulator for bell-ish Fender Rhodes tone
    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const env = ctx.createGain();
    const lp = ctx.createBiquadFilter();

    carrier.type = "sine";
    carrier.frequency.value = freq;

    mod.type = "sine";
    mod.frequency.value = freq * 7; // Rhodesy upper partial

    modGain.gain.setValueAtTime(freq * 1.5, t);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.15, t + 0.3);

    lp.type = "lowpass";
    lp.frequency.value = 3500;
    lp.Q.value = 0.5;

    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(lp);
    lp.connect(env);
    env.connect(this.master);

    const peakVel = vel * 0.28;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peakVel, t + 0.008);
    env.gain.exponentialRampToValueAtTime(peakVel * 0.6, t + 0.08);
    env.gain.exponentialRampToValueAtTime(peakVel * 0.25, t + dur * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    carrier.start(t);
    mod.start(t);
    carrier.stop(t + dur + 0.1);
    mod.stop(t + dur + 0.1);
  }

  private scheduleDrumBar(barStart: number, activity: number) {
    const bpm = this.bpm;

    // Hi-hat brush on every beat + swing 8ths
    for (let beat = 0; beat < 4; beat++) {
      const t1 = barStart + swingTime(beat, 0, bpm);
      const t2 = barStart + swingTime(beat, 1, bpm);
      this.scheduleBrush(t1, 0.28 + Math.random() * 0.12, "hihat");
      if (Math.random() < 0.7) {
        this.scheduleBrush(t2, 0.14 + Math.random() * 0.08, "hihat");
      }
    }

    // Snare brush on beats 2 and 4
    if (Math.random() < activity) {
      this.scheduleBrush(barStart + swingTime(1, 0, bpm), 0.38, "snare");
      this.scheduleBrush(barStart + swingTime(3, 0, bpm), 0.35, "snare");
    }

    // Soft kick on beat 1 (and sometimes beat 3)
    this.scheduleKick(barStart + swingTime(0, 0, bpm), 0.4);
    if (Math.random() < 0.35 * activity) {
      this.scheduleKick(barStart + swingTime(2, 0, bpm), 0.28);
    }

    // Ride cymbal occasional ding on beat 1 or 3
    if (Math.random() < activity * 0.5) {
      const rideBeat = Math.random() < 0.5 ? 0 : 2;
      this.scheduleRide(barStart + swingTime(rideBeat, 0, bpm), 0.2);
    }
  }

  private scheduleBrush(t: number, vel: number, type: "hihat" | "snare") {
    const ctx = this.ctx;
    const bufSize = ctx.sampleRate * 0.08;
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const bp = ctx.createBiquadFilter();
    bp.type = type === "hihat" ? "highpass" : "bandpass";
    bp.frequency.value = type === "hihat" ? 6000 : 2800;
    bp.Q.value = type === "hihat" ? 0.8 : 2.5;

    const env = ctx.createGain();
    const peakVel = vel * 0.18;
    env.gain.setValueAtTime(peakVel, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + (type === "hihat" ? 0.04 : 0.09));

    src.connect(bp);
    bp.connect(env);
    env.connect(this.master);
    src.start(t);
    src.stop(t + 0.12);
  }

  private scheduleKick(t: number, vel: number) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const lp = ctx.createBiquadFilter();

    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.08);

    lp.type = "lowpass";
    lp.frequency.value = 200;

    env.gain.setValueAtTime(vel * 0.55, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);

    osc.connect(lp);
    lp.connect(env);
    env.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  private scheduleRide(t: number, vel: number) {
    const ctx = this.ctx;
    const bufSize = Math.floor(ctx.sampleRate * 0.6);
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.15));
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 5000;

    const env = ctx.createGain();
    env.gain.setValueAtTime(vel * 0.15, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);

    src.connect(hp);
    hp.connect(env);
    env.connect(this.master);
    src.start(t);
    src.stop(t + 0.65);
  }

  private scheduleMelodyNote(midi: number, vel: number, t: number, dur: number) {
    const ctx = this.ctx;
    const freq = midiToHz(midi);

    // Warm sine + 2nd harmonic for a muted horn-ish melody voice
    const s1 = ctx.createOscillator();
    const s2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    const env = ctx.createGain();
    const lp = ctx.createBiquadFilter();

    s1.type = "sine";
    s1.frequency.value = freq;

    s2.type = "sine";
    s2.frequency.value = freq * 2;
    g2.gain.value = 0.18;

    lp.type = "lowpass";
    lp.frequency.value = 2800;

    s1.connect(env);
    s2.connect(g2);
    g2.connect(env);
    env.connect(lp);
    lp.connect(this.master);

    const peakVel = vel * 0.3;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peakVel, t + 0.025);
    env.gain.setValueAtTime(peakVel, t + dur * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    s1.start(t);
    s2.start(t);
    s1.stop(t + dur + 0.05);
    s2.stop(t + dur + 0.05);
  }

  private scheduleUserNote(midi: number, vel: number, t: number, dur: number) {
    const ctx = this.ctx;
    const freq = midiToHz(midi);

    // Breathy flute-ish for user — sine + noise tint
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const lp = ctx.createBiquadFilter();

    osc.type = "triangle";
    osc.frequency.value = freq;

    lp.type = "lowpass";
    lp.frequency.value = 3200;

    osc.connect(lp);
    lp.connect(env);
    env.connect(this.master);

    const peakVel = vel * 0.35;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peakVel, t + 0.02);
    env.gain.exponentialRampToValueAtTime(peakVel * 0.7, t + dur * 0.5);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}
