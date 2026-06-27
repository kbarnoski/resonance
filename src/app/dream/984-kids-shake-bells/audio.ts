// Real modal bell synthesis + kids-safe master chain for the shake-bells prototype.
// No samples: every struck bell is a small bank of inharmonic partials with
// independent exponential decays and a slight detune so the bell BEATS / shimmers.

// ---------------------------------------------------------------------------
// G MIXOLYDIAN bell ladder (G A B C D E F-natural). The lowered 7th (F natural)
// is the bright modal color — deliberately NOT a "no-wrong-notes" pentatonic and
// NOT a functional I-IV-V cadence. We just walk this ladder up ~2 octaves then
// turn around and descend, tracing a rising-then-falling shimmer.
// MIDI: G3=55. Mode degrees from G: 0 2 4 5 7 9 10 (then +12 ...).
// ---------------------------------------------------------------------------
const G_MIXO_DEGREES = [0, 2, 4, 5, 7, 9, 10];

function buildLadder(rootMidi: number, octaves: number): number[] {
  const out: number[] = [];
  for (let o = 0; o < octaves; o++) {
    for (const d of G_MIXO_DEGREES) out.push(rootMidi + o * 12 + d);
  }
  // Cap the very top with the next octave's tonic for a clean turnaround.
  out.push(rootMidi + octaves * 12);
  return out;
}

// ~2 octaves of the mode starting at G3.
export const LADDER_MIDI: number[] = buildLadder(55, 2);
export const LADDER_LEN = LADDER_MIDI.length;

// Bold saturated hue per ladder bell — color is the language for 4-year-olds.
// Warm gold/amber family with hue rotation so each rung reads distinct.
export const LADDER_HEX: string[] = LADDER_MIDI.map((_, i) => {
  const t = i / Math.max(1, LADDER_LEN - 1);
  const hue = 38 + t * 300; // amber -> rose -> violet -> back toward gold
  return `hsl(${hue % 360} 92% 62%)`;
});

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Inharmonic partial ratios for a struck bell (hum + tap/strike partials).
// Non-integer ratios are what make it read as a BELL, not an organ.
const PARTIAL_RATIOS = [1.0, 2.0, 2.4, 3.0, 4.5];
// Faster-ringing low partials, quicker-dying bright partials.
const PARTIAL_DECAY = [2.6, 1.7, 1.2, 0.9, 0.55]; // seconds (approx)
const PARTIAL_GAIN = [1.0, 0.55, 0.42, 0.3, 0.18];

export interface BellAudio {
  ctx: AudioContext;
  master: GainNode;
  // Per-ladder-bell live amplitude estimate (0..1) for the visual glow ONLY.
  // The audio is never driven off the visual.
  bellGlow: Float32Array;
  strikeBell: (ladderIndex: number, intensity: number) => void;
  setLull: (amount: number) => void; // 0 = full, 1 = goodnight lull
  dispose: () => void;
}

