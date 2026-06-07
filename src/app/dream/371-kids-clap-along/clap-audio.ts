// Web Audio engine for the clap-along.
// ────────────────────────────────────────────────────────────────────────────
// Everything sums through a final DynamicsCompressor used as a hard LIMITER so
// the output can never blast a kid's ears, no matter how many claps stack up.
//
// Layers:
//   1. DRONE  — an always-on soft D + A pad (so it is NEVER silent), a couple of
//               detuned triangle oscillators through a slow, breathing lowpass.
//   2. CLAPS  — short tuned-percussion "clap" voices in D-DORIAN (D E F G A B C,
//               explicitly NOT C-major-pentatonic). The CREATURE clap and the
//               CHILD/echo clap are the same voice at slightly different colour
//               so a call and its answer feel like a conversation.
//   3. SPARKLE— a little rising arpeggio on a successful "grow", the reward.
//
// CRITICAL detail for the brief: the pointer-tap and auto-demo fallbacks must be
// HEARD by the real onset detector. So `clap()` actually injects a short burst
// of white noise (a synthetic broadband transient — exactly what a real clap
// looks like to the FFT) into a tap-bus that is routed to BOTH the speakers AND
// the mic analyser's input. That means a screen-tap and the auto-demo travel
// through the identical spectral-flux pipeline as an acoustic clap. One door is
// the microphone; the other two doors open into the same room.

export const SCALE_NAMES = ["D", "E", "F", "G", "A", "B", "C"];

// D-Dorian, warm mid register (Hz). Used to TUNE the clap bodies so the growing
// rhythm reads as a little melody, not a row of identical thuds.
const DORIAN_HZ = [
  220.0, // A3
  246.94, // B3
  261.63, // C4
  293.66, // D4
  329.63, // E4
  349.23, // F4
  392.0, // G4
  440.0, // A4
];

// drone: low D + A (a calm open fifth) with a soft C for the dorian colour
const DRONE_HZ = [73.42, 110.0, 130.81]; // D2, A2, C3

export interface ClapAudio {
  /** The node a real mic source should ALSO connect into, so synthetic taps and
   *  auto-demo claps are "heard" by the same analyser. (The page wires the mic
   *  source straight to the analyser; this tap-bus is wired there too.) */
  analyserInput: () => AudioNode;
  /** the analyser the onset detector reads. Pre-configured for transients. */
  analyser: AnalyserNode;
  /** Play an audible clap AND inject a synthetic broadband transient into the
   *  analyser path. `who` tints the colour: creature call vs child/echo answer.
   *  `scaleIndex` tunes the body up the D-Dorian set as the song grows. */
  clap: (strength: number, who: "creature" | "child", scaleIndex: number) => void;
  /** a warm rising sparkle when the shared rhythm GROWS. */
  reward: (level: number) => void;
  /** a soft low "let's try together" cue on a gentle retry (no fail sound). */
  encourage: () => void;
  dispose: () => void;
}

