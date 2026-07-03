/**
 * 1123 · Conductor-Veil — the unseen ensemble.
 *
 * Signal path:
 *   4 sections (saw + triangle) ─┐
 *   pad drone (root + sub)       ├─▶ toneBus ─▶ brightness(LP) ─▶ tremolo ─┐
 *                                │                                          │
 *                                └─▶ reverbSend ─▶ convolver ─▶ wet ────────┤
 *                                                                            ▼
 *                                                              master ─▶ limiter ─▶ out
 *
 *   • 4 lightly-detuned oscillator "sections", each a saw+triangle pair, voice
 *     one tone of a slowly-cycling just-intonation chord. Every chord is drawn
 *     from ONE just major scale over a warm A2 (~110 Hz) root, so there are no
 *     wrong notes.
 *   • A sustaining pad drone (root + sub-octave) underpins everything.
 *   • Register glides the whole ensemble up to +1.2 octaves with hand height;
 *     a lowpass tracks height for brightness; a vibrato LFO on detune and a
 *     tremolo LFO on level deepen with gesture energy (dynamics).
 *   • Hall reverb is a synthesized impulse (OfflineAudioContext-rendered
 *     decaying filtered noise — no file fetch). A DynamicsCompressor limits the
 *     conservative master (~0.13 peak).
 */

const ROOT = 110.0; // A2 — warm root

/** One just major scale — every chord tone comes from here → no wrong notes. */
const SCALE = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2];

/**
 * Chord progression as ratio sets (4 tones each), all consonant members of the
 * scale (octave multiples allowed). I – IV – vi – V, warm and cyclic.
 */
const CHORDS: number[][] = [
  [1, 5 / 4, 3 / 2, 2], // I  (A major)
  [4 / 3, 5 / 3, 2, 5 / 2], // IV (D major, voiced up)
  [5 / 3, 2, 5 / 2, 10 / 3], // vi (F#-ish minor from 5/3)
  [3 / 2, 15 / 8, 9 / 4, 3], // V  (E major, voiced up)
];

/** Reference the scale so lint sees it used and it documents intent. */
export const JUST_SCALE = SCALE;

interface Section {
  saw: OscillatorNode;
  tri: OscillatorNode;
  gain: GainNode;
  ratio: number;
}

export interface ConductorControls {
  register: number; // 0 .. 1.2 octave shift
  brightness: number; // 0..1
  energy: number; // 0..1 dynamics
}

export interface ConductorAudio {
  begin: () => void;
  /** Continuous per-frame update from the conductor state. */
  update: (c: ConductorControls) => void;
  /** A detected downbeat: advance & re-voice the ensemble. */
  downbeat: (intensity: number) => void;
  stop: () => void;
}

/** Render a short hall impulse: decaying filtered noise, no file fetch. */
async function makeReverbImpulse(sampleRate: number): Promise<AudioBuffer> {
  const seconds = 2.8;
  const len = Math.max(1, Math.floor(seconds * sampleRate));
  const offline = new OfflineAudioContext(2, len, sampleRate);

  const noise = offline.createBufferSource();
  const nb = offline.createBuffer(2, len, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = nb.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 2.5);
      // One-time IR synthesis (not a per-frame path) — Math.random is fine here.
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  noise.buffer = nb;

  // Warm the tail: gentle lowpass so the hall is soft, not hissy.
  const lp = offline.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3200;
  lp.Q.value = 0.5;

  noise.connect(lp);
  lp.connect(offline.destination);
  noise.start();
  return offline.startRendering();
}

