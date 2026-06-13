// audio.ts — Web Audio engine for Spoken Spell
// Oscillator-based voices, ADSR envelopes, look-ahead scheduler, drone pad, dynamics.

import { midiToHz, type Timbre } from "./text-music";

// ─── Constants ────────────────────────────────────────────────────────────────
export const BPM = 100;
export const BEAT_S = 60 / BPM;           // ~0.60s per beat
const LOOKAHEAD_S = 0.12;                 // schedule this far ahead
const SCHEDULE_INTERVAL_MS = 50;          // scheduler pump interval

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ScheduledNote {
  pitchMidi: number;
  durationBeats: number;
  accent: number;
  timbre: Timbre;
  /** audioCtx.currentTime when this note should fire */
  startTime: number;
}

export interface LoopVoice {
  notes: ScheduledNote[];
  /** beat index within the loop */
  beatIndex: number;
  /** audioCtx.currentTime of the next note trigger */
  nextTime: number;
  gainValue: number;  // loop voices fade to ~0.25 of live
}

// ─── Engine state (plain object — no React hooks here) ────────────────────────
export interface AudioEngine {
  ctx: AudioContext;
  masterGain: GainNode;
  loopVoices: LoopVoice[];
  schedulerInterval: ReturnType<typeof setInterval> | null;
  /** pending live notes queue (filled by outer code, consumed by scheduler) */
  liveQueue: ScheduledNote[];
  /** time of next live note */
  liveNextTime: number;
  /** callback fired when a note fires (for visual sync) */
  onNotePlay: ((note: ScheduledNote) => void) | null;
}

// ─── Build engine (call inside user gesture) ──────────────────────────────────
export function buildAudioEngine(): AudioEngine {
  const ctx = new AudioContext();

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.0, ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(0.75, ctx.currentTime + 1.5);

  const lpFilter = ctx.createBiquadFilter();
  lpFilter.type = "lowpass";
  lpFilter.frequency.value = 7000;
  lpFilter.Q.value = 0.7;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-10, ctx.currentTime);
  compressor.knee.setValueAtTime(6, ctx.currentTime);
  compressor.ratio.setValueAtTime(12, ctx.currentTime);
  compressor.attack.setValueAtTime(0.003, ctx.currentTime);
  compressor.release.setValueAtTime(0.25, ctx.currentTime);

  masterGain.connect(lpFilter);
  lpFilter.connect(compressor);
  compressor.connect(ctx.destination);

  // ── Drone pad: root D3 (147 Hz) + A3 (fifth, 220 Hz) ─────────────────────
  makeDronePad(ctx, masterGain);

  const engine: AudioEngine = {
    ctx,
    masterGain,
    loopVoices: [],
    schedulerInterval: null,
    liveQueue: [],
    liveNextTime: ctx.currentTime + 0.2,
    onNotePlay: null,
  };

  // Start scheduler pump
  engine.schedulerInterval = setInterval(() => runScheduler(engine), SCHEDULE_INTERVAL_MS);

  return engine;
}

// ─── Drone pad ────────────────────────────────────────────────────────────────
function makeDronePad(ctx: AudioContext, dest: AudioNode): void {
  const D3 = 146.83;
  const A3 = 220.00;

  for (const freq of [D3, A3]) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.035, ctx.currentTime + 3.5);
    osc.connect(g);
    g.connect(dest);
    osc.start();
  }
}

// ─── Scheduler pump ───────────────────────────────────────────────────────────
function runScheduler(engine: AudioEngine): void {
  const { ctx, liveQueue, loopVoices } = engine;
  const scheduleUntil = ctx.currentTime + LOOKAHEAD_S;

  // -- Schedule live notes --
  while (liveQueue.length > 0 && engine.liveNextTime <= scheduleUntil) {
    const note = liveQueue.shift()!;
    note.startTime = engine.liveNextTime;
    triggerNote(engine, note, 1.0, false);
    if (engine.onNotePlay) engine.onNotePlay(note);
    engine.liveNextTime += note.durationBeats * BEAT_S;
  }

  // -- Schedule loop voices --
  for (const voice of loopVoices) {
    while (voice.nextTime <= scheduleUntil) {
      const note = voice.notes[voice.beatIndex % voice.notes.length];
      const scheduled: ScheduledNote = { ...note, startTime: voice.nextTime };
      triggerNote(engine, scheduled, voice.gainValue, true);
      if (engine.onNotePlay) engine.onNotePlay(scheduled);
      voice.beatIndex++;
      voice.nextTime += note.durationBeats * BEAT_S;
    }
  }
}

