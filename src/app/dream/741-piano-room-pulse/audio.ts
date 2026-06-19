// audio.ts — warm FM/additive electric-piano voice + an ALWAYS-ON breathing
// D-Dorian pulse bed both devices share. Self-contained: no sample files.
//
// The network carries only note numbers + a SHARED-clock target time. Both
// devices render every note (own + partner) through this same voice, scheduled
// onto the shared beat grid — so even across latency the two pianos interlock.
//
// Master chain: master gain ≤0.3 → lowpass ~7.5kHz → compressor(-10/20:1) → dest.

const DORIAN_STEPS = [0, 2, 3, 5, 7, 9, 10] as const; // D E F G A B C
const ROOT_MIDI = 50; // D3

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// Snap any MIDI note to the nearest D-Dorian note — nothing is ever out of tune.
export function snapToDorian(midi: number): number {
  const rel = midi - ROOT_MIDI;
  const octave = Math.floor(rel / 12);
  const within = ((rel % 12) + 12) % 12;
  let best: number = DORIAN_STEPS[0];
  let bestDist = 99;
  for (const s of DORIAN_STEPS) {
    const d = Math.abs(s - within);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return ROOT_MIDI + octave * 12 + best;
}

// Map a scale degree (can be negative / large) to a Dorian MIDI note.
export function degreeToMidi(degree: number): number {
  const n = DORIAN_STEPS.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return ROOT_MIDI + oct * 12 + DORIAN_STEPS[idx];
}

export type Who = "me" | "them";

export interface StruckNote {
  midi: number;
  vel: number;
  who: Who;
  // AudioContext time the note will sound (seconds). Lets the visual bloom in
  // sync with the audio.
  whenCtx: number;
}

export interface PianoEngine {
  ctx: AudioContext;
  // Strike a snapped note. `whenLocalMs` is a local-clock (Date.now) target;
  // pass the engine's own clock-mapping via strikeAtCtx for precise scheduling.
  strike: (midi: number, vel: number, who: Who) => StruckNote;
  // Strike at a precise AudioContext time (seconds). Used by the shared grid.
  strikeAtCtx: (midi: number, vel: number, who: Who, whenCtx: number) => StruckNote;
  // Map a local-clock (Date.now) ms to an AudioContext time (seconds).
  localMsToCtx: (localMs: number) => number;
  master: GainNode;
  dispose: () => Promise<void>;
}

export async function makeEngine(): Promise<PianoEngine> {
  const Ctor: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
  }

  // Anchor: ctxTime ≈ (localMs − anchorLocalMs)/1000 + anchorCtx
  const anchorCtx = ctx.currentTime;
  const anchorLocalMs = Date.now();
  function localMsToCtx(localMs: number): number {
    return anchorCtx + (localMs - anchorLocalMs) / 1000;
  }

  // ── Master chain ──
  const master = ctx.createGain();
  master.gain.value = 0.28;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 7500;
  lp.Q.value = 0.3;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 20;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  comp.knee.value = 6;

  master.connect(lp);
  lp.connect(comp);
  comp.connect(ctx.destination);

  // ── Always-on breathing D-Dorian pulse bed ──
  const padGain = ctx.createGain();
  padGain.gain.value = 0.0;
  padGain.connect(master);
  padGain.gain.setValueAtTime(0.0, ctx.currentTime);
  padGain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 4);

  const padOscs: OscillatorNode[] = [];
  const padLfos: OscillatorNode[] = [];
  const padNotes = [38, 45, 52, 57]; // D2 A2 E3 A3 — open Dorian bed
  for (const m of padNotes) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = midiToFreq(m);
    const g = ctx.createGain();
    g.gain.value = 0.22 / padNotes.length;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.07 + Math.random() * 0.05;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.012;
    lfo.connect(lfoG);
    lfoG.connect(g.gain);
    o.connect(g);
    g.connect(padGain);
    o.start();
    lfo.start();
    padOscs.push(o);
    padLfos.push(lfo);
  }

  // ── A single electric-piano strike at a precise AudioContext time ──
  function strikeAtCtx(
    midiRaw: number,
    vel: number,
    who: Who,
    whenCtx: number,
  ): StruckNote {
    const midi = snapToDorian(midiRaw);
    const t = Math.max(ctx.currentTime, whenCtx);
    const freq = midiToFreq(midi);
    const v = Math.max(0.05, Math.min(1, vel));

    const pan = ctx.createStereoPanner();
    pan.pan.value = who === "me" ? -0.4 : 0.4;

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0.0001;
    voiceGain.connect(pan);
    pan.connect(master);

    const toneFilter = ctx.createBiquadFilter();
    toneFilter.type = "lowpass";
    toneFilter.frequency.value = who === "me" ? 2600 : 3500;
    toneFilter.Q.value = 0.4;
    toneFilter.connect(voiceGain);

    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = freq;

    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * (who === "me" ? 2.0 : 3.0);
    const modGain = ctx.createGain();
    const modDepth = freq * (1.4 + v * 1.4);
    modGain.gain.setValueAtTime(modDepth, t);
    modGain.gain.exponentialRampToValueAtTime(Math.max(1, modDepth * 0.08), t + 0.35);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(toneFilter);

    const tine = ctx.createOscillator();
    tine.type = "triangle";
    tine.frequency.value = freq * 4.01;
    const tineGain = ctx.createGain();
    tineGain.gain.setValueAtTime(0.18 * v, t);
    tineGain.gain.exponentialRampToValueAtTime(0.0005, t + 0.25);
    tine.connect(tineGain);
    tineGain.connect(toneFilter);

    const peak = 0.5 * v;
    voiceGain.gain.setValueAtTime(0.0001, t);
    voiceGain.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    voiceGain.gain.exponentialRampToValueAtTime(peak * 0.4, t + 0.3);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);

    carrier.start(t);
    mod.start(t);
    tine.start(t);
    const stop = t + 2.4;
    carrier.stop(stop);
    mod.stop(stop);
    tine.stop(stop);

    carrier.onended = () => {
      try {
        carrier.disconnect();
        mod.disconnect();
        modGain.disconnect();
        tine.disconnect();
        tineGain.disconnect();
        toneFilter.disconnect();
        voiceGain.disconnect();
        pan.disconnect();
      } catch {
        /* ignore */
      }
    };

    return { midi, vel: v, who, whenCtx: t };
  }

  function strike(midi: number, vel: number, who: Who): StruckNote {
    return strikeAtCtx(midi, vel, who, ctx.currentTime);
  }

  async function dispose() {
    try {
      for (const o of padOscs) {
        try {
          o.stop();
          o.disconnect();
        } catch {
          /* ignore */
        }
      }
      for (const l of padLfos) {
        try {
          l.stop();
          l.disconnect();
        } catch {
          /* ignore */
        }
      }
      padGain.disconnect();
      master.disconnect();
      lp.disconnect();
      comp.disconnect();
      if (ctx.state !== "closed") await ctx.close();
    } catch {
      /* ignore */
    }
  }

  return { ctx, strike, strikeAtCtx, localMsToCtx, master, dispose };
}