export function makeConductorAudio(ctx: AudioContext): ConductorAudio {
  const now = ctx.currentTime;

  // ── master chain ──
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(limiter);

  // Tremolo (level) LFO acts on this node's gain, depth from energy.
  const tremolo = ctx.createGain();
  tremolo.gain.value = 1;
  tremolo.connect(master);

  const brightness = ctx.createBiquadFilter();
  brightness.type = "lowpass";
  brightness.frequency.value = 900;
  brightness.Q.value = 0.5;
  brightness.connect(tremolo);

  const toneBus = ctx.createGain();
  toneBus.gain.value = 1;
  toneBus.connect(brightness);

  // ── reverb ──
  const convolver = ctx.createConvolver();
  const wet = ctx.createGain();
  wet.gain.value = 0.075;
  convolver.connect(wet);
  wet.connect(master);
  makeReverbImpulse(ctx.sampleRate)
    .then((buf) => {
      convolver.buffer = buf;
    })
    .catch(() => {
      /* reverb optional; ensemble still plays dry */
    });

  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.85;
  reverbSend.connect(convolver);

  const busFor = (node: AudioNode) => {
    node.connect(toneBus);
    node.connect(reverbSend);
  };

  // ── vibrato LFO (detune, cents) — shared across sections ──
  const vibLfo = ctx.createOscillator();
  vibLfo.type = "sine";
  vibLfo.frequency.value = 5.4;
  const vibDepth = ctx.createGain();
  vibDepth.gain.value = 0; // cents, opened by energy
  vibLfo.connect(vibDepth);
  vibLfo.start();

  // ── tremolo LFO (level) ──
  const tremLfo = ctx.createOscillator();
  tremLfo.type = "sine";
  tremLfo.frequency.value = 4.2;
  const tremDepth = ctx.createGain();
  tremDepth.gain.value = 0; // 0..~0.18, opened by energy
  tremLfo.connect(tremDepth);
  tremDepth.connect(tremolo.gain);
  tremLfo.start();

  // ── 4 sections ──
  const chord0 = CHORDS[0];
  const sections: Section[] = chord0.map((ratio, i) => {
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    busFor(gain);

    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = ROOT * ratio;
    saw.detune.value = (i - 1.5) * 3; // light per-section detune
    vibDepth.connect(saw.detune);

    const tri = ctx.createOscillator();
    tri.type = "triangle";
    tri.frequency.value = ROOT * ratio;
    tri.detune.value = (i - 1.5) * -3;
    vibDepth.connect(tri.detune);

    // Saw is quieter (rich) blended under the rounder triangle.
    const sawGain = ctx.createGain();
    sawGain.gain.value = 0.4;
    saw.connect(sawGain);
    sawGain.connect(gain);
    tri.connect(gain);

    saw.start(now);
    tri.start(now);
    return { saw, tri, gain, ratio };
  });

  // ── pad drone: root + sub-octave ──
  const makeDrone = (freq: number, type: OscillatorType, level: number) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    osc.connect(g);
    busFor(g);
    osc.start(now);
    return { osc, g, level };
  };
  const droneRoot = makeDrone(ROOT, "triangle", 0.5);
  const droneSub = makeDrone(ROOT / 2, "sine", 0.6);

  let octaveMul = 1;
  let chordIndex = 0;
  let started = false;

  const glide = (param: AudioParam, target: number, t: number) => {
    param.setTargetAtTime(target, ctx.currentTime, t);
  };

  const begin = () => {
    if (started) return;
    started = true;
    // Ease drones + sections in.
    glide(master.gain, 0.13, 0.6);
    glide(droneRoot.g.gain, 0.06 * droneRoot.level, 1.2);
    glide(droneSub.g.gain, 0.06 * droneSub.level, 1.2);
    for (const s of sections) glide(s.gain.gain, 0.05, 1.2);
  };

  const update = (c: ConductorControls) => {
    octaveMul = Math.pow(2, c.register);
    const t = ctx.currentTime;
    // Register glide: whole ensemble shifts up to +1.2 octaves.
    for (const s of sections) {
      const f = ROOT * s.ratio * octaveMul;
      s.saw.frequency.setTargetAtTime(f, t, 0.08);
      s.tri.frequency.setTargetAtTime(f, t, 0.08);
    }
    droneRoot.osc.frequency.setTargetAtTime(ROOT * octaveMul, t, 0.15);
    droneSub.osc.frequency.setTargetAtTime((ROOT / 2) * octaveMul, t, 0.15);

    // Brightness lowpass follows height.
    const cutoff = 380 + c.brightness * 5200;
    brightness.frequency.setTargetAtTime(cutoff, t, 0.1);

    // Dynamics: energy opens vibrato depth (cents), tremolo depth, and level.
    vibDepth.gain.setTargetAtTime(4 + c.energy * 16, t, 0.15);
    tremDepth.gain.setTargetAtTime(c.energy * 0.16, t, 0.15);
    const level = 0.09 + c.energy * 0.05; // conservative peak
    if (started) master.gain.setTargetAtTime(level, t, 0.2);
  };

  const downbeat = (intensity: number) => {
    if (!started) return;
    chordIndex = (chordIndex + 1) % CHORDS.length;
    const chord = CHORDS[chordIndex];
    const t = ctx.currentTime;
    // Re-voice each section to the new chord tone (glide, no clicks) and give a
    // gentle swell on the beat scaled by gesture intensity.
    sections.forEach((s, i) => {
      s.ratio = chord[i];
      const f = ROOT * s.ratio * octaveMul;
      s.saw.frequency.setTargetAtTime(f, t, 0.06);
      s.tri.frequency.setTargetAtTime(f, t, 0.06);
      const peak = 0.05 + intensity * 0.03;
      s.gain.gain.cancelScheduledValues(t);
      s.gain.gain.setTargetAtTime(peak, t, 0.02);
      s.gain.gain.setTargetAtTime(0.05, t + 0.12, 0.35);
    });
  };

  const stop = () => {
    const t = ctx.currentTime;
    glide(master.gain, 0.0001, 0.25);
    const stopAt = t + 0.5;
    try {
      for (const s of sections) {
        s.saw.stop(stopAt);
        s.tri.stop(stopAt);
      }
      droneRoot.osc.stop(stopAt);
      droneSub.osc.stop(stopAt);
      vibLfo.stop(stopAt);
      tremLfo.stop(stopAt);
    } catch {
      /* already stopped */
    }
  };

  return { begin, update, downbeat, stop };
}
