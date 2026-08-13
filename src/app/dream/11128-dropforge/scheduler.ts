// ─────────────────────────────────────────────────────────────────────────────
// scheduler.ts — a small look-ahead audio scheduler (~25 ms tick, ~100 ms
// look-ahead) that walks 16th notes against AudioContext.currentTime and, at
// each step, asks the arc what section we're in and schedules the right voices.
// This is what keeps the groove tight regardless of main-thread jitter.
// ─────────────────────────────────────────────────────────────────────────────

import type { DropArc } from "./arc";
import type { DropForgeAudio } from "./synth";

const LOOKAHEAD = 0.1; // seconds scheduled ahead
const TICK_MS = 25; // scheduler wakeup interval

export interface Scheduler {
  start(): void;
  stop(): void;
}

export function makeScheduler(
  ctx: AudioContext,
  arc: DropArc,
  audio: DropForgeAudio,
): Scheduler {
  let step = 0;
  let nextNoteTime = 0;
  let timer: number | null = null;

  function scheduleStep(s: number, time: number): void {
    arc.tick(s);
    const sec = arc.section;
    const p = arc.progress;
    const energy = arc.biasedTarget;
    const inBar = s % 16;
    const params = arc.params;

    // ── the drop downbeat: a big earned impact ────────────────────────────────
    if (arc.entered === "drop") {
      audio.scheduleImpact(time, 0.9);
    }

    // ── riser: only during the build, climbing with progress ──────────────────
    audio.setRiser(time, p, sec === "build");

    // ── break pad: sustained suspension while the kick is gone ─────────────────
    const padLevel = sec === "break" ? 0.22 : sec === "intro" ? 0.08 : 0;
    audio.setPad(time, arc.degreeHz(0, 1), padLevel);

    // ── KICK — four on the floor, everywhere except intro/break ───────────────
    const kickOn = sec === "build" || sec === "drop" || sec === "sustain" || sec === "decay";
    if (kickOn && inBar % 4 === 0) {
      const kg = 0.85 * (0.6 + 0.4 * Math.min(1, energy + 0.3));
      audio.scheduleKick(time, kg);
      audio.duck(time, 0.32, arc.stepDur * 3.2);
    }

    // ── BASS — off-beat pluck, cutoff rises with tension ──────────────────────
    const bassOn = sec === "build" || sec === "drop" || sec === "sustain" || sec === "decay";
    if (bassOn && inBar % 4 === 2) {
      const cutoff = 140 + energy * 900;
      const g = 0.34 * (sec === "build" ? 0.5 + p * 0.5 : 1);
      audio.scheduleBass(time, arc.rootHz * 2, arc.stepDur * 1.8, g, cutoff);
    }

    // ── SUB — arrives only AT the drop / sustain ──────────────────────────────
    if ((sec === "drop" || sec === "sustain") && inBar % 4 === 0) {
      audio.scheduleSub(time, arc.rootHz, arc.stepDur * 3.4, 0.4);
    }

    // ── LEAD — the mutating motif, filtered low in build, open in the drop ────
    const leadOn = sec === "build" || sec === "drop" || sec === "sustain";
    if (leadOn && inBar % 2 === 0) {
      const motif = params.motif;
      const mi = Math.floor(s / 2) % motif.length;
      const degree = motif[mi];
      const oct = sec === "drop" || sec === "sustain" ? 2 : 1;
      const cutoff = 320 + energy * 6200;
      const g = 0.16 * (sec === "build" ? 0.4 + p * 0.6 : 1);
      audio.scheduleLead(time, arc.degreeHz(degree, oct), arc.stepDur * 1.7, g, cutoff);
    }

    // ── SNARE / CLAP — backbeat + accelerating build roll ─────────────────────
    if (sec === "drop" || sec === "sustain") {
      if (inBar === 4 || inBar === 12) audio.scheduleSnare(time, 0.34, energy);
    }
    if (sec === "build") {
      // roll subdivision tightens as the build progresses → 8th → 16th
      const div = p < 0.35 ? 4 : p < 0.6 ? 2 : 1;
      if (s % div === 0) {
        const g = 0.1 + p * 0.28 * params.grooveDensity;
        audio.scheduleSnare(time, g, p);
      }
    }
    if (sec === "decay" && (inBar === 4 || inBar === 12)) {
      audio.scheduleSnare(time, 0.34 * (1 - p * 0.6), energy);
    }
  }

  function run(): void {
    while (nextNoteTime < ctx.currentTime + LOOKAHEAD) {
      scheduleStep(step, nextNoteTime);
      nextNoteTime += arc.stepDur;
      step++;
    }
    timer = window.setTimeout(run, TICK_MS);
  }

  return {
    start() {
      step = 0;
      nextNoteTime = ctx.currentTime + 0.12;
      run();
    },
    stop() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
