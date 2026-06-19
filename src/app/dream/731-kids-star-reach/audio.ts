// audio.ts — Web Audio bell-cluster + always-on drone bed for Star Reach
//
// Kids-safe master chain (REQUIRED):
//   voices → masterGain(≤0.3) → lowpass(≤7500Hz)
//          → DynamicsCompressor(threshold −10, ratio 20:1) → destination
//
// Sound design:
//   • Always-on soft ambient drone bed (open fifth) — never silent.
//   • Closing a hand (fist) rings a small CLUSTER of soft pentatonic bells.
//   • Opening wide spills a rising glissando arc of bells.
//   • Hand height picks register (low = warm/low octave, high = bright/high).
//   • Everything is pentatonic / just-consonant — nothing can sound "wrong".
//   • No loud transients: every bell has a slow attack & gentle ceiling.

// ─────────────────────────────────────────────────────────────────────────────
// Musical material — a justly-tuned pentatonic over a low drone root.
// ─────────────────────────────────────────────────────────────────────────────

// Base root ~A2 (110 Hz). Pentatonic ratios (major pentatonic, just intonation):
// 1/1, 9/8, 5/4, 3/2, 5/3  → do re mi sol la
const ROOT = 110; // Hz (A2) — drone bed root
const PENTA_RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];

// Build a ladder of pentatonic frequencies spanning several octaves so that
// "height" can pick a register continuously.
function buildLadder(): number[] {
  const out: number[] = [];
  for (let oct = 0; oct < 5; oct++) {
    for (const r of PENTA_RATIOS) {
      out.push(ROOT * r * Math.pow(2, oct));
    }
  }
  return out.sort((a, b) => a - b);
}
const LADDER = buildLadder();

// Pick a pentatonic frequency near a normalised position (0..1) up the ladder,
// jittered by an index so a cluster lands on distinct, consonant tones.
function ladderFreq(pos01: number, idx: number): number {
  const span = LADDER.length - 1;
  const center = Math.round(pos01 * span);
  // spread cluster members by ±a few scale steps, but stay in-scale
  const offsets = [0, 2, -2, 4, -3, 1, 3, -1];
  const i = Math.max(0, Math.min(span, center + offsets[idx % offsets.length]));
  return LADDER[i];
}

// ─────────────────────────────────────────────────────────────────────────────
// Public interface
// ─────────────────────────────────────────────────────────────────────────────

export interface AudioEngine {
  ctx: AudioContext;
  resume: () => Promise<void>;
  /** Ring a small cluster of bells gathered at a palm. count ~ how many stars. */
  ringCluster: (height01: number, count: number, pan: number) => void;
  /** Spill a rising glissando arc of bells outward. */
  spillArc: (height01: number, count: number, pan: number) => void;
  /** Continuous per-frame update for subtle drone shimmer (height of hands). */
  update: (avgHeight01: number, anyActive: boolean) => void;
  destroy: () => void;
}

