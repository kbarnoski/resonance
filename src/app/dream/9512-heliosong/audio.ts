// audio.ts — the infinite, non-looping generative ambient engine.
//
// Real-data sonification in the Brian-Eno / Helioradar-AV tradition: the live
// space-weather drivers steer a slowly-evolving drone + swelling pad field that
// never repeats a fixed pattern. Seeded randomness (mulberry32 @ 0x9512) plus
// the live values keep minting new pad entries.
//
// Mappings (see README):
//   storm (Kp)      → density of pad events + a touch of roughness/detune
//   south (−Bz)     → root pitch DROP + minor/tension scale + darker cutoff
//   flow  (speed)   → shimmer rate + tempo of swelling pads
//   body  (density) → master lowpass cutoff / body
//
// Everything routes into a SafeMaster. No loops of samples, no fixed sequence —
// the schedule reschedules itself with fresh seeded choices every entry.

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { mulberry32, pick, range, type Rng } from "./rng";
import type { SkyDrivers } from "./sky";

const SEED = 0x9512;

// Scale degrees (semitone offsets from root) selected by tension.
// Calm → warm major-pentatonic. Tense/southward → minor with added tension tones.
const SCALE_CALM = [0, 2, 4, 7, 9, 12, 14, 16, 19];
const SCALE_TENSE = [0, 2, 3, 5, 7, 8, 10, 12, 15, 17]; // natural minor + b6/b7 colour

function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export interface HelioEngine {
  /** Push the newest normalized drivers; the engine adapts smoothly. */
  update(d: SkyDrivers): void;
  /** The SafeMaster (for analyser taps / visuals). */
  master: SafeMaster;
  /** Tear down all audio and close nothing (caller closes the ctx). */
  stop(): void;
}

interface DroneVoice {
  osc: OscillatorNode;
  gain: GainNode;
  detune: number;
}

