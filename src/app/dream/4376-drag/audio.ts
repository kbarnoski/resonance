// ─────────────────────────────────────────────────────────────────────────────
// 4376 · Drag — Web Audio engine
//
// The delay line IS the instrument. A tap is a short marimba-ish pluck; the same
// signal is fed into a DelayNode whose time is 2× the one-way "canyon" delay
// (there and back). A soft feedback loop through a lowpass gives a couple of
// dimmer, darker, canyon-panned repeats — "the other you, one canyon-width ago".
// No AnalyserNode / FFT: this piece reasons about TIMING, not spectrum.
// ─────────────────────────────────────────────────────────────────────────────

type Ctor = typeof AudioContext;

export type DragAudio = {
  resume: () => Promise<void>;
  suspended: () => boolean;
  setCanyon: (oneWayMs: number) => void;
  setMetro: (on: boolean) => void;
  playTap: (freq: number, atCtxTime: number, gain?: number) => void;
  tick: (atCtxTime: number) => void;
  now: () => number;
};

export function makeAudio(): DragAudio | null {
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  const AC = w.AudioContext ?? w.webkitAudioContext;
  if (!AC) return null;

  let ctx: AudioContext;
  try {
    ctx = new AC();
  } catch {
    return null;
  }

  const master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(ctx.destination);

  // Dry path — your live tap, panned slightly to one wall of the canyon.
  const dryPan = ctx.createStereoPanner();
  dryPan.pan.value = 0.25;
  dryPan.connect(master);

  // Echo path — the delayed return: dimmer, lowpassed (distant), panned opposite.
  const delay = ctx.createDelay(2.0);
  delay.delayTime.value = 0.18;
  const echoLP = ctx.createBiquadFilter();
  echoLP.type = "lowpass";
  echoLP.frequency.value = 1500;
  echoLP.Q.value = 0.4;
  const echoPan = ctx.createStereoPanner();
  echoPan.pan.value = -0.6;
  const echoGain = ctx.createGain();
  echoGain.gain.value = 0.5;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.34;

  delay.connect(echoLP);
  echoLP.connect(echoPan);
  echoPan.connect(echoGain);
  echoGain.connect(master);
  echoLP.connect(feedback); // repeats re-filter → each return darker / further
  feedback.connect(delay);

  // Quiet metronome — the true pulse you try to hold.
  const metroGain = ctx.createGain();
  metroGain.gain.value = 0.09;
  metroGain.connect(master);

  function playTap(freq: number, atCtxTime: number, gain = 0.5): void {
    const t = Math.max(atCtxTime, ctx.currentTime);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const partial = ctx.createOscillator();
    partial.type = "sine";
    partial.frequency.value = freq * 3.9; // inharmonic bar partial → marimba bite
    const pg = ctx.createGain();
    pg.gain.value = 0.16;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.0008, t + 0.5);

    osc.connect(amp);
    partial.connect(pg);
    pg.connect(amp);
    amp.connect(dryPan); // dry (heard now)
    amp.connect(delay); // and cast across the canyon (heard later)

    osc.start(t);
    partial.start(t);
    osc.stop(t + 0.55);
    partial.stop(t + 0.55);
  }

  function tick(atCtxTime: number): void {
    const t = Math.max(atCtxTime, ctx.currentTime);
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 1568; // G6 blip
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(1, t + 0.001);
    amp.gain.exponentialRampToValueAtTime(0.0005, t + 0.03);
    osc.connect(amp);
    amp.connect(metroGain);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  return {
    resume: () => ctx.resume(),
    suspended: () => ctx.state !== "running",
    setCanyon: (oneWayMs: number) => {
      const rt = clampMs(2 * oneWayMs) / 1000;
      delay.delayTime.setTargetAtTime(rt, ctx.currentTime, 0.04);
    },
    setMetro: (on: boolean) => {
      metroGain.gain.setTargetAtTime(on ? 0.09 : 0.0001, ctx.currentTime, 0.02);
    },
    playTap,
    tick,
    now: () => ctx.currentTime,
  };
}

function clampMs(ms: number): number {
  return ms < 1 ? 1 : ms > 1900 ? 1900 : ms;
}
