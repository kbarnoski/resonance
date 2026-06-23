// audio.ts — the spatial grove voice engine.
//
// A FIXED field of ~16 "song-trees" placed at world positions in a shallow arc
// around a listener at the origin. Each tree is a small generative voice (a warm
// bell/marimba pluck or a sustained drone) playing a slow, sparse motif on a soft
// mode (Lydian / pentatonic). Each tree owns its own PannerNode (panningModel
// "HRTF") at its fixed world position — the trees NEVER move. Only the
// AudioListener moves, via setTargetAtTime, as the body walks.
//
// LONG-FORM MEMORY / EVOLUTION (stated explicitly):
//   Every tree drifts over MINUTES, not seconds. On a slow per-tree timer it may
//   (a) transpose its motif by a scale step, (b) change rhythm density (note
//   spacing), (c) swap timbre brightness (filter cutoff + harmonic mix). So the
//   grove heard at minute 5 is meaningfully different from minute 1, and it is
//   never the same twice (seeded per tree, drift is randomized).
//
// Inverts Janet Cardiff & George Bures Miller's *The Forty Part Motet* (2001):
// there the choir is fixed and you walk among the voices — here the field of
// voices is fixed and the LISTENER walks. Spatial-audio-object framing after
// AudioMiXR (arXiv 2502.02929) and MoXaRt (arXiv 2603.10465). Slow generative
// drift after Brian Eno's ambient.

export interface TreeState {
  id: number;
  x: number; // fixed world position (metres-ish)
  y: number;
  z: number;
  hue: number; // 0..1 palette position (indigo→violet→gold), drifts with brightness
  brightness: number; // 0..1 current timbre brightness (also drives canopy glow)
  bloom: number; // 0..1 transient bloom when a note fires or listener is near
  baseDegree: number; // current root degree in the mode (drifts ±1 over minutes)
  density: number; // note spacing seconds (drifts over minutes)
  kind: 0 | 1; // 0 = bell/marimba, 1 = sustained drone
}

export interface GroveState {
  trees: TreeState[];
  listener: { x: number; z: number };
  nearest: number; // index of nearest tree
}

// Soft modes: degrees (semitone offsets) over two octaves. Lydian = bright, open.
const LYDIAN = [0, 2, 4, 6, 7, 9, 11, 12, 14, 16, 18, 19, 21, 23];
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

const TREE_COUNT = 16;
const A_BASE = 138.59; // C#3-ish anchor for a warm, dusky tuning

interface Voice {
  state: TreeState;
  panner: PannerNode;
  gain: GainNode; // per-tree master into panner
  filter: BiquadFilterNode;
  mode: number[];
  rootMidiOffset: number; // fixed pitch offset (spreads trees across register)
  nextNoteAt: number; // ctx time of next motif note
  nextDriftAt: number; // ctx time of next long-form drift event
  seed: number;
  active: { osc: OscillatorNode[]; g: GainNode }[]; // sounding notes for teardown
}

export interface GroveEngine {
  ctx: AudioContext;
  state: GroveState;
  // Move only the listener (HRTF navigation). x lateral, z depth (negative = deeper into grove).
  setListener(x: number, z: number): void;
  // Advance generative scheduling + envelopes. Call ~ once per animation frame.
  update(now: number): void;
  stop(): void;
}

function mtof(midi: number): number {
  return A_BASE * Math.pow(2, midi / 12);
}

// Place trees in a shallow arc/grove: wide in x, set back in -z, gentle y lift.
function buildTreePositions(): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < TREE_COUNT; i++) {
    const t = i / (TREE_COUNT - 1); // 0..1
    const ang = (t - 0.5) * Math.PI * 0.95; // arc roughly ±85°
    const radius = 5.2 + ((i * 37) % 11) * 0.28; // staggered depth so it feels like a grove
    const x = Math.sin(ang) * radius;
    const z = -Math.abs(Math.cos(ang)) * radius - 1.2; // always in front (-z)
    const y = 0.4 + ((i * 53) % 7) * 0.18; // varied canopy heights
    out.push({ x, y, z });
  }
  return out;
}

