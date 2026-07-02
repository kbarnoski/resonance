/* ───────────────────────────────────────────────────────────────────────────
   1116-gait-loom — audio.ts

   A Steve Reich–style phasing engine driven by footstep cadence.

   Two "voices" play the SAME warm pentatonic cell:
     • Voice A ("your steps") advances exactly one note per detected footfall,
       so it is locked to your body's tempo.
     • Voice B ("the phasing voice") runs on its own lookahead scheduler at a
       tempo DRIFT% faster than your cadence, so it slowly slides out of and
       back into alignment with Voice A — the Piano Phase process, but the clock
       is your gait instead of a metronome.

   Under both voices sits a soft two-note drone bed (root + fifth) that breathes.
   Signal path: voices + drone → master → DynamicsCompressor (limiter) → out.
─────────────────────────────────────────────────────────────────────────── */

const DRIFT = 0.03; // Voice B runs 3% faster → gradual phasing

// Warm pentatonic over a low root, expressed as just-intonation-ish ratios.
const ROOT_HZ = 174.61; // F3 — warm, grounded
const SCALE = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4]; // major pentatonic + octaves

// The shared melodic cell — indices into SCALE. A small, singable phrase.
const CELL = [0, 2, 4, 3, 1, 4, 2, 5];

function noteHz(index: number): number {
  const i = ((index % SCALE.length) + SCALE.length) % SCALE.length;
  const oct = Math.floor(index / SCALE.length);
  return ROOT_HZ * SCALE[i] * Math.pow(2, oct);
}

export interface GaitEngine {
  start(): Promise<void>;
  /** trigger Voice A + retune Voice B from the latest cadence */
  step(intensity: number, cadenceSpm: number): void;
  stop(): void;
  running: boolean;
}

export function createEngine(): GaitEngine {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let busA: GainNode | null = null;
  let busB: GainNode | null = null;
  let droneGain: GainNode | null = null;
  const drones: OscillatorNode[] = [];
  let droneLfo: OscillatorNode | null = null;

  let bTimer: ReturnType<typeof setInterval> | null = null;
  let nextBTime = 0;
  let bIndex = 0;
  let aIndex = 0;
  let bPeriodSec = 60 / 108; // updated from cadence
  let running = false;

  function pluck(
    bus: GainNode,
    freq: number,
    when: number,
    gain: number,
    brightness: number,
    pan: number,
    length: number,
  ) {
    if (!ctx) return;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    const panner = ctx.createStereoPanner();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(600 + brightness * 2600, when);
    lp.frequency.exponentialRampToValueAtTime(
      Math.max(220, 400 + brightness * 900),
      when + length,
    );
    lp.Q.value = 1.1;
    panner.pan.value = pan;

    // Two partials for a soft plucked/marimba timbre.
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = "triangle";
    o2.type = "sine";
    o1.frequency.value = freq;
    o2.frequency.value = freq * 2.01;
    const g2 = ctx.createGain();
    g2.gain.value = 0.32;

    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + length);

    o1.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(lp);
    lp.connect(panner);
    panner.connect(bus);

    o1.start(when);
    o2.start(when);
    o1.stop(when + length + 0.05);
    o2.stop(when + length + 0.05);
  }

  function scheduleB() {
    if (!ctx || !busB) return;
    const ahead = ctx.currentTime + 0.25;
    while (nextBTime < ahead) {
      const len = Math.min(1.1, bPeriodSec * 1.6);
      pluck(busB, noteHz(CELL[bIndex % CELL.length]), nextBTime, 0.16, 0.55, 0.5, len);
      bIndex++;
      nextBTime += bPeriodSec;
    }
  }

  return {
    get running() {
      return running;
    },
    set running(v: boolean) {
      running = v;
    },

    async start() {
      if (running) return;
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new Ctor();
      if (ctx.state === "suspended") await ctx.resume();

      master = ctx.createGain();
      master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 24;
      comp.ratio.value = 12;
      comp.attack.value = 0.004;
      comp.release.value = 0.25;
      master.connect(comp);
      comp.connect(ctx.destination);

      busA = ctx.createGain();
      busB = ctx.createGain();
      busA.gain.value = 0.9;
      busB.gain.value = 0.9;
      busA.connect(master);
      busB.connect(master);

      // ── Soft drone bed: root + fifth + octave, breathing via a slow LFO ──
      droneGain = ctx.createGain();
      droneGain.gain.value = 0.0;
      const droneLp = ctx.createBiquadFilter();
      droneLp.type = "lowpass";
      droneLp.frequency.value = 720;
      droneGain.connect(droneLp);
      droneLp.connect(master);

      const droneFreqs = [ROOT_HZ / 2, (ROOT_HZ / 2) * 1.5, ROOT_HZ];
      for (const f of droneFreqs) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f;
        const dg = ctx.createGain();
        dg.gain.value = 0.05;
        o.connect(dg);
        dg.connect(droneGain);
        o.start();
        drones.push(o);
      }
      droneGain.gain.setValueAtTime(0.0, ctx.currentTime);
      droneGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 3);

      droneLfo = ctx.createOscillator();
      droneLfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.18;
      droneLfo.connect(lfoGain);
      lfoGain.connect(droneGain.gain);
      droneLfo.start();

      // Kick off Voice B's own clock.
      nextBTime = ctx.currentTime + 0.2;
      bIndex = 0;
      aIndex = 0;
      bPeriodSec = 60 / 108;
      bTimer = setInterval(scheduleB, 45);

      running = true;
    },

    step(intensity, cadenceSpm) {
      if (!ctx || !busA || !running) return;
      const cad = Math.min(200, Math.max(40, cadenceSpm || 108));
      const periodSec = 60 / cad;
      bPeriodSec = periodSec / (1 + DRIFT); // Voice B slightly faster

      const when = ctx.currentTime + 0.02;
      const len = Math.min(1.2, periodSec * 1.7);
      const gain = 0.14 + intensity * 0.16;
      const bright = 0.35 + intensity * 0.6;
      pluck(busA, noteHz(CELL[aIndex % CELL.length]), when, gain, bright, -0.45, len);
      aIndex++;
    },

    stop() {
      if (bTimer) {
        clearInterval(bTimer);
        bTimer = null;
      }
      const c = ctx;
      if (c) {
        const t = c.currentTime;
        if (droneGain) droneGain.gain.linearRampToValueAtTime(0.0001, t + 0.4);
        if (master) master.gain.linearRampToValueAtTime(0.0001, t + 0.4);
        for (const o of drones) {
          try {
            o.stop(t + 0.5);
          } catch {
            /* already stopped */
          }
        }
        if (droneLfo) {
          try {
            droneLfo.stop(t + 0.5);
          } catch {
            /* already stopped */
          }
        }
        setTimeout(() => {
          c.close().catch(() => {});
        }, 600);
      }
      drones.length = 0;
      ctx = null;
      master = null;
      busA = null;
      busB = null;
      droneGain = null;
      droneLfo = null;
      running = false;
    },
  };
}
