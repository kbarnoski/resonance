// audio.ts — Web Audio synthesis for the Star Pair.
//
// Everything is synthesized (no audio files):
//   • an always-on warm D drone (D2 root + a fifth + a soft octave pad) so the
//     world is never silent and the two voices always have a bed to lock into;
//   • TWO sustained playable voices (mine = violet, friend = cyan), each a sine
//     plus a slightly-detuned triangle through a gentle lowpass for warmth;
//   • a soft "locked" chime + a held consonant shimmer when the two stars lock.
//
// The whole master bus runs through a DynamicsCompressor used as a brick-wall
// limiter (very low threshold, very high ratio) so the toy can NEVER blast a
// small child's ears no matter what combination of pitches is playing.

export const D2_HZ = 73.42; // warm low D drone root

export interface StarAudio {
  /** Set my voice frequency (Hz). Smoothed, so dragging never clicks. */
  setMyFreq: (hz: number) => void;
  /** Set the friend voice frequency (Hz). */
  setFriendFreq: (hz: number) => void;
  /** Tell the audio engine whether the two stars are currently locked in tune.
   *  Drives the consonant shimmer and triggers the lock chime on a rising edge. */
  setLocked: (locked: boolean) => void;
  /** Suspend/resume (e.g. on visibility change). */
  suspend: () => void;
  resume: () => void;
  /** The underlying context, so the mic graph can share it. */
  ctx: AudioContext;
  /** Tear everything down. */
  dispose: () => void;
}

interface Voice {
  osc: OscillatorNode;
  detune: OscillatorNode;
  gain: GainNode;
  lp: BiquadFilterNode;
}

function makeVoice(ctx: AudioContext, dest: AudioNode, freq: number, level: number): Voice {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;

  const detune = ctx.createOscillator();
  detune.type = "triangle";
  detune.frequency.value = freq;
  detune.detune.value = 4; // a few cents of warmth, NOT enough to fight tuning

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1400;
  lp.Q.value = 0.3;

  const gain = ctx.createGain();
  gain.gain.value = level;

  osc.connect(lp);
  detune.connect(lp);
  lp.connect(gain);
  gain.connect(dest);

  osc.start();
  detune.start();
  return { osc, detune, gain, lp };
}

/** Build the full audio graph. Must be called from inside a user-gesture
 *  handler (the Start tap) for iOS to actually start the context. */
export function startAudio(): StarAudio {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();

  // ── master limiter (brick wall) ───────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.9;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -18; // start clamping early
  limiter.knee.value = 6;
  limiter.ratio.value = 20; // ~brick wall
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  const out = ctx.createGain();
  out.gain.value = 0.0; // fade in to avoid a startup pop
  out.gain.linearRampToValueAtTime(0.85, ctx.currentTime + 0.6);

  master.connect(limiter);
  limiter.connect(out);
  out.connect(ctx.destination);

  // ── always-on D drone bed ─────────────────────────────────────────────────
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.16;
  droneGain.connect(master);

  const droneLp = ctx.createBiquadFilter();
  droneLp.type = "lowpass";
  droneLp.frequency.value = 520;
  droneLp.connect(droneGain);

  const droneTones = [
    { hz: D2_HZ, type: "sine" as OscillatorType, g: 1.0 },
    { hz: D2_HZ * 1.5, type: "sine" as OscillatorType, g: 0.5 }, // a fifth above
    { hz: D2_HZ * 2, type: "triangle" as OscillatorType, g: 0.35 }, // soft octave pad
  ];
  const droneOscs: OscillatorNode[] = [];
  for (const t of droneTones) {
    const o = ctx.createOscillator();
    o.type = t.type;
    o.frequency.value = t.hz;
    const g = ctx.createGain();
    g.gain.value = t.g;
    o.connect(g);
    g.connect(droneLp);
    o.start();
    droneOscs.push(o);

    // very slow LFO on the gain so the drone gently breathes (never silent)
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07 + Math.random() * 0.04;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = t.g * 0.12;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    lfo.start();
    droneOscs.push(lfo);
  }

  // ── two playable voices ───────────────────────────────────────────────────
  const myVoice = makeVoice(ctx, master, D2_HZ * 4, 0.13); // ~D4 to start
  const friendVoice = makeVoice(ctx, master, D2_HZ * 4, 0.13);

  // ── consonant shimmer (held while locked) ─────────────────────────────────
  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0.0;
  shimmerGain.connect(master);
  const shimmer = ctx.createOscillator();
  shimmer.type = "sine";
  shimmer.frequency.value = D2_HZ * 8;
  const shimmerLp = ctx.createBiquadFilter();
  shimmerLp.type = "lowpass";
  shimmerLp.frequency.value = 3200;
  shimmer.connect(shimmerLp);
  shimmerLp.connect(shimmerGain);
  shimmer.start();

  let lockedNow = false;

  function setMyFreq(hz: number) {
    const t = ctx.currentTime;
    myVoice.osc.frequency.setTargetAtTime(hz, t, 0.02);
    myVoice.detune.frequency.setTargetAtTime(hz, t, 0.02);
    shimmer.frequency.setTargetAtTime(hz * 2, t, 0.05);
  }
  function setFriendFreq(hz: number) {
    const t = ctx.currentTime;
    friendVoice.osc.frequency.setTargetAtTime(hz, t, 0.02);
    friendVoice.detune.frequency.setTargetAtTime(hz, t, 0.02);
  }

  function chime() {
    // a soft three-note arpeggio sparkle on the rising edge of a lock
    const base = myVoice.osc.frequency.value;
    const notes = [base * 2, base * 2.5, base * 3]; // octave, +maj third, +fifth-ish
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      const t0 = ctx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
      o.connect(g);
      g.connect(master);
      o.start(t0);
      o.stop(t0 + 1.0);
    });
  }

  function setLocked(locked: boolean) {
    if (locked === lockedNow) return;
    lockedNow = locked;
    const t = ctx.currentTime;
    shimmerGain.gain.cancelScheduledValues(t);
    if (locked) {
      shimmerGain.gain.setTargetAtTime(0.05, t, 0.15);
      chime();
    } else {
      shimmerGain.gain.setTargetAtTime(0.0, t, 0.25);
    }
  }

  function suspend() {
    void ctx.suspend();
  }
  function resume() {
    void ctx.resume();
  }

  function dispose() {
    try {
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.linearRampToValueAtTime(0.0, t + 0.15);
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      try {
        droneOscs.forEach((o) => o.stop());
        myVoice.osc.stop();
        myVoice.detune.stop();
        friendVoice.osc.stop();
        friendVoice.detune.stop();
        shimmer.stop();
      } catch {
        /* already stopped */
      }
      void ctx.close();
    }, 200);
  }

  return {
    setMyFreq,
    setFriendFreq,
    setLocked,
    suspend,
    resume,
    ctx,
    dispose,
  };
}
