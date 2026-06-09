// audio.ts — continuous chord-cloud for "Kids Aurora Hands"
//
// Design:
//  • C/D pentatonic voice set — no wrong notes, kids rule
//  • Two-hand stereo model: each hand panned by screen-x (StereoPannerNode)
//  • Hand height → register (high = bright high voices, low = deep)
//  • Hand spread/openness → pad density and filter brightness
//  • Hands together (gathering) → warm consonant swell
//  • Total motion → loudness
//  • Root/drone drifts on a slow ~7 min cycle
//  • Slow filter LFO breathes (different at minute 5 than minute 0)
//  • DynamicsCompressor brick-wall (threshold -6 dB, ratio 20:1, master ≤ 0.25)
//  • Always-on ambient pad — never silent

// D major pentatonic (D E F# A B) in several octaves — bright, safe, consonant
const PENTA_HZ: number[] = [
  // low register
  73.42,  // D2
  82.41,  // E2
  92.50,  // F#2
  110.00, // A2
  123.47, // B2
  // mid register
  146.83, // D3
  164.81, // E3
  185.00, // F#3
  220.00, // A3
  246.94, // B3
  // high register
  293.66, // D4
  329.63, // E4
  370.00, // F#4
  440.00, // A4
  493.88, // B4
  // upper
  587.33, // D5
  659.26, // E5
];

// Drone cycle: root notes drift over ~7 minutes
const DRONE_HZ: number[] = [73.42, 82.41, 98.0, 110.0, 98.0, 82.41]; // D2→E2→G2→A2→...

export interface HandAudioState {
  /** x position 0..1 (0=left, 1=right screen) */
  x: number;
  /** height 0..1 (0=bottom, 1=top) */
  height: number;
  /** openness 0..1 (0=fist, 1=open) */
  openness: number;
  /** motion speed 0..1 */
  speed: number;
  /** whether this hand is active */
  active: boolean;
}

export interface AudioEngine {
  ctx: AudioContext;
  /** Update audio from current hand states — call every frame */
  update: (hands: [HandAudioState, HandAudioState], dt: number) => void;
  /** Resume after user gesture */
  resume: () => Promise<void>;
  /** Clean up all audio resources */
  destroy: () => void;
}

interface VoiceSlot {
  osc: OscillatorNode;
  gain: GainNode;
  panner: StereoPannerNode;
  targetGain: number;
  freq: number;
}

