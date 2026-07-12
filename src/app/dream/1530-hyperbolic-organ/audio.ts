// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the "organ": a quiet just-intonation drone bed plus struck FM
// bells, one per hyperbolic move. Web Audio only. Everything routes through a
// master gain (≤ 0.2) into a DynamicsCompressor before destination. Bell
// polyphony is capped so at most a handful of voices sound at once.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_VOICES = 12; // well under the 14-voice ceiling

interface DronePart {
  osc: OscillatorNode;
  mult: number;
}

interface Voice {
  end: number;
  stop: () => void;
}

export interface OrganAudio {
  /** Retune the drone bed to a new root (Hz). */
  setRoot: (freq: number) => void;
  /** Strike one bell at `freq` Hz with timbral brightness 0..1. */
  ring: (freq: number, brightness: number) => void;
  /** Tear everything down. */
  stop: () => void;
}

export function makeOrganAudio(ctx: AudioContext, masterLevel = 0.18): OrganAudio {
  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 24;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;
  master.connect(comp);
  comp.connect(ctx.destination);

  const t0 = ctx.currentTime;
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(masterLevel, t0 + 2.2);

  // ── drone bed ──
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.085;
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = "lowpass";
  droneFilter.frequency.value = 780;
  droneFilter.Q.value = 0.7;
  droneFilter.connect(droneGain);
  droneGain.connect(master);

  const spec: { mult: number; detune: number; type: OscillatorType; lvl: number }[] = [
    { mult: 0.5, detune: -4, type: "sine", lvl: 0.9 },
    { mult: 1, detune: 3, type: "triangle", lvl: 0.7 },
    { mult: 1.5, detune: 6, type: "sine", lvl: 0.35 },
    { mult: 2, detune: -8, type: "sine", lvl: 0.3 },
  ];
  let root = 130.81; // C3
  const parts: DronePart[] = [];
  for (const s of spec) {
    const osc = ctx.createOscillator();
    osc.type = s.type;
    osc.frequency.value = root * s.mult;
    osc.detune.value = s.detune;
    const g = ctx.createGain();
    g.gain.value = s.lvl;
    osc.connect(g);
    g.connect(droneFilter);
    osc.start();
    parts.push({ osc, mult: s.mult });
  }

  // ── struck bells ──
  const voices: Voice[] = [];

  const setRoot = (freq: number): void => {
    root = freq;
    const now = ctx.currentTime;
    for (const p of parts) {
      p.osc.frequency.setTargetAtTime(freq * p.mult, now, 0.07);
    }
  };

  const ring = (freq: number, brightness: number): void => {
    if (voices.length >= MAX_VOICES) {
      const v = voices.shift();
      v?.stop();
    }
    const now = ctx.currentTime;
    const dur = 1.7;
    const peak = 0.055;

    const car = ctx.createOscillator();
    car.type = "sine";
    car.frequency.value = freq;

    // Inharmonic modulator → a bell-like metallic ring.
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * 2.41;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(freq * (1.1 + 1.8 * brightness), now);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.05, now + dur);
    mod.connect(modGain);
    modGain.connect(car.frequency);

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq * 1.8;
    bp.Q.value = 1.4;

    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0.0001, now);
    vg.gain.linearRampToValueAtTime(peak, now + 0.008);
    vg.gain.exponentialRampToValueAtTime(0.0006, now + dur);

    car.connect(bp);
    bp.connect(vg);
    vg.connect(master);

    car.start(now);
    mod.start(now);
    car.stop(now + dur + 0.05);
    mod.stop(now + dur + 0.05);

    const voice: Voice = {
      end: now + dur,
      stop: () => {
        try {
          car.stop();
          mod.stop();
        } catch {
          /* already stopped */
        }
      },
    };
    car.onended = () => {
      const i = voices.indexOf(voice);
      if (i >= 0) voices.splice(i, 1);
    };
    voices.push(voice);
  };

  const stop = (): void => {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(0.0001, now, 0.08);
    for (const p of parts) {
      try {
        p.osc.stop(now + 0.3);
      } catch {
        /* already stopped */
      }
    }
    for (const v of voices) v.stop();
    voices.length = 0;
  };

  return { setRoot, ring, stop };
}
