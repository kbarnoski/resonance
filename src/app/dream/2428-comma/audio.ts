// Web Audio engine for "The circle of fifths that will not close".
//
// Two persistent additive voices (lower + upper of the current fifth).
// Each voice is the sum of 6 sine partials at f, 2f, 3f ... 6f with
// amplitude 1/k. This is what makes the beating REAL: a pure 3:2 fifth
// lines the upper voice's 2nd partial (2 * 1.5f = 3f) exactly onto the
// lower voice's 3rd partial, so it locks beatlessly. A tempered
// (narrowed) fifth pulls those partials a fraction of a hertz apart and
// you hear the slow beat / roughness of equal temperament.

const N_PARTIALS = 6;

interface Voice {
  gain: GainNode;
  oscs: OscillatorNode[];
}

export interface CommaAudio {
  readonly ok: boolean;
  start: () => Promise<void>;
  setInterval: (lowerHz: number, ratio: number) => void;
  ping: (aHz: number, bHz: number) => void;
  dispose: () => void;
}

export function createCommaAudio(): CommaAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  const voices: Voice[] = [];
  let ok = true;

  const AC: typeof AudioContext | undefined =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;

  function build() {
    if (!AC) {
      ok = false;
      return;
    }
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const voiceLevels = [0.5, 0.46];
    for (let v = 0; v < 2; v++) {
      const g = ctx.createGain();
      g.gain.value = voiceLevels[v];
      g.connect(master);
      const oscs: OscillatorNode[] = [];
      for (let k = 1; k <= N_PARTIALS; k++) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = 220 * k;
        const pg = ctx.createGain();
        pg.gain.value = 1 / k;
        o.connect(pg);
        pg.connect(g);
        o.start();
        oscs.push(o);
      }
      voices.push({ gain: g, oscs });
    }
  }

  return {
    get ok() {
      return ok;
    },

    async start() {
      if (!AC) {
        ok = false;
        throw new Error("Web Audio unavailable");
      }
      if (!ctx) build();
      if (!ctx || !master) throw new Error("audio init failed");
      if (ctx.state === "suspended") await ctx.resume();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0.12, ctx.currentTime, 0.15);
    },

    setInterval(lowerHz: number, ratio: number) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const funds = [lowerHz, lowerHz * ratio];
      voices.forEach((voice, i) => {
        voice.oscs.forEach((o, ki) => {
          o.frequency.setTargetAtTime(funds[i] * (ki + 1), t, 0.04);
        });
      });
    },

    // A short, rough "wolf" flourish — two near-clashing sines whose
    // beating is fast enough to sound restless (used when the 12th pure
    // fifth overshoots the octave by a whole comma).
    ping(aHz: number, bHz: number) {
      if (!ctx || !master) return;
      const t = ctx.currentTime;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.18, t + 0.04);
      env.gain.setTargetAtTime(0, t + 0.5, 0.35);
      env.connect(master);
      [aHz, bHz].forEach((f) => {
        const o = ctx!.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        const og = ctx!.createGain();
        og.gain.value = 0.5;
        o.connect(og);
        og.connect(env);
        o.start(t);
        o.stop(t + 1.6);
      });
    },

    dispose() {
      voices.forEach((voice) =>
        voice.oscs.forEach((o) => {
          try {
            o.stop();
          } catch {
            /* already stopped */
          }
          o.disconnect();
        })
      );
      voices.length = 0;
      if (ctx) {
        ctx.close().catch(() => {});
        ctx = null;
      }
      master = null;
    },
  };
}
