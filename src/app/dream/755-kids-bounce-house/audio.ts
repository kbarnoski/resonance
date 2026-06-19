// Kids-safe Web Audio chain + tuned membrane-drum / bell sonification.
//
// Sonic model: a tuned membrane/drum-bell hit (a short pitched body tone +
// a couple of inharmonic modal partials and a soft "skin" thump), the
// pitch chosen from a major-pentatonic so nothing is ever dissonant.
// Master chain (kids-safe): gain<=0.3 -> lowpass<=7500 -> compressor -> out.

export interface AudioChain {
  ctx: AudioContext;
  master: GainNode;
  lowpass: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  padGain: GainNode;
  padFilter: BiquadFilterNode;
}

// C major pentatonic across a kid-friendly low-to-mid range.
// Center of sheet -> low/round (index 0), edge -> higher/brighter.
const PENTA_HZ = [
  130.81, // C3
  146.83, // D3
  164.81, // E3
  196.0, // G3
  220.0, // A3
  261.63, // C4
  293.66, // D4
  329.63, // E4
  392.0, // G4
  440.0, // A4
];

export function startAudio(): AudioChain {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 20;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 7500;

  const master = ctx.createGain();
  master.gain.value = 0.28;

  master.connect(lowpass).connect(comp).connect(ctx.destination);

  // Always-on soft pad: an open fifth (C + G), gently moving.
  const padGain = ctx.createGain();
  padGain.gain.value = 0.0;
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 700;
  padGain.connect(padFilter).connect(master);

  const padFreqs = [65.41, 98.0, 130.81]; // C2, G2, C3 — warm open fifth
  for (const f of padFreqs) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = f;
    const og = ctx.createGain();
    og.gain.value = 0.18;
    // subtle detune shimmer
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = f * 1.003;
    const og2 = ctx.createGain();
    og2.gain.value = 0.12;
    osc.connect(og).connect(padGain);
    osc2.connect(og2).connect(padGain);
    osc.start();
    osc2.start();
  }
  // fade pad in
  padGain.gain.setTargetAtTime(0.16, ctx.currentTime, 0.8);

  return { ctx, master, lowpass, comp, padGain, padFilter };
}

// Drive the pad brightness/level from ongoing sheet ripple activity.
export function applyPadActivity(chain: AudioChain, activity: number): void {
  const t = chain.ctx.currentTime;
  const norm = Math.min(1, activity / 40);
  chain.padFilter.frequency.setTargetAtTime(500 + norm * 900, t, 0.2);
  chain.padGain.gain.setTargetAtTime(0.13 + norm * 0.09, t, 0.3);
}

// Map normalized horizontal position (0=center pitch low, edges high) to a
// pentatonic pitch index. We fold so both edges are brighter than center.
function pitchForPosition(nx: number): number {
  const edgeness = Math.abs(nx - 0.5) * 2; // 0 center .. 1 edge
  const idx = Math.round(edgeness * (PENTA_HZ.length - 1));
  return PENTA_HZ[Math.max(0, Math.min(PENTA_HZ.length - 1, idx))];
}

// A tuned membrane-drum / bell hit. ghost=true makes the auto-demo a touch
// softer so it sits politely under live play.
export function playMembraneHit(
  chain: AudioChain,
  nx: number,
  energy: number,
  ghost: boolean,
): void {
  const ctx = chain.ctx;
  const now = ctx.currentTime;
  const base = pitchForPosition(nx);
  const loud = Math.min(1, energy) * (ghost ? 0.6 : 1);
  const peak = 0.08 + loud * 0.16;

  const hitGain = ctx.createGain();
  hitGain.gain.value = 1;
  hitGain.connect(chain.master);

  // Body tone (round, sine) — the "tuned" pitch of the membrane.
  const body = ctx.createOscillator();
  body.type = "sine";
  body.frequency.value = base;
  const bodyG = ctx.createGain();
  bodyG.gain.setValueAtTime(0, now);
  bodyG.gain.linearRampToValueAtTime(peak, now + 0.012);
  bodyG.gain.exponentialRampToValueAtTime(0.0008, now + 0.7);
  body.connect(bodyG).connect(hitGain);
  body.start(now);
  body.stop(now + 0.8);

  // Inharmonic modal partials (membrane/bell ratios) — bright but quiet.
  const ratios = [1.59, 2.14, 2.92];
  for (let i = 0; i < ratios.length; i++) {
    const p = ctx.createOscillator();
    p.type = "sine";
    p.frequency.value = base * ratios[i];
    const pg = ctx.createGain();
    const pk = peak * (0.18 - i * 0.04);
    pg.gain.setValueAtTime(0, now);
    pg.gain.linearRampToValueAtTime(Math.max(0.002, pk), now + 0.008);
    pg.gain.exponentialRampToValueAtTime(0.0005, now + 0.3 - i * 0.05);
    p.connect(pg).connect(hitGain);
    p.start(now);
    p.stop(now + 0.35);
  }

  // Soft "skin" thump — a quick low sine drop, no click.
  const thump = ctx.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(base * 0.5, now);
  thump.frequency.exponentialRampToValueAtTime(base * 0.34, now + 0.12);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0, now);
  tg.gain.linearRampToValueAtTime(peak * 0.7, now + 0.01);
  tg.gain.exponentialRampToValueAtTime(0.0006, now + 0.2);
  thump.connect(tg).connect(hitGain);
  thump.start(now);
  thump.stop(now + 0.25);
}

// A soft pluck for finger-drag wobble (gentler, higher, even softer).
export function playPluck(chain: AudioChain, nx: number): void {
  const ctx = chain.ctx;
  const now = ctx.currentTime;
  const base = pitchForPosition(nx) * 2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.05, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0005, now + 0.25);
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = base;
  osc.connect(g).connect(chain.master);
  osc.start(now);
  osc.stop(now + 0.3);
}

export function teardownAudio(chain: AudioChain): void {
  try {
    chain.master.disconnect();
    chain.padGain.disconnect();
    chain.padFilter.disconnect();
    chain.lowpass.disconnect();
    chain.comp.disconnect();
    void chain.ctx.close();
  } catch {
    // ignore teardown errors
  }
}