export function createAudioEngine(): AudioEngine {
  const AC: typeof AudioContext =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.AudioContext ?? (window as any).webkitAudioContext) as typeof AudioContext;
  const ctx = new AC();

  // ── Master chain ──────────────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.26; // ≤ 0.3

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 6500; // ≤ 7500
  lowpass.Q.value = 0.3;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 20;
  comp.knee.value = 6;
  comp.attack.value = 0.005;
  comp.release.value = 0.25;

  master.connect(lowpass);
  lowpass.connect(comp);
  comp.connect(ctx.destination);

  // ── Always-on drone bed: an open fifth (root + fifth) with a slow shimmer ──
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0; // fade in after resume
  droneGain.connect(master);

  const droneVoices: OscillatorNode[] = [];
  function makeDrone(freq: number, type: OscillatorType, level: number) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = level;
    // gentle detuned shimmer
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07 + Math.random() * 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = level * 0.35;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    o.connect(g);
    g.connect(droneGain);
    o.start();
    lfo.start();
    droneVoices.push(o, lfo);
  }
  // open fifth: root (1/1) and fifth (3/2), plus a soft octave for body
  makeDrone(ROOT, "sine", 0.5);
  makeDrone(ROOT * 1.5, "sine", 0.34);
  makeDrone(ROOT * 2, "triangle", 0.12);

  let destroyed = false;

  async function resume() {
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch { /* ignore */ }
    }
    // gentle fade-in of the drone bed so a silent glance is already alive
    const now = ctx.currentTime;
    droneGain.gain.cancelScheduledValues(now);
    droneGain.gain.setValueAtTime(droneGain.gain.value, now);
    droneGain.gain.linearRampToValueAtTime(0.16, now + 2.0);
  }

  // ── One soft bell voice (FM-ish chime: carrier + gentle partial) ───────────
  function bell(freq: number, when: number, gain: number, pan: number, dur: number) {
    if (destroyed) return;
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = freq;

    // a quiet shimmering partial a just major-third above (5/4) for chime color
    const partial = ctx.createOscillator();
    partial.type = "sine";
    partial.frequency.value = freq * 2.0; // octave partial — pure, consonant
    const partialGain = ctx.createGain();
    partialGain.gain.value = gain * 0.25;

    const env = ctx.createGain();
    env.gain.value = 0.0001;

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));

    carrier.connect(env);
    partial.connect(partialGain);
    partialGain.connect(env);
    env.connect(panner);
    panner.connect(master);

    // soft attack — NO loud transient — slow rise, long bell decay
    const a = 0.025;
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(gain, when + a);
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    carrier.start(when);
    partial.start(when);
    carrier.stop(when + dur + 0.05);
    partial.stop(when + dur + 0.05);
  }

  function ringCluster(height01: number, count: number, pan: number) {
    if (destroyed) return;
    const now = ctx.currentTime;
    const n = Math.max(1, Math.min(7, Math.round(count)));
    const base = Math.max(0.04, 0.10 - n * 0.006); // softer when many bells
    for (let i = 0; i < n; i++) {
      const f = ladderFreq(height01, i);
      // tiny stagger so the cluster "blooms" rather than slams (no transient)
      const when = now + i * 0.035 + Math.random() * 0.015;
      const g = base * (0.7 + 0.3 * Math.random());
      const dur = 1.6 + height01 * 1.4; // higher = a touch longer & shimmery
      bell(f, when, g, pan + (Math.random() - 0.5) * 0.2, dur);
    }
  }

  function spillArc(height01: number, count: number, pan: number) {
    if (destroyed) return;
    const now = ctx.currentTime;
    const n = Math.max(3, Math.min(9, Math.round(count)));
    for (let i = 0; i < n; i++) {
      // rising glissando: each successive bell steps UP the pentatonic ladder
      const p = Math.min(1, height01 + (i / n) * 0.45);
      const f = ladderFreq(p, i);
      const when = now + i * 0.06; // ascending arc in time
      const g = 0.05 * (0.6 + 0.4 * (1 - i / n));
      const dur = 1.2 + p * 1.2;
      // pan drifts outward as it spills
      const pp = pan + (i / n) * (pan >= 0 ? 0.5 : -0.5);
      bell(f, when, g, pp, dur);
    }
  }

  // continuous shimmer: nudge the lowpass & drone with overall hand height
  function update(avgHeight01: number, anyActive: boolean) {
    if (destroyed) return;
    const now = ctx.currentTime;
    const targetCut = 4200 + avgHeight01 * 3000; // ≤ ~7200, stays under 7500
    lowpass.frequency.setTargetAtTime(targetCut, now, 0.4);
    const targetDrone = anyActive ? 0.20 : 0.14;
    droneGain.gain.setTargetAtTime(targetDrone, now, 1.2);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    try {
      for (const v of droneVoices) { try { v.stop(); } catch { /* ignore */ } }
    } catch { /* ignore */ }
    try { void ctx.close(); } catch { /* ignore */ }
  }

  return { ctx, resume, ringCluster, spillArc, update, destroy };
}
