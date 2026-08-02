/* ── 5048-narthex · HRTF spatial choir — the STAR of the piece ──────────────
 *
 *  A room you cross, not a screen you watch. Eight sustained drone-voices are
 *  each fixed at a point on a sphere around the listener's head and rendered
 *  through their own HRTF PannerNode — a synthetic homage to Janet Cardiff's
 *  "The Forty Part Motet", where every voice lives at its own place in the
 *  room and you move AMONG them. A head-tracked AudioListener rotates the whole
 *  field as you turn. A procedurally-synthesised convolution reverb gives the
 *  dark cathedral. One scalar — distance-to-light (0=void … 1=arrived) — opens
 *  a master low-pass, trims the wet tail, and slews the scattered microtonal
 *  void-cluster into a single luminous unison chord. Everything passes a
 *  DynamicsCompressor limiter; nothing clips; the entrance is a slow fade.
 *
 *  Pure Web Audio. No external assets, no network. Seeded PRNG only.
 */

/** Seeded PRNG — the ONLY source of randomness in this piece. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface NarthexAudio {
  /** Drive per-frame. dtl 0..1 nearness to light; yaw/pitch = head-look (rad). */
  update(dtl: number, yaw: number, pitch: number): void;
  /** Smoothly silence and fully tear down. */
  stop(): void;
}

interface Voice {
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  gain: GainNode;
  panner: PannerNode;
  noise: AudioBufferSourceNode | null;
  voidHz: number;
  unisonHz: number;
  breathPhase: number;
  level: number;
}

/* A luminous open D voicing (D A D F# A D · A · D) spread across the sphere:
 * a ring of six at head height, one voice overhead, one behind-and-below. */
const UNISON_HZ = [73.42, 110.0, 146.83, 185.0, 220.0, 293.66, 440.0, 587.33];

/** Unit direction on the sphere for each voice (WebAudio: -z is "front"). */
function makeDirections(): [number, number, number][] {
  const dirs: [number, number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2; // a=0 → front (-z)
    dirs.push([Math.sin(a), 0, -Math.cos(a)]);
  }
  // overhead, tipped slightly forward
  dirs.push(normalize([0.15, 0.95, -0.28]));
  // behind and below — the "floor of the void"
  dirs.push(normalize([0.0, -0.55, 0.84]));
  return dirs;
}

function normalize(v: [number, number, number]): [number, number, number] {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
}

function cross(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Long, dark, cathedral-like impulse response: exponentially-decaying,
 *  low-passed seeded noise. No external IR file. */
function makeImpulseResponse(
  ac: BaseAudioContext,
  seconds: number,
  rng: () => number,
): AudioBuffer {
  const rate = ac.sampleRate;
  const len = Math.floor(rate * seconds);
  const ir = ac.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 2.6);
      const noise = rng() * 2 - 1;
      lp += (noise - lp) * 0.18; // one-pole low-pass → underwater darkness
      data[i] = lp * decay;
    }
  }
  return ir;
}

/** A small looped noise buffer used as each voice's "breath". */
function makeBreathBuffer(
  ac: BaseAudioContext,
  rng: () => number,
): AudioBuffer {
  const len = Math.floor(ac.sampleRate * 2);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const n = rng() * 2 - 1;
    lp += (n - lp) * 0.08;
    d[i] = lp;
  }
  return buf;
}

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

