// ════════════════════════════════════════════════════════════════════════════
// audio.ts — two distinguishable timbres through a limiter.
//
//   • "you"     — soft triangle + sine, gentle attack (the visitor's line)
//   • "partner" — a bowed/pad tone: detuned saw pair through a lowpass, slow
//                 attack (the answering voice)
//
// Signal path: voice → per-note gain envelope → master gain (~0.2) →
// DynamicsCompressor (limiter) → destination. Polyphony is capped so a mashed
// keyboard can't runaway. Audio only ever starts on a user gesture.
// ════════════════════════════════════════════════════════════════════════════

export type Timbre = "you" | "partner";

const MAX_VOICES = 8;
const MASTER_GAIN = 0.2;

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

interface ActiveVoice {
  gain: GainNode;
  oscs: OscillatorNode[];
  stopAt: number; // scheduled end (ctx time), Infinity while held
  release: (when: number) => void;
}

export interface AudioEngine {
  ctx: AudioContext;
  resume: () => Promise<void>;
  /** Start a sustained note (held). Returns a handle to release it. */
  startNote: (midi: number, timbre: Timbre) => { release: () => void };
  /** Play a note of a known duration (partner / auto-demo). */
  playNote: (midi: number, timbre: Timbre, durSec: number) => void;
  dispose: () => void;
}

export function createAudioEngine(): AudioEngine {
  const Ctor: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = MASTER_GAIN;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.knee.value = 24;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  master.connect(limiter);
  limiter.connect(ctx.destination);

  const active = new Set<ActiveVoice>();

  function prune() {
    // Reap finished voices; if over the cap, release the oldest held ones.
    const now = ctx.currentTime;
    for (const v of active) {
      if (v.stopAt <= now) {
        try {
          v.oscs.forEach((o) => o.stop());
        } catch {
          /* already stopped */
        }
        active.delete(v);
      }
    }
    if (active.size >= MAX_VOICES) {
      const oldest = active.values().next().value;
      if (oldest) oldest.release(now);
    }
  }

  function spawn(midi: number, timbre: Timbre, sustained: boolean): ActiveVoice {
    prune();
    const now = ctx.currentTime;
    const freq = midiToFreq(midi);

    const g = ctx.createGain();
    g.gain.value = 0;

    const oscs: OscillatorNode[] = [];

    if (timbre === "you") {
      const a = ctx.createOscillator();
      a.type = "triangle";
      a.frequency.value = freq;
      const b = ctx.createOscillator();
      b.type = "sine";
      b.frequency.value = freq * 2;
      const bg = ctx.createGain();
      bg.gain.value = 0.18;
      a.connect(g);
      b.connect(bg);
      bg.connect(g);
      oscs.push(a, b);
    } else {
      // bowed/pad: two slightly detuned saws through a warm lowpass.
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = Math.min(freq * 4 + 400, 4200);
      lp.Q.value = 0.5;
      const a = ctx.createOscillator();
      a.type = "sawtooth";
      a.frequency.value = freq;
      a.detune.value = -6;
      const b = ctx.createOscillator();
      b.type = "sawtooth";
      b.frequency.value = freq;
      b.detune.value = 7;
      a.connect(lp);
      b.connect(lp);
      lp.connect(g);
      oscs.push(a, b);
    }

    g.connect(master);

    const peak = timbre === "you" ? 0.5 : 0.34;
    const attack = timbre === "you" ? 0.012 : 0.09;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + attack);
    // Gentle decay toward a sustain plateau.
    g.gain.linearRampToValueAtTime(peak * 0.72, now + attack + 0.25);

    oscs.forEach((o) => o.start(now));

    const voice: ActiveVoice = {
      gain: g,
      oscs,
      stopAt: sustained ? Infinity : now,
      release: (when: number) => {
        const rel = timbre === "you" ? 0.18 : 0.5;
        try {
          g.gain.cancelScheduledValues(when);
          g.gain.setValueAtTime(g.gain.value, when);
          g.gain.linearRampToValueAtTime(0.0001, when + rel);
        } catch {
          /* node gone */
        }
        voice.stopAt = when + rel;
        oscs.forEach((o) => {
          try {
            o.stop(when + rel + 0.02);
          } catch {
            /* already scheduled */
          }
        });
      },
    };
    active.add(voice);
    return voice;
  }

  return {
    ctx,
    resume: () => ctx.resume(),
    startNote(midi, timbre) {
      const v = spawn(midi, timbre, true);
      return {
        release() {
          v.release(ctx.currentTime);
        },
      };
    },
    playNote(midi, timbre, durSec) {
      const v = spawn(midi, timbre, false);
      v.release(ctx.currentTime + durSec);
    },
    dispose() {
      const now = ctx.currentTime;
      for (const v of active) {
        try {
          v.oscs.forEach((o) => o.stop(now));
        } catch {
          /* noop */
        }
      }
      active.clear();
      ctx.close().catch(() => {});
    },
  };
}
