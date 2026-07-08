// audio.ts — a DUB-TECHNO rhythm engine for 1305-face-desk. Pure Web Audio: a
// look-ahead transport running a 16-step / 16th-note grid at 124 BPM, driving a
// kick, a filtered dub bass, closed hats, and a chord stab, all fed through a
// feedback ping-pong DUB DELAY and a global low-pass. There is a PULSE — a
// played, four-on-the-floor groove, not a drone. No just-intonation bell spine,
// no shared droneBank, no convolution void-reverb. This has TIME.
//
// Signal path:
//   kick/bass ─┐
//   hat/stab ──┼─► voiceBus ─► globalLP ─► limiter ─► master ─► destination
//              └─(send)─► pingPong delay (L↔R, feedback) ─► limiter
//
// Scheduling uses the classic look-ahead pattern ("A Tale of Two Clocks"): a
// 25 ms setInterval walks the transport and books each step into Web Audio's
// sample clock a little in the future, so timing is rock-steady regardless of
// frame rate.
//
// The engine OWNS the transport. The FACE view calls:
//   setCutoff()   — jawOpen opens the global low-pass (sound blooms open)
//   throwDelay()  — jawOpen crossing ~0.5 sends a dub echo off into the distance
//   setBuild()    — brow raise brings layers in (hats → stab); lower strips back
//   setPan()      — head yaw pans the stab + sets ping-pong feedback
//   setBright()   — smile opens a high shelf / brighter chord voicing
//   stutter()     — a deliberate blink retriggers a quantised beat-stutter
// and reads loopPosition() / stepFlash() to draw the console.

export const STEPS = 16;
const BPM = 124;
const MASTER_PEAK = 0.32;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12; // seconds

// The chord stab: a minor 9th voicing (dub techno's melancholy). Frequencies in Hz.
const STAB_CHORD = [146.83, 174.61, 220.0, 261.63, 329.63]; // D3 F3 A3 C4 E4 (Dm9)

export type LaneName = "kick" | "bass" | "hat" | "stab";

export interface DubEngine {
  /** Smooth playhead 0..16 (float) from the audio clock — for the sweep. */
  loopPosition(): number;
  /** Nearest step to the playhead — where a quantised gesture lands. */
  nearestStep(): number;
  /** 0..1 recency flash for a lane (for the console meters). */
  laneFlash(lane: LaneName): number;
  /** jawOpen → global low-pass cutoff, 0..1 (open mouth = brighter/bloom). */
  setCutoff(v01: number): void;
  /** brow raise → build/intensity, 0..1 (more layers enter). */
  setBuild(v01: number): void;
  /** head yaw → stereo pan of the stab + ping-pong feedback, -1..1. */
  setPan(vNeg1to1: number): void;
  /** smile → harmonic brightness (high shelf + brighter voicing), 0..1. */
  setBright(v01: number): void;
  /** jawOpen crossing threshold → one dub-delay "throw" off into the distance. */
  throwDelay(): void;
  /** deliberate blink → a quantised beat-stutter / retrigger. */
  stutter(): void;
  /** current build level, for the view. */
  getBuild(): number;
  stop(): void;
}

