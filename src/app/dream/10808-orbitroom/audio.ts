// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the WebAudio HRTF spatial field for orbit•room.
//
// Five soft inharmonic voices sit at fixed points around a virtual room, each
// through a PannerNode in panningModel:"HRTF". The single AudioListener is MOVED
// by the visitor's body centroid (X = walk left/right, Z = closeness) so on
// headphones the whole chord swings and orbits in genuine binaural 3-D.
//
// Each voice is a calm cosmic-ambient tone: a few detuned sine partials on an
// inharmonic ratio set, its overall level breathing under a very slow LFO. The
// listener setters prefer AudioParam.setTargetAtTime (~50 ms) over instantaneous
// jumps, because localisation degrades badly under pose jitter.
// ─────────────────────────────────────────────────────────────────────────────

/** Public view of one source, for the top-down room-map viz. */
export interface SourceView {
  /** Fixed world position (metres) in the room plane. */
  x: number;
  z: number;
  /** Hue for the map dot (violet→cyan). */
  hue: number;
  /** Current breathing level 0..1 — drives the map dot's size / brightness. */
  level: number;
}

export interface OrbitAudio {
  /** Move the listener (metres). Smoothed; y is ear height (kept ~0). */
  setListener: (x: number, y: number, z: number) => void;
  /** Advance the breathing LFOs by dt seconds. */
  step: (dt: number) => void;
  /** Snapshot of every source for the viz (position + current level). */
  sources: SourceView[];
  stop: () => void;
}

/** Room ring radius (metres) the sources are placed on. */
export const ROOM_RING = 2.3;

// A low, calm just/inharmonic drone set — meditative, not a melody.
const VOICES: { freq: number; hue: number; lfoHz: number }[] = [
  { freq: 55.0, hue: 262, lfoHz: 0.032 }, // A1
  { freq: 66.0, hue: 232, lfoHz: 0.047 }, // 6/5
  { freq: 82.5, hue: 205, lfoHz: 0.039 }, // 3/2
  { freq: 88.0, hue: 246, lfoHz: 0.055 }, // 8/5
  { freq: 110.0, hue: 190, lfoHz: 0.028 }, // 2/1
];

/** Fixed room-plane layout of the sources (metres) + map hue + breathing rate.
 *  Exported so the room-map viz can draw the sources before audio has started. */
export function sourceLayout(): {
  x: number;
  z: number;
  hue: number;
  lfoHz: number;
}[] {
  return VOICES.map((spec, i) => {
    const theta = -Math.PI / 2 + (i / VOICES.length) * Math.PI * 2;
    return {
      x: ROOM_RING * Math.cos(theta),
      z: ROOM_RING * Math.sin(theta),
      hue: spec.hue,
      lfoHz: spec.lfoHz,
    };
  });
}

// Inharmonic partial ratios + relative gains for each soft voice.
const PARTIALS: { ratio: number; gain: number }[] = [
  { ratio: 1.0, gain: 1.0 },
  { ratio: 1.004, gain: 0.6 }, // detuned unison → width
  { ratio: 2.01, gain: 0.34 },
  { ratio: 3.02, gain: 0.15 },
];

const BASE_LEVEL = 0.11; // per-voice ceiling before breathing

interface Voice {
  oscs: OscillatorNode[];
  voiceGain: GainNode;
  panner: PannerNode;
  lfoHz: number;
  lfoPhase: number;
  level: number;
}

function setListenerOrientation(listener: AudioListener) {
  // Face −Z, up +Y (the room's "front" wall is straight ahead).
  if (listener.forwardX) {
    listener.forwardX.value = 0;
    listener.forwardY.value = 0;
    listener.forwardZ.value = -1;
    listener.upX.value = 0;
    listener.upY.value = 1;
    listener.upZ.value = 0;
  } else if (typeof listener.setOrientation === "function") {
    listener.setOrientation(0, 0, -1, 0, 1, 0);
  }
}

export function makeOrbitAudio(
  ctx: AudioContext,
  dest: AudioNode,
): OrbitAudio {
  const now = ctx.currentTime;
  setListenerOrientation(ctx.listener);
  const layout = sourceLayout();

  const voices: Voice[] = VOICES.map((spec, i) => {
    // Spread the sources evenly around the ring, starting at the front wall.
    const { x, z } = layout[i];

    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    panner.maxDistance = 20;
    panner.rolloffFactor = 0.7;
    if (panner.positionX) {
      panner.positionX.value = x;
      panner.positionY.value = 0;
      panner.positionZ.value = z;
    } else {
      panner.setPosition(x, 0, z);
    }

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = BASE_LEVEL * 0.5;
    voiceGain.connect(panner);
    panner.connect(dest);

    const oscs: OscillatorNode[] = PARTIALS.map((part) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = spec.freq * part.ratio;
      const g = ctx.createGain();
      g.gain.value = part.gain / PARTIALS.length;
      osc.connect(g);
      g.connect(voiceGain);
      osc.start(now);
      return osc;
    });

    return {
      oscs,
      voiceGain,
      panner,
      lfoHz: spec.lfoHz,
      lfoPhase: (i / VOICES.length) * Math.PI * 2,
      level: 0.5,
    };
  });

  let clock = 0;
  let stopped = false;

  const sources: SourceView[] = layout.map((s) => ({
    x: s.x,
    z: s.z,
    hue: s.hue,
    level: 0.5,
  }));

  return {
    sources,
    setListener(x: number, y: number, z: number) {
      if (stopped) return;
      const t = ctx.currentTime;
      const l = ctx.listener;
      if (l.positionX) {
        l.positionX.setTargetAtTime(x, t, 0.05);
        l.positionY.setTargetAtTime(y, t, 0.05);
        l.positionZ.setTargetAtTime(z, t, 0.05);
      } else {
        l.setPosition(x, y, z);
      }
    },
    step(dt: number) {
      if (stopped) return;
      clock += dt;
      const t = ctx.currentTime;
      for (let i = 0; i < voices.length; i++) {
        const v = voices[i];
        // Slow breathing: level ∈ [0.35, 1]. Well under any flicker concern.
        const s = 0.5 + 0.5 * Math.sin(clock * v.lfoHz * Math.PI * 2 + v.lfoPhase);
        const level = 0.35 + 0.65 * s;
        v.level = level;
        sources[i].level = level;
        v.voiceGain.gain.setTargetAtTime(BASE_LEVEL * level, t, 0.2);
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      for (const v of voices) {
        try {
          v.voiceGain.gain.cancelScheduledValues(t);
          v.voiceGain.gain.setValueAtTime(v.voiceGain.gain.value, t);
          v.voiceGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
          for (const osc of v.oscs) osc.stop(t + 0.7);
        } catch {
          /* ctx already closing */
        }
      }
    },
  };
}
