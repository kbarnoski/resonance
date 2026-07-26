// ════════════════════════════════════════════════════════════════════════════
// audio.ts — a warm, continuous, INHARMONIC drone bloom for 2864-stillpoint.
//
// Deliberately NOT the shared just-intonation droneBank: the brief asks for no
// scale-snapping to a "pretty" pentatonic/JI chord. Instead a stack of partials
// at stretched, irrational ratios blooms open as the reducing valve opens —
//   • more partials fade in (thin at rest → thick at breakthrough),
//   • detune/beating deepens,
//   • a feedback delay lengthens its reverb-ish tail,
//   • a lowpass opens and the whole bed swells.
// When the valve snaps shut on movement it thins and quiets within ~0.5s.
// Web Audio only.
// ════════════════════════════════════════════════════════════════════════════

// Stretched, inharmonic partial ratios above the root — no octaves/fifths.
const RATIOS = [1.0, 2.09, 3.31, 4.17, 5.43, 6.79, 8.11];
const ROOT_HZ = 46;

export interface StillpointAudio {
  setValve(v: number): void;
  stop(): void;
}

interface Partial {
  a: OscillatorNode;
  b: OscillatorNode;
  gain: GainNode;
}

export function startStillpointAudio(): StillpointAudio | null {
  let ctx: AudioContext;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  if (ctx.state === "suspended") void ctx.resume();

  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 2.5);

  // opens with the valve — calm sub at rest, airy bloom as geometry takes over.
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 320;
  lp.Q.value = 0.6;

  // feedback delay = the "reverb-ish tail" that lengthens with the valve.
  const delay = ctx.createDelay(1.5);
  delay.delayTime.value = 0.38;
  const fb = ctx.createGain();
  fb.gain.value = 0.2;
  const wet = ctx.createGain();
  wet.gain.value = 0.0;

  lp.connect(master);
  lp.connect(delay);
  delay.connect(fb);
  fb.connect(delay); // feedback loop
  delay.connect(wet);
  wet.connect(master);
  master.connect(ctx.destination);

  const partials: Partial[] = [];
  for (let i = 0; i < RATIOS.length; i++) {
    const f = ROOT_HZ * RATIOS[i];
    const gain = ctx.createGain();
    // only the fundamental sounds at rest; higher partials start silent.
    gain.gain.value = i === 0 ? 0.5 : 0.0001;
    gain.connect(lp);

    const a = ctx.createOscillator();
    a.type = i === 0 ? "sine" : "triangle";
    a.frequency.value = f;

    const b = ctx.createOscillator();
    b.type = i === 0 ? "sine" : "triangle";
    b.frequency.value = f;
    b.detune.value = 6;

    a.connect(gain);
    b.connect(gain);
    a.start();
    b.start();
    partials.push({ a, b, gain });
  }

  let stopped = false;

  function setValve(v: number): void {
    if (stopped) return;
    const val = Math.min(1, Math.max(0, v));
    const now = ctx.currentTime;

    // lowpass opens exponentially with the valve
    const cutoff = 320 * Math.pow(3200 / 320, val);
    lp.frequency.setTargetAtTime(cutoff, now, 0.18);
    lp.Q.setTargetAtTime(0.6 + val * 2.0, now, 0.2);

    // longer, louder tail as we still
    wet.gain.setTargetAtTime(val * 0.5, now, 0.2);
    fb.gain.setTargetAtTime(0.2 + val * 0.55, now, 0.2);
    delay.delayTime.setTargetAtTime(0.32 + val * 0.5, now, 0.5);

    // partials bloom in one by one across the valve range
    for (let i = 0; i < partials.length; i++) {
      const p = partials[i];
      const threshold = i / partials.length; // 0, 1/7, ...
      const span = 0.35;
      const amt = Math.min(1, Math.max(0, (val - threshold) / span));
      const target = i === 0 ? 0.5 : amt * (0.42 / (1 + i * 0.5));
      p.gain.gain.setTargetAtTime(Math.max(0.0001, target), now, 0.22);
      // beating deepens with the valve
      p.b.detune.setTargetAtTime(6 + val * 22 + i * 2, now, 0.3);
    }

    // overall swell
    master.gain.setTargetAtTime(0.6 * (0.55 + 0.45 * val), now, 0.25);
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    const now = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    } catch {
      /* context closing */
    }
    const killAt = now + 0.6;
    for (const p of partials) {
      try {
        p.a.stop(killAt);
        p.b.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
    window.setTimeout(() => {
      try {
        void ctx.close();
      } catch {
        /* already closed */
      }
    }, 700);
  }

  return { setValve, stop };
}