export function createClapAudio(ctx: AudioContext): ClapAudio {
  // ── master limiter chain ────────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.9;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 20; // brick-wall-ish
  limiter.attack.value = 0.003;
  limiter.release.value = 0.18;

  master.connect(limiter);
  limiter.connect(ctx.destination);

  // ── analyser for the onset detector ─────────────────────────────────────────
  // Fed by BOTH the (optional) mic source AND the synthetic tap-bus below, so
  // every input route reaches the SAME spectral-flux detector.
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.0; // raw frames so transients aren't blurred

  // The tap-bus: synthetic clap bursts (pointer / auto-demo) flow through here.
  // It splits to the speakers (so you hear the tap) and to the analyser (so the
  // detector hears it too).
  const tapBus = ctx.createGain();
  tapBus.gain.value = 1.0;
  tapBus.connect(master); // audible
  tapBus.connect(analyser); // detectable

  // A single pre-rendered noise buffer reused for every synthetic transient.
  const NOISE_LEN = Math.floor(ctx.sampleRate * 0.12);
  const noiseBuf = ctx.createBuffer(1, NOISE_LEN, ctx.sampleRate);
  {
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < NOISE_LEN; i++) nd[i] = Math.random() * 2 - 1;
  }

  // ── 1. DRONE pad ─────────────────────────────────────────────────────────────
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0;
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = "lowpass";
  droneFilter.frequency.value = 460;
  droneFilter.Q.value = 0.4;
  droneGain.connect(droneFilter);
  droneFilter.connect(master);

  const droneOscs: OscillatorNode[] = [];
  for (const hz of DRONE_HZ) {
    const a = ctx.createOscillator();
    a.type = "triangle";
    a.frequency.value = hz;
    const b = ctx.createOscillator();
    b.type = "triangle";
    b.frequency.value = hz * 1.004; // slight detune for warmth
    a.connect(droneGain);
    b.connect(droneGain);
    a.start();
    b.start();
    droneOscs.push(a, b);
  }
  droneGain.gain.setValueAtTime(0.0, ctx.currentTime);
  droneGain.gain.linearRampToValueAtTime(0.14, ctx.currentTime + 2.2);

  // gentle breathing on the drone filter so the bed feels alive
  const breath = ctx.createOscillator();
  breath.frequency.value = 0.08;
  const breathGain = ctx.createGain();
  breathGain.gain.value = 130;
  breath.connect(breathGain);
  breathGain.connect(droneFilter.frequency);
  breath.start();

  // ── 2. CLAP voice ────────────────────────────────────────────────────────────
  // A clap = a short noise burst (the broadband snap) + a tuned resonant body
  // (a band-passed pitch from the D-Dorian set) so it carries melody. Creature
  // calls sit a touch brighter and panned-left; child/echo answers a touch
  // warmer and panned-right, so a call and response feel like two voices.
  function clap(
    strength: number,
    who: "creature" | "child",
    scaleIndex: number,
  ): void {
    const now = ctx.currentTime;
    const s = Math.max(0.15, Math.min(1.4, strength));
    const idx = Math.max(0, Math.min(DORIAN_HZ.length - 1, scaleIndex));
    const hz = DORIAN_HZ[idx];
    const isCreature = who === "creature";

    const pan = ctx.createStereoPanner();
    pan.pan.value = isCreature ? -0.35 : 0.35;
    pan.connect(tapBus); // → speakers AND analyser (so it is "heard")

    // (a) broadband snap — short filtered noise burst
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.85 + Math.random() * 0.4;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = isCreature ? 900 : 650; // child answer a touch warmer

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = isCreature ? 6500 : 5200; // kid-safe, never piercing

    const snapGain = ctx.createGain();
    const snapDur = 0.06 + s * 0.04;
    const snapPeak = 0.18 + s * 0.22;
    snapGain.gain.setValueAtTime(0, now);
    snapGain.gain.linearRampToValueAtTime(snapPeak, now + 0.003);
    snapGain.gain.exponentialRampToValueAtTime(0.0008, now + snapDur);

    src.connect(hp);
    hp.connect(lp);
    lp.connect(snapGain);
    snapGain.connect(pan);

    // (b) tuned resonant body — gives the clap its pitch in the scale
    const body = ctx.createBufferSource();
    body.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = hz;
    bp.Q.value = 7 + s * 4;
    const bodyGain = ctx.createGain();
    const bodyDur = 0.18 + s * 0.16;
    const bodyPeak = 0.1 + s * 0.14;
    bodyGain.gain.setValueAtTime(0, now);
    bodyGain.gain.linearRampToValueAtTime(bodyPeak, now + 0.006);
    bodyGain.gain.exponentialRampToValueAtTime(0.0006, now + bodyDur);
    body.connect(bp);
    bp.connect(bodyGain);
    bodyGain.connect(pan);

    src.start(now);
    body.start(now);
    src.stop(now + snapDur + 0.05);
    body.stop(now + bodyDur + 0.05);

    const cleanup = () => {
      try {
        src.disconnect();
        hp.disconnect();
        lp.disconnect();
        snapGain.disconnect();
        body.disconnect();
        bp.disconnect();
        bodyGain.disconnect();
        pan.disconnect();
      } catch {
        /* ignore */
      }
    };
    body.onended = cleanup;
  }

  // ── 3. REWARD sparkle ────────────────────────────────────────────────────────
  // A short rising D-Dorian arpeggio when the rhythm grows — the "yes!" moment.
  function reward(level: number): void {
    const now = ctx.currentTime;
    // climb a few scale steps; higher levels start a little higher for lift
    const start = Math.min(DORIAN_HZ.length - 4, 1 + (level % 3));
    const steps = [0, 2, 4, 5];
    steps.forEach((stp, i) => {
      const hz = DORIAN_HZ[Math.min(DORIAN_HZ.length - 1, start + stp)];
      const t = now + i * 0.085;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0006, t + 0.32);
      const pan = ctx.createStereoPanner();
      pan.pan.value = (i / steps.length) * 0.8 - 0.4;
      osc.connect(g);
      g.connect(pan);
      pan.connect(master);
      osc.start(t);
      osc.stop(t + 0.4);
      osc.onended = () => {
        try {
          osc.disconnect();
          g.disconnect();
          pan.disconnect();
        } catch {
          /* ignore */
        }
      };
    });
  }

  // ── soft "let's try together" cue (gentle retry, never a fail buzzer) ─────────
  function encourage(): void {
    const now = ctx.currentTime;
    // a warm low D→A lilt, inviting, no sting
    [DRONE_HZ[0] * 2, DRONE_HZ[1] * 2].forEach((hz, i) => {
      const t = now + i * 0.16;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.1, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0006, t + 0.5);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 0.6);
      osc.onended = () => {
        try {
          osc.disconnect();
          g.disconnect();
        } catch {
          /* ignore */
        }
      };
    });
  }

  function dispose(): void {
    const now = ctx.currentTime;
    try {
      droneGain.gain.cancelScheduledValues(now);
      droneGain.gain.linearRampToValueAtTime(0, now + 0.15);
    } catch {
      /* ignore */
    }
    window.setTimeout(() => {
      for (const o of droneOscs) {
        try {
          o.stop();
          o.disconnect();
        } catch {
          /* ignore */
        }
      }
      try {
        breath.stop();
        breath.disconnect();
        breathGain.disconnect();
      } catch {
        /* ignore */
      }
      try {
        droneGain.disconnect();
        droneFilter.disconnect();
        tapBus.disconnect();
        analyser.disconnect();
        master.disconnect();
        limiter.disconnect();
      } catch {
        /* ignore */
      }
    }, 220);
  }

  return {
    analyserInput: () => analyser,
    analyser,
    clap,
    reward,
    encourage,
    dispose,
  };
}