export async function startDub(): Promise<DubEngine> {
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AC();
  await ctx.resume();

  const t0 = ctx.currentTime;

  // ── master chain ─────────────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, t0);
  master.gain.linearRampToValueAtTime(MASTER_PEAK, t0 + 1.4); // gentle fade-in

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-9, t0);
  limiter.knee.setValueAtTime(8, t0);
  limiter.ratio.setValueAtTime(12, t0);
  limiter.attack.setValueAtTime(0.003, t0);
  limiter.release.setValueAtTime(0.22, t0);
  limiter.connect(master);
  master.connect(ctx.destination);

  // Global low-pass — jawOpen sweeps this across the WHOLE groove.
  const globalLP = ctx.createBiquadFilter();
  globalLP.type = "lowpass";
  globalLP.Q.value = 0.9;
  globalLP.frequency.value = 1400;
  globalLP.connect(limiter);

  // A gentle high shelf — smile lifts the air/brightness.
  const shelf = ctx.createBiquadFilter();
  shelf.type = "highshelf";
  shelf.frequency.value = 3200;
  shelf.gain.value = 0;
  shelf.connect(globalLP);

  // Voice bus: everything dry lands here.
  const voiceBus = ctx.createGain();
  voiceBus.gain.value = 1;
  voiceBus.connect(shelf);

  // ── ping-pong dub delay ────────────────────────────────────────────────
  const sec16 = 60 / BPM / 4; // one sixteenth note
  const delayTime = sec16 * 3; // dotted-ish, classic dub throw
  const sendGain = ctx.createGain();
  sendGain.gain.value = 1;
  const dL = ctx.createDelay(1.0);
  const dR = ctx.createDelay(1.0);
  dL.delayTime.value = delayTime;
  dR.delayTime.value = delayTime;
  const fb = ctx.createGain();
  fb.gain.value = 0.4; // feedback amount, nudged by head yaw
  const dTone = ctx.createBiquadFilter(); // echoes get darker as they repeat
  dTone.type = "lowpass";
  dTone.frequency.value = 2000;
  const panL = ctx.createStereoPanner();
  const panR = ctx.createStereoPanner();
  panL.pan.value = -0.85;
  panR.pan.value = 0.85;
  // ping-pong topology: send → dL → panL → out, dL → dR → panR → out, dR → tone → fb → dL
  sendGain.connect(dL);
  dL.connect(panL);
  dL.connect(dR);
  dR.connect(panR);
  dR.connect(dTone);
  dTone.connect(fb);
  fb.connect(dL);
  panL.connect(limiter);
  panR.connect(limiter);

  // Shared white-noise buffer for hats.
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // ── mutable control state ────────────────────────────────────────────────
  let cutoff01 = 0.4; // jawOpen
  let build01 = 0.35; // brow
  let pan = 0; // yaw, -1..1
  let bright01 = 0; // smile
  let stutterUntil = 0; // audio-time until which the stutter retrigger runs
  let stutterStep = 0; // the frozen step the stutter repeats

  const flash: Record<LaneName, number> = { kick: 0, bass: 0, hat: 0, stab: 0 };
  const loopStart = ctx.currentTime;

  // Dub bass line — a rolling offbeat pattern in D minor. One entry per step.
  const BASS_HZ = [
    73.42, 0, 0, 73.42, 0, 73.42, 0, 0, 87.31, 0, 0, 73.42, 0, 98.0, 0, 0,
  ];

  // ── voices ───────────────────────────────────────────────────────────────
  function playKick(at: number, gain = 1) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, at);
    osc.frequency.exponentialRampToValueAtTime(46, at + 0.12);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.98 * gain, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, at + 0.32);
    // click transient
    const click = ctx.createOscillator();
    const cg = ctx.createGain();
    click.type = "square";
    click.frequency.value = 900;
    cg.gain.setValueAtTime(0.25 * gain, at);
    cg.gain.exponentialRampToValueAtTime(0.001, at + 0.02);
    click.connect(cg);
    cg.connect(voiceBus);
    osc.connect(g);
    g.connect(voiceBus);
    osc.start(at);
    osc.stop(at + 0.36);
    click.start(at);
    click.stop(at + 0.03);
  }

  function playBass(at: number, hz: number) {
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    osc.type = "sawtooth";
    sub.type = "sine";
    osc.frequency.setValueAtTime(hz, at);
    sub.frequency.setValueAtTime(hz, at);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 8;
    const base = 220 + build01 * 900;
    lp.frequency.setValueAtTime(base * 1.8, at);
    lp.frequency.exponentialRampToValueAtTime(Math.max(120, base), at + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.6, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, at + sec16 * 2.2);
    osc.connect(lp);
    sub.connect(lp);
    lp.connect(g);
    g.connect(voiceBus);
    osc.start(at);
    sub.start(at);
    osc.stop(at + sec16 * 2.6);
    sub.stop(at + sec16 * 2.6);
  }

  function playHat(at: number, gain: number) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6500 + bright01 * 3500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0006, at + 0.045);
    src.connect(hp);
    hp.connect(g);
    g.connect(voiceBus);
    // a touch of hat goes to the dub delay
    const s = ctx.createGain();
    s.gain.value = 0.25;
    g.connect(s);
    s.connect(sendGain);
    src.start(at);
    src.stop(at + 0.08);
  }

  // The signature dub chord STAB — short, filtered, panned, thrown to the delay.
  function playStab(at: number, sendAmt: number) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.34, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, at + sec16 * 1.6);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 800 + bright01 * 3800 + build01 * 600;
    lp.Q.value = 2;
    const pn = ctx.createStereoPanner();
    pn.pan.value = pan;
    // brighter (smile) voicing adds the 9th an octave up
    const notes = bright01 > 0.4 ? [...STAB_CHORD, STAB_CHORD[4] * 2] : STAB_CHORD;
    for (const hz of notes) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = hz;
      const og = ctx.createGain();
      og.gain.value = 0.2;
      o.connect(og);
      og.connect(lp);
      o.start(at);
      o.stop(at + sec16 * 1.8);
    }
    lp.connect(g);
    g.connect(pn);
    pn.connect(voiceBus);
    // send to the dub delay — this is what "throws" the stab into the distance
    const s = ctx.createGain();
    s.gain.value = sendAmt;
    g.connect(s);
    s.connect(sendGain);
  }

  // ── scheduler ────────────────────────────────────────────────────────────
  let step = 0;
  let nextTime = ctx.currentTime + 0.08;

  function scheduleStep(s: number, at: number) {
    // During a stutter, freeze on stutterStep and machine-gun it (kick+hat).
    if (at < stutterUntil) {
      playKick(at, 0.8);
      playHat(at, 0.22);
      if (stutterStep % 4 === 0 && BASS_HZ[stutterStep]) {
        playBass(at, BASS_HZ[stutterStep]);
      }
      flash.kick = at;
      flash.hat = at;
      return;
    }

    // KICK — four on the floor, always present.
    if (s % 4 === 0) {
      playKick(at);
      flash.kick = at;
    }

    // BASS — rolling offbeat dub bass, always present.
    if (BASS_HZ[s] > 0) {
      playBass(at, BASS_HZ[s]);
      flash.bass = at;
    }

    // HATS — enter as build rises above ~0.3. Offbeat 16ths, with an open hat.
    if (build01 > 0.3) {
      if (s % 2 === 1) {
        const open = s % 8 === 7;
        playHat(at, open ? 0.3 : 0.2);
        flash.hat = at;
      }
    }

    // STAB — enters as build rises above ~0.6. On the offbeats (2 and 4 &).
    if (build01 > 0.58 && (s === 6 || s === 14 || (build01 > 0.8 && s === 10))) {
      // throw more to the delay when the head is turned (pan away)
      const sendAmt = 0.35 + Math.abs(pan) * 0.45;
      playStab(at, sendAmt);
      flash.stab = at;
    }
  }

  const timer = window.setInterval(() => {
    if (ctx.state === "closed") return;
    // apply smoothed continuous controls to the graph each tick
    const now = ctx.currentTime;
    const cut = 320 + cutoff01 * cutoff01 * 7000; // exp-ish feel
    globalLP.frequency.setTargetAtTime(cut, now, 0.04);
    shelf.gain.setTargetAtTime(bright01 * 12, now, 0.08);
    fb.gain.setTargetAtTime(0.28 + Math.abs(pan) * 0.42, now, 0.08);

    while (nextTime < now + SCHEDULE_AHEAD) {
      scheduleStep(step, nextTime);
      nextTime += sec16;
      step = (step + 1) % STEPS;
    }
  }, LOOKAHEAD_MS);

  return {
    loopPosition() {
      const p = ((ctx.currentTime - loopStart) / sec16) % STEPS;
      return p < 0 ? p + STEPS : p;
    },
    nearestStep() {
      const p = ((ctx.currentTime - loopStart) / sec16) % STEPS;
      return ((Math.round(p) % STEPS) + STEPS) % STEPS;
    },
    laneFlash(lane) {
      const dt = ctx.currentTime - flash[lane];
      return dt >= 0 && dt < 0.14 ? 1 - dt / 0.14 : 0;
    },
    setCutoff(v) {
      cutoff01 = Math.max(0, Math.min(1, v));
    },
    setBuild(v) {
      build01 = Math.max(0, Math.min(1, v));
    },
    setPan(v) {
      pan = Math.max(-1, Math.min(1, v));
    },
    setBright(v) {
      bright01 = Math.max(0, Math.min(1, v));
    },
    throwDelay() {
      // a momentary spike in feedback + a bloom — the echo runs off on its own
      const now = ctx.currentTime;
      fb.gain.cancelScheduledValues(now);
      fb.gain.setValueAtTime(Math.min(0.85, fb.gain.value + 0.3), now);
      fb.gain.setTargetAtTime(0.32, now + 0.05, 0.6);
    },
    stutter() {
      // quantise: freeze on the nearest step and retrigger for ~1 beat
      const now = ctx.currentTime;
      const p = ((now - loopStart) / sec16) % STEPS;
      stutterStep = ((Math.round(p) % STEPS) + STEPS) % STEPS;
      stutterUntil = now + sec16 * 4; // one beat of stutter
    },
    getBuild() {
      return build01;
    },
    stop() {
      window.clearInterval(timer);
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
        master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        void ctx.close().catch(() => {});
      }, 140);
    },
  };
}
