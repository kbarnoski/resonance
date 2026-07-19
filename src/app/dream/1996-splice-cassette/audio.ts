// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — Web Audio engine + LOOK-AHEAD SCHEDULER for 1996-splice-cassette.
//
// The transport is driven off AudioContext.currentTime, NOT requestAnimationFrame:
// a setInterval polls every 25 ms and schedules any note onsets that fall inside a
// ~100 ms horizon, sample-accurately. The playhead you SEE is a separate rAF read
// of the same clock. Notes are stored as degrees, so frequency is resolved at
// schedule time via `resolveFreq(note, elapsed)` — that's what lets the recorded
// past re-voice itself as the mode drifts underneath.
//
// Voice: a warm FM pluck (sine carrier + sine modulator, decaying index), a hair
// of pitch glide on attack. Master gain 0.14 → tape "wow" chorus → compressor →
// destination. Never harsh.
// ─────────────────────────────────────────────────────────────────────────────

import { LOOP, type NoteEvent } from "./looper";

const LOOKAHEAD = 0.1; // seconds scheduled ahead of the clock
const TICK_MS = 25; // scheduler poll interval
const MASTER = 0.14; // ≤ 0.16 as required

export interface SpliceEngine {
  epoch: number;
  now(): number;
  elapsed(): number;
  /** Loop phase 0–1 for the visible playhead. */
  loopPhase(): number;
  /** Fire one voice at absolute AudioContext time `when`. */
  playFreq(freq: number, when: number, dur: number, vel: number): void;
  stop(): void;
}

export function createEngine(
  ctx: AudioContext,
  getNotes: () => NoteEvent[],
  resolveFreq: (note: NoteEvent, elapsed: number) => number,
): SpliceEngine {
  const epoch = ctx.currentTime + 0.06;

  // ── Master chain: voices → master → (dry + wow-chorus) → compressor → out ──
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.gain.setTargetAtTime(MASTER, epoch, 0.6); // gentle fade-in, no click

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  comp.attack.value = 0.006;
  comp.release.value = 0.25;

  const dry = ctx.createGain();
  dry.gain.value = 0.78;
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  const wowDelay = ctx.createDelay(0.05);
  wowDelay.delayTime.value = 0.006;

  // Cassette flutter: slow LFO wobbles the delay time.
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.55;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.0019;
  lfo.connect(lfoGain).connect(wowDelay.delayTime);
  lfo.start(epoch);

  master.connect(dry).connect(comp);
  master.connect(wowDelay).connect(wet).connect(comp);
  comp.connect(ctx.destination);

  const voices = new Set<OscillatorNode>();

  function playFreq(freq: number, when: number, dur: number, vel: number): void {
    const t = Math.max(when, ctx.currentTime + 0.001);
    const f = Math.max(20, freq);

    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    const modulator = ctx.createOscillator();
    modulator.type = "sine";
    const modGain = ctx.createGain();
    const amp = ctx.createGain();

    // Gentle glide up into pitch on the attack.
    carrier.frequency.setValueAtTime(f * 0.986, t);
    carrier.frequency.exponentialRampToValueAtTime(f, t + 0.035);
    modulator.frequency.setValueAtTime(f * 2, t);

    // FM index decays — that's the "pluck".
    modGain.gain.setValueAtTime(f * 2.4, t);
    modGain.gain.exponentialRampToValueAtTime(f * 0.12, t + dur * 0.8);

    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.03, vel), t + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    modulator.connect(modGain).connect(carrier.frequency);
    carrier.connect(amp).connect(master);

    carrier.start(t);
    modulator.start(t);
    const end = t + dur + 0.06;
    carrier.stop(end);
    modulator.stop(end);

    voices.add(carrier);
    carrier.onended = () => voices.delete(carrier);
  }

  // ── Look-ahead scheduler (time-based cursor, robust to live edits) ──────────
  let cursor = epoch;
  const timer = window.setInterval(() => {
    const now = ctx.currentTime;
    const horizon = now + LOOKAHEAD;
    if (cursor < now) cursor = now; // recover if the tab was backgrounded
    const notes = getNotes();
    let guard = 0;
    while (cursor < horizon && guard++ < 128) {
      const iterStart = epoch + Math.floor((cursor - epoch) / LOOP) * LOOP;
      const iterEnd = iterStart + LOOP;
      const segEnd = Math.min(horizon, iterEnd);
      const from = cursor - iterStart;
      const to = segEnd - iterStart;
      for (const n of notes) {
        if (n.t >= from && n.t < to) {
          const when = iterStart + n.t;
          playFreq(resolveFreq(n, when - epoch), when, n.dur, n.vel);
        }
      }
      cursor = segEnd === iterEnd ? iterEnd + 1e-6 : segEnd;
    }
  }, TICK_MS);

  return {
    epoch,
    now: () => ctx.currentTime,
    elapsed: () => ctx.currentTime - epoch,
    loopPhase: () => {
      const e = ctx.currentTime - epoch;
      return (((e % LOOP) + LOOP) % LOOP) / LOOP;
    },
    playFreq,
    stop: () => {
      window.clearInterval(timer);
      try {
        lfo.stop();
      } catch {
        /* already stopped */
      }
      voices.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      });
      voices.clear();
      try {
        master.disconnect();
        comp.disconnect();
        dry.disconnect();
        wet.disconnect();
        wowDelay.disconnect();
        lfoGain.disconnect();
      } catch {
        /* nodes already gone */
      }
    },
  };
}
