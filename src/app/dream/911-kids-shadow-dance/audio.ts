// Sound for the shadow-dance. Pitch is held DUMB on purpose:
//   - one warm always-on drone (C2 + G2 + C3 — root, fifth, octave)
//   - any pitched accents are fixed safe tones, never a scale the kid "plays"
// The kid composes by MOVING. Movement *qualities* drive timbre & rhythm:
//   energy      → warmth/brightness of a granular texture bed
//   fluidity    → a shimmer pad that streams in when motion is smooth
//   impulsivity → a soft, capped percussive "bloom" (warm woodblock/mallet)
//
// Safety chain (gate): masterGain (<=0.26) -> lowpass (<=6.5kHz)
//   -> DynamicsCompressor(threshold -10, ratio 20:1). Attacks >= 10ms.
//   Safe for a sleeping toddler in the next room.

import type { MotionFrame } from "./pose";

export interface AudioHandle {
  update(frame: MotionFrame): void;
  close(): Promise<void>;
}

const NOTE = {
  C2: 65.41,
  G2: 98.0,
  C3: 130.81,
  // fixed safe pitched accents (a soft pentatonic *constellation*, never sequenced)
  E4: 329.63,
  G4: 392.0,
  A4: 440.0,
  C5: 523.25,
};

export function startAudio(ctx: AudioContext): AudioHandle {
  const now = ctx.currentTime;

  // ── Master safety chain ───────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.0;
  master.gain.linearRampToValueAtTime(0.26, now + 1.5); // gentle fade-in

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 4200; // moves up to <=6500 with energy
  lowpass.Q.value = 0.5;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 20;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  comp.knee.value = 6;

  master.connect(lowpass);
  lowpass.connect(comp);
  comp.connect(ctx.destination);

  // ── Always-on warm drone (root + fifth + octave) ──────────────────────
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.5;
  droneGain.connect(master);
  const droneOscs: OscillatorNode[] = [];
  for (const f of [NOTE.C2, NOTE.G2, NOTE.C3]) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = f === NOTE.C2 ? 0.5 : f === NOTE.G2 ? 0.3 : 0.22;
    // slow detuned partner for warmth (chorus)
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = f * 1.005;
    const g2 = ctx.createGain();
    g2.gain.value = (g.gain.value as number) * 0.6;
    o.connect(g);
    o2.connect(g2);
    g.connect(droneGain);
    g2.connect(droneGain);
    o.start(now);
    o2.start(now);
    droneOscs.push(o, o2);
  }
  // breathing LFO on the drone level
  const droneLfo = ctx.createOscillator();
  droneLfo.frequency.value = 0.08;
  const droneLfoGain = ctx.createGain();
  droneLfoGain.gain.value = 0.12;
  droneLfo.connect(droneLfoGain);
  droneLfoGain.connect(droneGain.gain);
  droneLfo.start(now);

  // ── Shimmer pad (fluidity) — fixed safe high tones, streamed not played ──
  const padGain = ctx.createGain();
  padGain.gain.value = 0.0;
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 2000;
  padGain.connect(padFilter);
  padFilter.connect(master);
  const padOscs: OscillatorNode[] = [];
  for (const f of [NOTE.E4, NOTE.G4, NOTE.C5]) {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.12;
    o.connect(g);
    g.connect(padGain);
    o.start(now);
    padOscs.push(o);
  }

  // ── Granular texture bed (energy) ─────────────────────────────────────
  // A small looping noise buffer fed through a bandpass; "grain" rate &
  // brightness rise with energy. Cheap, safe, and always-on at low level.
  const grainBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = grainBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    // pink-ish: smoothed white noise
    data[i] = (Math.random() * 2 - 1) * 0.5;
  }
  const grainSrc = ctx.createBufferSource();
  grainSrc.buffer = grainBuf;
  grainSrc.loop = true;
  const grainFilter = ctx.createBiquadFilter();
  grainFilter.type = "bandpass";
  grainFilter.frequency.value = 600;
  grainFilter.Q.value = 1.2;
  const grainGain = ctx.createGain();
  grainGain.gain.value = 0.04;
  grainSrc.connect(grainFilter);
  grainFilter.connect(grainGain);
  grainGain.connect(master);
  grainSrc.start(now);

  // ── Percussive "bloom" (impulsivity) — warm capped mallet/woodblock ───
  // Triggered on impulse spikes, throttled so a flurry can't stack into noise.
  let lastHit = 0;
  function bloomHit(strength: number) {
    const t = ctx.currentTime;
    if (t - lastHit < 0.14) return; // throttle
    lastHit = t;
    const amp = 0.08 + 0.07 * Math.min(1, strength); // capped
    // fixed pleasant pitches chosen at random from a safe set
    const pick = [NOTE.C5, NOTE.A4, NOTE.G4, NOTE.E4];
    const f = pick[Math.floor(Math.random() * pick.length)];

    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = f * 2.0; // soft overtone for mallet body
    const og = ctx.createGain();
    og.gain.value = 0;
    const o2g = ctx.createGain();
    o2g.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3500;

    o.connect(og);
    o2.connect(o2g);
    og.connect(lp);
    o2g.connect(lp);
    lp.connect(master);

    // attack >= 10ms, exponential mallet decay — no harsh transient
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(amp, t + 0.012);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o2g.gain.setValueAtTime(0.0001, t);
    o2g.gain.linearRampToValueAtTime(amp * 0.4, t + 0.012);
    o2g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);

    o.start(t);
    o2.start(t);
    o.stop(t + 1.0);
    o2.stop(t + 0.5);
  }

  // ── Per-frame update from movement qualities ──────────────────────────
  let prevImpulse = 0;
  function update(frame: MotionFrame) {
    const t = ctx.currentTime;
    const e = frame.energy;
    const fl = frame.fluidity;

    // Energy → texture bed level + overall brightness (lowpass up to 6.5k).
    grainGain.gain.setTargetAtTime(0.04 + e * 0.16, t, 0.08);
    grainFilter.frequency.setTargetAtTime(500 + e * 1800, t, 0.1);
    lowpass.frequency.setTargetAtTime(4000 + e * 2500, t, 0.15); // <=6500

    // Fluidity (only when there's some energy) → shimmer pad streams in.
    const padTarget = Math.min(0.5, fl * e * 1.4);
    padGain.gain.setTargetAtTime(padTarget, t, 0.25);
    padFilter.frequency.setTargetAtTime(1400 + fl * 2200, t, 0.3);

    // Impulsivity → percussive bloom on the rising edge of a spike.
    if (frame.impulsivity > 0.35 && frame.impulsivity > prevImpulse + 0.08) {
      bloomHit(frame.impulsivity);
    }
    prevImpulse = frame.impulsivity;
  }

  async function close() {
    try {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(0, t, 0.1);
      for (const o of [...droneOscs, ...padOscs]) {
        try {
          o.stop(t + 0.3);
        } catch {
          /* already stopped */
        }
      }
      try {
        droneLfo.stop(t + 0.3);
      } catch {
        /* noop */
      }
      try {
        grainSrc.stop(t + 0.3);
      } catch {
        /* noop */
      }
    } catch {
      /* best effort */
    }
  }

  return { update, close };
}