export function makeNarthexAudio(
  ac: AudioContext,
  masterTarget = 0.16,
): NarthexAudio {
  const rng = mulberry32(0x5048);
  const now = ac.currentTime;

  // ── master chain: voices → bus → filter → [dry + reverb] → master → lim ──
  const master = ac.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(masterTarget, now + 5.5);

  const busIn = ac.createGain();
  busIn.gain.value = 1;

  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(320, now); // muffled in the void
  filter.Q.value = 0.6;
  busIn.connect(filter);

  const convolver = ac.createConvolver();
  convolver.buffer = makeImpulseResponse(ac, 5.5, rng);

  const wet = ac.createGain();
  wet.gain.value = 0.9;
  const dry = ac.createGain();
  dry.gain.value = 0.5;

  filter.connect(dry);
  filter.connect(convolver);
  convolver.connect(wet);
  dry.connect(master);
  wet.connect(master);

  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 10;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.008;
  limiter.release.value = 0.28;
  master.connect(limiter);
  limiter.connect(ac.destination);

  const breathBuf = makeBreathBuffer(ac, rng);
  const dirs = makeDirections();

  const voices: Voice[] = UNISON_HZ.map((unisonHz, i) => {
    const dir = dirs[i];
    const R = 3.2;

    const panner = ac.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    panner.maxDistance = 20;
    panner.rolloffFactor = 0.4;
    panner.positionX.value = dir[0] * R;
    panner.positionY.value = dir[1] * R;
    panner.positionZ.value = dir[2] * R;
    panner.connect(busIn);

    const gain = ac.createGain();
    gain.gain.value = 0.0001;
    gain.connect(panner);

    // scattered microtonal void pitch — a dissonant smear per voice
    const voidHz = unisonHz * (1 + (rng() * 2 - 1) * 0.11);

    const oscA = ac.createOscillator();
    const oscB = ac.createOscillator();
    oscA.type = i >= 6 ? "triangle" : "sine";
    oscB.type = "sine";
    oscA.frequency.value = voidHz;
    oscB.frequency.value = voidHz;
    oscA.detune.value = -28;
    oscB.detune.value = 28;
    oscA.connect(gain);
    oscB.connect(gain);
    oscA.start(now);
    oscB.start(now);

    // a breath of filtered noise on the lower half of the choir
    let noise: AudioBufferSourceNode | null = null;
    if (i % 2 === 0) {
      noise = ac.createBufferSource();
      noise.buffer = breathBuf;
      noise.loop = true;
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = unisonHz * 2;
      bp.Q.value = 4;
      const ng = ac.createGain();
      ng.gain.value = 0.05;
      noise.connect(bp);
      bp.connect(ng);
      ng.connect(gain);
      noise.start(now);
    }

    // staggered entrance — the void "opens" one voice at a time
    const target = i >= 6 ? 0.05 : 0.13;
    gain.gain.exponentialRampToValueAtTime(target, now + 3 + i * 0.9);

    return {
      oscA,
      oscB,
      gain,
      panner,
      noise,
      voidHz,
      unisonHz,
      breathPhase: rng() * Math.PI * 2,
      level: target,
    };
  });

  let stopped = false;

  return {
    update(dtl: number, yaw: number, pitch: number) {
      if (stopped) return;
      const t = ac.currentTime;
      const s = smoothstep(dtl);

      // ── head-tracked listener: the whole field rotates around the head ──
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const forward: [number, number, number] = [sy * cp, sp, -cy * cp];
      const right: [number, number, number] = [cy, 0, sy];
      const up = cross(right, forward);
      const L = ac.listener;
      if (L.forwardX) {
        L.forwardX.setTargetAtTime(forward[0], t, 0.05);
        L.forwardY.setTargetAtTime(forward[1], t, 0.05);
        L.forwardZ.setTargetAtTime(forward[2], t, 0.05);
        L.upX.setTargetAtTime(up[0], t, 0.05);
        L.upY.setTargetAtTime(up[1], t, 0.05);
        L.upZ.setTargetAtTime(up[2], t, 0.05);
      } else {
        // deprecated fallback for older Safari
        (
          L as unknown as {
            setOrientation: (
              fx: number,
              fy: number,
              fz: number,
              ux: number,
              uy: number,
              uz: number,
            ) => void;
          }
        ).setOrientation(
          forward[0],
          forward[1],
          forward[2],
          up[0],
          up[1],
          up[2],
        );
      }

      // ── the void → light acoustic move ──
      filter.frequency.setTargetAtTime(320 + s * 6200, t, 0.5);
      wet.gain.setTargetAtTime(0.9 - s * 0.35, t, 0.8);
      dry.gain.setTargetAtTime(0.5 + s * 0.28, t, 0.8);

      const detune = 28 - s * 22; // scattered → tight beating chorus
      voices.forEach((v) => {
        // pitches slew from the scattered cluster toward the unison chord
        const hz = v.voidHz + (v.unisonHz - v.voidHz) * s;
        v.oscA.frequency.setTargetAtTime(hz, t, 0.5);
        v.oscB.frequency.setTargetAtTime(hz, t, 0.5);
        v.oscA.detune.setTargetAtTime(-detune, t, 0.6);
        v.oscB.detune.setTargetAtTime(detune, t, 0.6);
        // slow independent breath — luminance-style amplitude drift, no strobe
        v.breathPhase += 0.0009;
        const breath = 1 + 0.14 * Math.sin(v.breathPhase);
        v.gain.gain.setTargetAtTime(v.level * breath * (0.75 + s * 0.45), t, 0.6);
      });
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = ac.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      voices.forEach((v) => {
        try {
          v.oscA.stop(t + 1.6);
          v.oscB.stop(t + 1.6);
          v.noise?.stop(t + 1.6);
        } catch {
          /* already stopped */
        }
      });
      window.setTimeout(() => {
        voices.forEach((v) => {
          v.oscA.disconnect();
          v.oscB.disconnect();
          v.noise?.disconnect();
          v.gain.disconnect();
          v.panner.disconnect();
        });
        busIn.disconnect();
        filter.disconnect();
        convolver.disconnect();
        wet.disconnect();
        dry.disconnect();
        limiter.disconnect();
        master.disconnect();
      }, 1800);
    },
  };
}