// ─── Trigger a single note ────────────────────────────────────────────────────
function triggerNote(
  engine: AudioEngine,
  note: ScheduledNote,
  gainMult: number,
  isLoop: boolean
): void {
  const { ctx, masterGain } = engine;
  const hz = midiToHz(note.pitchMidi);
  const t = note.startTime;
  const dur = note.durationBeats * BEAT_S;
  const gain = note.accent * gainMult * (isLoop ? 0.28 : 0.55);

  if (note.timbre === "pluck") {
    triggerPluck(ctx, masterGain, hz, t, dur, gain);
  } else {
    triggerSustain(ctx, masterGain, hz, t, dur, gain);
  }
}

// ─── Sustain voice (triangle osc + ADSR) ─────────────────────────────────────
function triggerSustain(
  ctx: AudioContext,
  dest: AudioNode,
  hz: number,
  t: number,
  dur: number,
  peakGain: number
): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(hz, t);

  const attack = 0.06;
  const release = Math.min(dur * 0.4, 0.4);
  const sustain = Math.max(dur - attack - release, 0.01);

  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(peakGain, t + attack);
  env.gain.setValueAtTime(peakGain, t + attack + sustain);
  env.gain.setTargetAtTime(0, t + attack + sustain, release / 3);

  osc.connect(env);
  env.connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.5);
}

// ─── Pluck voice (fast-decay osc + noise burst) ───────────────────────────────
function triggerPluck(
  ctx: AudioContext,
  dest: AudioNode,
  hz: number,
  t: number,
  dur: number,
  peakGain: number
): void {
  // Pitched component (sine, fast decay)
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(hz, t);

  const decayTime = Math.min(dur * 0.7, 0.35);
  env.gain.setValueAtTime(peakGain, t);
  env.gain.setTargetAtTime(0, t, decayTime / 4);

  osc.connect(env);
  env.connect(dest);
  osc.start(t);
  osc.stop(t + decayTime + 0.2);

  // Noise transient (filtered noise burst)
  const bufSize = Math.floor(ctx.sampleRate * 0.08);
  const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = noiseBuf;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = hz * 2;
  noiseFilter.Q.value = 3;

  const noiseEnv = ctx.createGain();
  noiseEnv.gain.setValueAtTime(peakGain * 0.25, t);
  noiseEnv.gain.setTargetAtTime(0, t, 0.02);

  noiseSrc.connect(noiseFilter);
  noiseFilter.connect(noiseEnv);
  noiseEnv.connect(dest);
  noiseSrc.start(t);
  noiseSrc.stop(t + 0.1);
}

// ─── Add a phrase as a loop voice ─────────────────────────────────────────────
export const MAX_LOOP_VOICES = 4;

export function addLoopVoice(engine: AudioEngine, notes: ScheduledNote[]): void {
  if (notes.length === 0) return;

  // Cap at MAX_LOOP_VOICES, drop oldest
  while (engine.loopVoices.length >= MAX_LOOP_VOICES) {
    engine.loopVoices.shift();
  }

  const voice: LoopVoice = {
    notes,
    beatIndex: 0,
    nextTime: engine.ctx.currentTime + 0.1,
    gainValue: 0.6,
  };
  engine.loopVoices.push(voice);
}

// ─── Queue live words for playback ────────────────────────────────────────────
export function enqueueLiveNotes(engine: AudioEngine, notes: ScheduledNote[]): void {
  // If queue is empty, reset next-time to now + tiny buffer
  if (engine.liveQueue.length === 0) {
    engine.liveNextTime = Math.max(engine.liveNextTime, engine.ctx.currentTime + 0.05);
  }
  for (const n of notes) {
    engine.liveQueue.push({ ...n });
  }
}

// ─── Teardown ─────────────────────────────────────────────────────────────────
export function destroyAudioEngine(engine: AudioEngine): void {
  if (engine.schedulerInterval !== null) {
    clearInterval(engine.schedulerInterval);
    engine.schedulerInterval = null;
  }
  engine.ctx.close().catch(() => undefined);
}