export function startEngine(ctx: AudioContext): HelioEngine {
  const master = createSafeMaster(ctx, { gain: 0.18 });
  const rng: Rng = mulberry32(SEED);

  // A shared musical lowpass that gives the whole field a soft, bodied sky.
  const skyFilter = ctx.createBiquadFilter();
  skyFilter.type = "lowpass";
  skyFilter.frequency.value = 900;
  skyFilter.Q.value = 0.5;
  skyFilter.connect(master.input);

  // Gentle reverb-ish smear via a short feedback delay (dependency-free).
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  const delay = ctx.createDelay(2.0);
  delay.delayTime.value = 0.42;
  const fb = ctx.createGain();
  fb.gain.value = 0.4;
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(master.input);

  // ── Continuous drone: three detuned voices around the root. ───────────────
  const droneMix = ctx.createGain();
  droneMix.gain.value = 0.0;
  droneMix.connect(skyFilter);
  droneMix.connect(delay);

  let rootMidi = 38; // ~D2 baseline; drops with southward Bz
  const drone: DroneVoice[] = [-7, 0, 5].map((semi, i) => {
    const osc = ctx.createOscillator();
    osc.type = i === 1 ? "sine" : "triangle";
    osc.frequency.value = midiToHz(rootMidi + semi);
    osc.detune.value = (i - 1) * 4;
    const g = ctx.createGain();
    g.gain.value = i === 1 ? 0.6 : 0.32;
    osc.connect(g);
    g.connect(droneMix);
    osc.start();
    return { osc, gain: g, detune: semi };
  });
  // fade the drone in
  droneMix.gain.setTargetAtTime(0.5, ctx.currentTime, 3.0);

  // Current drivers (smoothed by usage); start calm so first sound is gentle.
  let d: SkyDrivers = { storm: 0.2, south: 0.1, flow: 0.4, body: 0.5, field: 0.3 };

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  // ── One swelling pad entry: 1–2 partials, long attack/release. ────────────
  function padEntry() {
    if (stopped) return;
    const now = ctx.currentTime;

    const tense = d.south > 0.35 || d.storm > 0.55;
    const scale = tense ? SCALE_TENSE : SCALE_CALM;

    // register wanders; higher, sparser shimmer when flow (wind) is fast.
    const octave = 12 * (1 + Math.floor(range(rng, 0, d.flow > 0.6 ? 3.2 : 2.4)));
    const degree = pick(rng, scale);
    const midi = rootMidi + degree + octave;
    const hz = midiToHz(midi);

    // storm adds a little detune roughness; south darkens the timbre.
    const detune = range(rng, -1, 1) * (2 + d.storm * 22);

    const osc = ctx.createOscillator();
    osc.type = d.south > 0.5 ? "triangle" : "sine";
    osc.frequency.value = hz;
    osc.detune.value = detune;

    // optional shimmer partial an octave/fifth up, more likely with fast flow
    let osc2: OscillatorNode | null = null;
    if (rng() < 0.35 + d.flow * 0.4) {
      osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = hz * (rng() < 0.5 ? 2 : 1.5);
      osc2.detune.value = -detune;
    }

    const vgain = ctx.createGain();
    vgain.gain.value = 0;

    // per-voice soft lowpass; darker when southward.
    const vfilt = ctx.createBiquadFilter();
    vfilt.type = "lowpass";
    vfilt.frequency.value = 700 + (1 - d.south) * 2600 + d.body * 1800;
    vfilt.Q.value = 0.4;

    osc.connect(vfilt);
    if (osc2) osc2.connect(vfilt);
    vfilt.connect(vgain);
    vgain.connect(skyFilter);
    vgain.connect(delay);

    // long, breathing envelope. Louder core when the field is strong.
    const peak = 0.05 + range(rng, 0, 0.06) + d.field * 0.05;
    const attack = range(rng, 2.5, 6.0) * (d.flow > 0.6 ? 0.7 : 1.0);
    const hold = range(rng, 1.5, 5.0);
    const release = range(rng, 4.0, 9.0);

    vgain.gain.setValueAtTime(0, now);
    vgain.gain.linearRampToValueAtTime(peak, now + attack);
    vgain.gain.setValueAtTime(peak, now + attack + hold);
    vgain.gain.linearRampToValueAtTime(0.0001, now + attack + hold + release);

    osc.start(now);
    osc.stop(now + attack + hold + release + 0.1);
    if (osc2) {
      osc2.start(now);
      osc2.stop(now + attack + hold + release + 0.1);
    }
    const cleanupAt = (attack + hold + release + 0.3) * 1000;
    setTimeout(() => {
      try {
        vgain.disconnect();
        vfilt.disconnect();
      } catch {
        /* closing */
      }
    }, cleanupAt);

    // schedule the next entry. Faster flow + higher storm → denser events.
    const base = 7.5 - d.flow * 3.0 - d.storm * 2.5; // seconds between entries
    const jitter = range(rng, 0.5, 2.5);
    const gap = Math.max(1.2, base) + jitter;
    timer = setTimeout(padEntry, gap * 1000);
  }

  // kick off the generative field shortly after start
  timer = setTimeout(padEntry, 400);

  return {
    master,
    update(next: SkyDrivers) {
      d = next;
      const t = ctx.currentTime;

      // root pitch drops as Bz goes south (tension → gravity).
      const targetRoot = 38 - Math.round(next.south * 7); // up to a ~fifth down
      if (targetRoot !== rootMidi) {
        rootMidi = targetRoot;
        for (const v of drone) {
          v.osc.frequency.setTargetAtTime(midiToHz(rootMidi + v.detune), t, 4.0);
        }
      }

      // master body/cutoff follows plasma density; south darkens it further.
      const cutoff = 500 + next.body * 2600 - next.south * 600 + next.field * 900;
      skyFilter.frequency.setTargetAtTime(Math.max(280, cutoff), t, 2.5);

      // storm nudges drone detune (roughness) and reverb smear.
      for (let i = 0; i < drone.length; i++) {
        drone[i].osc.detune.setTargetAtTime(
          (i - 1) * 4 + next.storm * 10 * (i === 1 ? 0 : 1),
          t,
          3.0,
        );
      }
      fb.gain.setTargetAtTime(0.32 + next.storm * 0.18, t, 3.0);
      wet.gain.setTargetAtTime(0.24 + next.field * 0.2, t, 3.0);
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      const t = ctx.currentTime;
      droneMix.gain.setTargetAtTime(0.0001, t, 0.6);
      for (const v of drone) {
        try {
          v.osc.stop(t + 1.2);
        } catch {
          /* already stopped */
        }
      }
      setTimeout(() => master.disconnect(), 1400);
    },
  };
}