export function createAudioEngine(): AudioEngine {
  const ACtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new ACtx();

  // ── Master chain ─────────────────────────────────────────────────────────────
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.22; // ≤ 0.25 per brief

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -6;
  compressor.knee.value = 2;
  compressor.ratio.value = 20;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.2;

  masterGain.connect(compressor);
  compressor.connect(ctx.destination);

  // ── Global filter LFO (slow breath) ─────────────────────────────────────────
  const globalFilter = ctx.createBiquadFilter();
  globalFilter.type = "lowpass";
  globalFilter.frequency.value = 1200;
  globalFilter.Q.value = 0.8;
  globalFilter.connect(masterGain);

  const filterLFO = ctx.createOscillator();
  filterLFO.type = "sine";
  filterLFO.frequency.value = 0.027; // ~37s cycle, evolves slowly
  const filterLFOGain = ctx.createGain();
  filterLFOGain.gain.value = 600;
  filterLFO.connect(filterLFOGain);
  filterLFOGain.connect(globalFilter.frequency);
  filterLFO.start();

  // ── Root drone (always-on, very quiet, drifts over cycle) ────────────────────
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.04;
  droneGain.connect(globalFilter);

  const droneOsc = ctx.createOscillator();
  droneOsc.type = "sine";
  droneOsc.frequency.value = DRONE_HZ[0];
  droneOsc.connect(droneGain);
  droneOsc.start();

  // Second detuned drone for warmth
  const droneOsc2 = ctx.createOscillator();
  droneOsc2.type = "sine";
  droneOsc2.frequency.value = DRONE_HZ[0] * 1.0015;
  const droneGain2 = ctx.createGain();
  droneGain2.gain.value = 0.025;
  droneOsc2.connect(droneGain2);
  droneGain2.connect(globalFilter);
  droneOsc2.start();

  // Overtone shimmer (fifth above drone)
  const droneOsc3 = ctx.createOscillator();
  droneOsc3.type = "sine";
  droneOsc3.frequency.value = DRONE_HZ[0] * 1.5;
  const droneGain3 = ctx.createGain();
  droneGain3.gain.value = 0.015;
  droneOsc3.connect(droneGain3);
  droneGain3.connect(globalFilter);
  droneOsc3.start();

  // ── Per-hand voices (6 oscillator slots per hand, shared pool) ───────────────
  // We maintain 12 voice slots total (6 per hand), fade/retune as needed
  const voices: VoiceSlot[] = [];

  for (let i = 0; i < 12; i++) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = 0;
    panner.connect(globalFilter);

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(panner);

    const osc = ctx.createOscillator();
    osc.type = i % 3 === 0 ? "sine" : i % 3 === 1 ? "triangle" : "sine";
    osc.frequency.value = PENTA_HZ[i % PENTA_HZ.length];
    osc.connect(gain);
    osc.start();

    voices.push({ osc, gain, panner, targetGain: 0, freq: osc.frequency.value });
  }

  // ── State ────────────────────────────────────────────────────────────────────
  let elapsed = 0;
  let droneIdx = 0;
  let lastDroneSwitch = 0;
  let smoothedSpeed = 0;

  function update(hands: [HandAudioState, HandAudioState], dt: number) {
    elapsed += dt;

    // Drone drift: cycle through root notes every ~70s (total ~7min cycle)
    if (elapsed - lastDroneSwitch > 70) {
      lastDroneSwitch = elapsed;
      droneIdx = (droneIdx + 1) % DRONE_HZ.length;
      const newFreq = DRONE_HZ[droneIdx];
      droneOsc.frequency.setTargetAtTime(newFreq, ctx.currentTime, 4);
      droneOsc2.frequency.setTargetAtTime(newFreq * 1.0015, ctx.currentTime, 4);
      droneOsc3.frequency.setTargetAtTime(newFreq * 1.5, ctx.currentTime, 4);
    }

    // Slow filter LFO frequency evolves over minutes (different at minute 5)
    const lfoEvo = 0.022 + Math.sin(elapsed * 0.002) * 0.01;
    filterLFO.frequency.setTargetAtTime(lfoEvo, ctx.currentTime, 8);

    // Total motion → loudness
    const totalSpeed = (hands[0].active ? hands[0].speed : 0) + (hands[1].active ? hands[1].speed : 0);
    smoothedSpeed += (totalSpeed - smoothedSpeed) * Math.min(1, dt * 2);
    const motionLoud = 0.18 + smoothedSpeed * 0.07;
    masterGain.gain.setTargetAtTime(Math.min(0.25, motionLoud), ctx.currentTime, 0.3);

    // Hands together gathering → warm swell (filter opens)
    const h0pos = hands[0].active ? hands[0].x : 0.5;
    const h1pos = hands[1].active ? hands[1].x : 0.5;
    const handDist = hands[0].active && hands[1].active ? Math.abs(h0pos - h1pos) : 1;
    const gathering = Math.max(0, 1 - handDist * 2.5);
    const filterTarget = 800 + gathering * 2200 +
      (hands[0].active ? hands[0].openness * 800 : 0) +
      (hands[1].active ? hands[1].openness * 800 : 0);
    globalFilter.frequency.setTargetAtTime(filterTarget, ctx.currentTime, 0.5);

    // Per-hand voice assignment: voices 0..5 for hand 0, 6..11 for hand 1
    for (let hi = 0; hi < 2; hi++) {
      const hand = hands[hi];
      const baseVoice = hi * 6;

      if (!hand.active) {
        // Fade out all voices for this hand
        for (let vi = 0; vi < 6; vi++) {
          voices[baseVoice + vi].gain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
        }
        continue;
      }

      // Height → register: 0=deep (index 0..4), 1=bright (index 12..16)
      const regBase = Math.floor(hand.height * 10); // 0..10 → pick region in PENTA_HZ
      const pan = hand.x * 2 - 1; // -1..1

      // Active voice count = openness → more voices when open (2..6)
      const activeVoices = Math.max(2, Math.round(hand.openness * 6));

      for (let vi = 0; vi < 6; vi++) {
        const v = voices[baseVoice + vi];
        const voiceActive = vi < activeVoices;

        // Choose frequency for this voice slot
        const freqIdx = Math.min(PENTA_HZ.length - 1, regBase + vi * 2);
        const targetFreq = PENTA_HZ[freqIdx];

        // Retune smoothly
        if (Math.abs(v.freq - targetFreq) > 1) {
          v.osc.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.3);
          v.freq = targetFreq;
        }

        // Pan by hand x
        v.panner.pan.setTargetAtTime(pan, ctx.currentTime, 0.15);

        // Volume: active voices contribute, outermost voices quieter
        const voiceGain = voiceActive
          ? (vi === 0 ? 0.055 : 0.035 - vi * 0.003)
          : 0;
        v.gain.gain.setTargetAtTime(Math.max(0, voiceGain), ctx.currentTime, 0.25);
      }
    }
  }

  async function resume() {
    if (ctx.state === "suspended") await ctx.resume();
  }

  function destroy() {
    for (const v of voices) {
      try { v.osc.stop(); } catch { /* ignore */ }
    }
    try { droneOsc.stop(); } catch { /* ignore */ }
    try { droneOsc2.stop(); } catch { /* ignore */ }
    try { droneOsc3.stop(); } catch { /* ignore */ }
    try { filterLFO.stop(); } catch { /* ignore */ }
    try { ctx.close(); } catch { /* ignore */ }
  }

  return { ctx, update, resume, destroy };
}