// ---------------------------------------------------------------------------
// Master chain (mandatory, kids-safe):
//   master Gain (<=0.3) -> lowpass ~6500Hz -> Compressor(-10, ratio 20) -> out
//   + always-on soft G drone (G2 + D3) under everything.
// ---------------------------------------------------------------------------
export function makeBellAudio(ctx: AudioContext): BellAudio {
  const master = ctx.createGain();
  master.gain.value = 0.28; // <= 0.3

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 6500;
  lowpass.Q.value = 0.5;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 6;
  comp.ratio.value = 20;
  comp.attack.value = 0.012;
  comp.release.value = 0.25;

  master.connect(lowpass).connect(comp).connect(ctx.destination);

  const bellGlow = new Float32Array(LADDER_LEN);

  // --- Always-on soft drone pad: G2 (43) + D3 (50) ---
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0;
  droneGain.connect(master);
  const droneOscs: OscillatorNode[] = [];
  const droneLfo = ctx.createOscillator();
  const droneLfoGain = ctx.createGain();
  droneLfo.frequency.value = 0.07; // slow breathing
  droneLfoGain.gain.value = 0.02;
  droneLfo.connect(droneLfoGain).connect(droneGain.gain);
  [43, 50].forEach((m, i) => {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = midiToFreq(m);
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.7 : 0.5;
    o.connect(g).connect(droneGain);
    o.start();
    droneOscs.push(o);
  });
  droneLfo.start();
  // Gentle fade-in of the drone baseline so it's never a hard onset.
  const now0 = ctx.currentTime;
  droneGain.gain.setValueAtTime(0.0, now0);
  droneGain.gain.linearRampToValueAtTime(0.06, now0 + 1.2);

  let lull = 0; // 0..1 goodnight amount

  function setLull(amount: number): void {
    lull = Math.max(0, Math.min(1, amount));
    const t = ctx.currentTime;
    // Master dips toward a sleepy hush; lowpass closes for a softer timbre.
    const targetMaster = 0.28 * (1 - 0.6 * lull);
    master.gain.setTargetAtTime(targetMaster, t, 2.0);
    lowpass.frequency.setTargetAtTime(6500 - 4200 * lull, t, 2.0);
  }

  // Strike one bell with `intensity` 0..1 controlling strike brightness.
  // `voiceScale` normalizes polyphony so a big arpeggio never clips/harshens.
  function strikeOne(ladderIndex: number, intensity: number, voiceScale: number): void {
    const idx = ((ladderIndex % LADDER_LEN) + LADDER_LEN) % LADDER_LEN;
    const midi = LADDER_MIDI[idx];
    const baseFreq = midiToFreq(midi);
    const t = ctx.currentTime;

    const bright = 0.35 + 0.65 * intensity; // strike brightness
    const lullDamp = 1 - 0.45 * lull;

    // A per-strike summing gain we can probe for the visual glow estimate.
    const bellOut = ctx.createGain();
    bellOut.gain.value = 1;
    bellOut.connect(master);

    let peak = 0;
    PARTIAL_RATIOS.forEach((ratio, p) => {
      // Brighter partials only ring fully on harder strikes (kids-safe softness).
      const partialBright = p <= 1 ? 1 : bright;
      const amp =
        PARTIAL_GAIN[p] *
        partialBright *
        0.12 * // headroom
        voiceScale *
        lullDamp;
      if (amp < 0.0008) return;
      peak += amp;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      // Slight detune per partial so the bell beats / shimmers.
      const detune = (p * 1.7 + (Math.random() - 0.5) * 1.4);
      osc.frequency.value = baseFreq * ratio;
      osc.detune.value = detune;

      const g = ctx.createGain();
      const dur = PARTIAL_DECAY[p] * (0.8 + 0.5 * (1 - intensity)) * (1 + 0.6 * lull);
      // >=10ms attack — no sudden loud transients.
      const atk = 0.012;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t + atk + dur);

      osc.connect(g).connect(bellOut);
      osc.start(t);
      osc.stop(t + atk + dur + 0.05);
      osc.onended = () => {
        try {
          osc.disconnect();
          g.disconnect();
        } catch {
          /* already gone */
        }
      };
    });

    // Drive the visual glow estimate for this ladder rung (visual reads audio).
    bellGlow[idx] = Math.min(1, bellGlow[idx] + Math.min(1, peak * 6));

    // Tear down the per-strike bus after the longest partial fully decays.
    const totalDur = PARTIAL_DECAY[0] * 1.4 + 0.3;
    bellOut.gain.setValueAtTime(1, t);
    window.setTimeout(() => {
      try {
        bellOut.disconnect();
      } catch {
        /* already gone */
      }
    }, (totalDur + 0.2) * 1000);
  }

  // Public strike: intensity decides HOW MANY ladder bells ring (gentle 1-2,
  // big shake 3-5) AND brightness, walking up from the given ladder index.
  function strikeBell(ladderIndex: number, intensity: number): void {
    const clampI = Math.max(0, Math.min(1, intensity));
    const voices = 1 + Math.round(clampI * 4); // 1..5
    const voiceScale = 1 / Math.sqrt(voices); // polyphony normalization
    for (let v = 0; v < voices; v++) {
      // Stagger as a quick sparkling arpeggio climbing the ladder.
      const delay = v * (0.045 + 0.02 * (1 - clampI));
      const idx = ladderIndex + v;
      const vIntensity = clampI * (1 - v * 0.08);
      window.setTimeout(() => strikeOne(idx, vIntensity, voiceScale), delay * 1000);
    }
  }

  function dispose(): void {
    try {
      droneOscs.forEach((o) => {
        o.stop();
        o.disconnect();
      });
      droneLfo.stop();
      droneLfo.disconnect();
      droneLfoGain.disconnect();
      droneGain.disconnect();
      comp.disconnect();
      lowpass.disconnect();
      master.disconnect();
    } catch {
      /* best-effort teardown */
    }
  }

  return { ctx, master, bellGlow, strikeBell, setLull, dispose };
}

// Per-frame glow decay helper (called from the render loop).
export function decayGlow(glow: Float32Array, dt: number): void {
  const k = Math.exp(-dt * 2.2);
  for (let i = 0; i < glow.length; i++) glow[i] *= k;
}