export function buildGrove(ctx: AudioContext): GroveEngine {
  // HRTF listener setup. We keep forward/up fixed (facing -z, up +y) and only
  // translate the listener position — the body's walk maps to X (lateral) and
  // Z (depth). Trees are static PannerNodes.
  const lst = ctx.listener;
  if (lst.forwardX) {
    lst.forwardX.value = 0;
    lst.forwardY.value = 0;
    lst.forwardZ.value = -1;
    lst.upX.value = 0;
    lst.upY.value = 1;
    lst.upZ.value = 0;
    lst.positionX.value = 0;
    lst.positionY.value = 0;
    lst.positionZ.value = 0;
  } else {
    // Older Safari fallback (deprecated setters).
    lst.setOrientation?.(0, 0, -1, 0, 1, 0);
    lst.setPosition?.(0, 0, 0);
  }

  const master = ctx.createGain();
  master.gain.value = 0.0;
  master.connect(ctx.destination);
  // Gentle fade-in so the grove "arrives" instead of clicking on.
  master.gain.setTargetAtTime(0.85, ctx.currentTime, 1.2);

  // A touch of shared space: a short feedback-free reverb via a convolver-less
  // approach is heavy; instead a subtle highshelf + the per-tree HRTF distance
  // rolloff gives the dusk-forest depth. Keep it lean.

  const positions = buildTreePositions();
  const voices: Voice[] = [];

  for (let i = 0; i < TREE_COUNT; i++) {
    const p = positions[i];
    const seed = (i * 2654435761) % 1000;
    const kind: 0 | 1 = i % 4 === 0 ? 1 : 0; // ~1/4 of the grove are drones
    const mode = i % 3 === 0 ? PENTA : LYDIAN;

    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1.4;
    panner.maxDistance = 30;
    panner.rolloffFactor = 1.1;
    if (panner.positionX) {
      panner.positionX.value = p.x;
      panner.positionY.value = p.y;
      panner.positionZ.value = p.z;
    } else {
      panner.setPosition?.(p.x, p.y, p.z);
    }
    panner.connect(master);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    filter.Q.value = 0.6;
    filter.connect(panner);

    const gain = ctx.createGain();
    gain.gain.value = kind === 1 ? 0.16 : 0.5;
    gain.connect(filter);

    // Spread trees across register: left side lower, right side higher, varied.
    const rootMidiOffset = -12 + i * 1.6 + (seed % 5);

    const state: TreeState = {
      id: i,
      x: p.x,
      y: p.y,
      z: p.z,
      hue: 0.18 + (i / TREE_COUNT) * 0.5,
      brightness: 0.3 + (seed % 100) / 400,
      bloom: 0,
      baseDegree: seed % mode.length,
      density: kind === 1 ? 6 + (seed % 4) : 1.6 + (seed % 30) / 12,
      kind,
    };

    voices.push({
      state,
      panner,
      gain,
      filter,
      mode,
      rootMidiOffset,
      nextNoteAt: ctx.currentTime + 0.2 + (seed % 100) / 60,
      nextDriftAt: ctx.currentTime + 25 + (seed % 40), // first drift after ~25-65s
      seed,
      active: [],
    });
  }

  const state: GroveState = {
    trees: voices.map((v) => v.state),
    listener: { x: 0, z: 0 },
    nearest: 0,
  };

  // Pseudo-random sequence per voice (deterministic-ish via running seed).
  function rnd(v: Voice): number {
    v.seed = (v.seed * 1103515245 + 12345) & 0x7fffffff;
    return v.seed / 0x7fffffff;
  }

  // Fire one motif note for a tree (a soft bell/marimba pluck or a drone swell).
  function fireNote(v: Voice, when: number, nearGain: number) {
    const deg = v.state.baseDegree + Math.floor(rnd(v) * 3); // small melodic step
    const degree = v.mode[deg % v.mode.length];
    const midi = v.rootMidiOffset + degree;
    const freq = mtof(midi);

    const noteGain = ctx.createGain();
    noteGain.connect(v.gain);

    const oscs: OscillatorNode[] = [];
    if (v.state.kind === 0) {
      // bell/marimba: fundamental + a quiet inharmonic partial, fast-ish decay
      const o1 = ctx.createOscillator();
      o1.type = "sine";
      o1.frequency.value = freq;
      const o2 = ctx.createOscillator();
      o2.type = "triangle";
      o2.frequency.value = freq * (2.0 + v.state.brightness * 1.05);
      const partialGain = ctx.createGain();
      partialGain.gain.value = 0.12 + v.state.brightness * 0.22;
      o1.connect(noteGain);
      o2.connect(partialGain).connect(noteGain);
      oscs.push(o1, o2);

      const peak = (0.5 + nearGain * 0.6) * (0.7 + v.state.brightness * 0.3);
      noteGain.gain.setValueAtTime(0.0001, when);
      noteGain.gain.exponentialRampToValueAtTime(peak, when + 0.01);
      const decay = 1.4 + v.state.brightness * 1.6;
      noteGain.gain.exponentialRampToValueAtTime(0.0008, when + decay);
      o1.start(when);
      o2.start(when);
      o1.stop(when + decay + 0.1);
      o2.stop(when + decay + 0.1);
    } else {
      // sustained drone: detuned saws through the tree's lowpass; slow swell.
      const o1 = ctx.createOscillator();
      o1.type = "sawtooth";
      o1.frequency.value = freq;
      o1.detune.value = -6;
      const o2 = ctx.createOscillator();
      o2.type = "sawtooth";
      o2.frequency.value = freq;
      o2.detune.value = 6;
      o1.connect(noteGain);
      o2.connect(noteGain);
      oscs.push(o1, o2);

      const peak = (0.3 + nearGain * 0.5) * 0.6;
      const swell = 2.5;
      const hold = 3.0 + rnd(v) * 3.0;
      noteGain.gain.setValueAtTime(0.0001, when);
      noteGain.gain.linearRampToValueAtTime(peak, when + swell);
      noteGain.gain.setValueAtTime(peak, when + swell + hold);
      noteGain.gain.exponentialRampToValueAtTime(0.0006, when + swell + hold + 2.5);
      const end = when + swell + hold + 2.6;
      o1.start(when);
      o2.start(when);
      o1.stop(end);
      o2.stop(end);
    }

    // bloom the canopy on note onset
    v.state.bloom = Math.min(1, v.state.bloom + 0.7);

    const handle = { osc: oscs, g: noteGain };
    v.active.push(handle);
    // keep the sounding-note list bounded so teardown stays cheap
    if (v.active.length > 8) v.active.shift();
  }

  // Long-form drift: transpose / re-density / re-brighten a tree. Over minutes.
  function applyDrift(v: Voice) {
    const r = rnd(v);
    if (r < 0.4) {
      // transpose root degree ±1 (stay in mode)
      v.state.baseDegree = (v.state.baseDegree + (rnd(v) < 0.5 ? 1 : -1) + v.mode.length) % v.mode.length;
    } else if (r < 0.7) {
      // change rhythm density
      v.state.density =
        v.state.kind === 1 ? 5 + rnd(v) * 6 : 1.2 + rnd(v) * 3.2;
    } else {
      // swap timbre brightness → filter cutoff + harmonic mix + canopy hue
      v.state.brightness = 0.15 + rnd(v) * 0.8;
      v.filter.frequency.setTargetAtTime(
        700 + v.state.brightness * 3200,
        ctx.currentTime,
        3.0,
      );
      v.state.hue = 0.16 + v.state.brightness * 0.55;
    }
    // schedule the next drift in ~25-70s so the grove keeps evolving over minutes
    v.nextDriftAt = ctx.currentTime + 25 + rnd(v) * 45;
  }

  function distTo(v: Voice): number {
    const dx = v.state.x - state.listener.x;
    const dz = v.state.z - state.listener.z;
    return Math.hypot(dx, dz);
  }

  function setListener(x: number, z: number) {
    state.listener.x = x;
    state.listener.z = z;
    const t = ctx.currentTime;
    const tau = 0.08; // smooth glide so panning never zippers
    if (lst.positionX) {
      lst.positionX.setTargetAtTime(x, t, tau);
      lst.positionZ.setTargetAtTime(z, t, tau);
    } else {
      lst.setPosition?.(x, 0, z);
    }
  }

  let lastFrame = ctx.currentTime;
  function update(now: number) {
    const t = ctx.currentTime;
    const dt = Math.min(0.1, Math.max(0, t - lastFrame));
    lastFrame = t;

    // find nearest tree + per-tree proximity gain/bloom
    let nearestIdx = 0;
    let nearestD = Infinity;
    for (let i = 0; i < voices.length; i++) {
      const v = voices[i];
      const d = distTo(v);
      if (d < nearestD) {
        nearestD = d;
        nearestIdx = i;
      }
      // proximity factor 0..1 — blooms a voice in your ears when you walk near
      const near = Math.max(0, 1 - d / 6);
      // canopy brightness eases toward (base brightness + proximity), bloom decays
      const targetGlow = Math.min(1, v.state.brightness * 0.6 + near * 0.7);
      v.state.brightness += (targetGlow - v.state.brightness) * Math.min(1, dt * 2);
      v.state.bloom *= Math.pow(0.5, dt / 0.4); // ~0.4s half-life

      // schedule motif notes
      if (t >= v.nextNoteAt) {
        fireNote(v, Math.max(t, v.nextNoteAt), near);
        const jitter = 0.6 + rnd(v) * 0.9;
        v.nextNoteAt = t + v.state.density * jitter;
      }
      // long-form drift
      if (t >= v.nextDriftAt) {
        applyDrift(v);
      }
    }
    state.nearest = nearestIdx;
    // extra bloom on the very nearest so it clearly "arrives" as you approach
    voices[nearestIdx].state.bloom = Math.min(1, voices[nearestIdx].state.bloom + dt * 1.2);
    void now;
  }

  function stop() {
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(0.0001, t, 0.2);
    for (const v of voices) {
      for (const a of v.active) {
        try {
          for (const o of a.osc) o.stop(t + 0.3);
        } catch {
          /* already stopped */
        }
      }
      v.active = [];
      try {
        v.panner.disconnect();
        v.filter.disconnect();
        v.gain.disconnect();
      } catch {
        /* noop */
      }
    }
    try {
      master.disconnect();
    } catch {
      /* noop */
    }
  }

  return { ctx, state, setListener, update, stop };
}

export { TREE_COUNT };
