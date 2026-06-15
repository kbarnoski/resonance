// Audio engine for 619-kids-plinko-bells.
// Web Audio only. Kid-safe master chain:
//   masterGain -> lowpass(<=7.5kHz) -> DynamicsCompressor(brick-wall) -> destination
// Bells are warm struck additive sines; an always-on pad keeps it never silent.

// Just-intonation bin mapping over a warm root F3 (~174.61 Hz).
// 9 bins, symmetric: the CENTER bins are the strong chord tones (root / fifth /
// octave) so the binomial peak builds a rooted, warm major chord. The EDGES are
// gentle color tones. Ratios are relative to the root.
const ROOT_HZ = 174.61; // F3

// index:        0     1     2     3     4     5     6     7     8
// (low edge)                  (center peak)                 (high edge)
// ratios chosen so center = root(1/1) flanked by fifth(3/2) & fourth(4/3),
// then thirds (5/4 up, 5/3 below octave), then octave/sub-octave color edges.
export const BIN_RATIOS = [
  1 / 2, // 0  sub-octave root (deep, rare edge)
  2 / 3, // 1  sub-fifth color
  3 / 4, // 2  sub-fourth (= 4/3 down an octave)
  5 / 6, // 3  gentle third-ish
  1 / 1, // 4  ROOT — center, fills fastest
  5 / 4, // 5  major third
  3 / 2, // 6  perfect fifth
  5 / 3, // 7  major sixth
  2 / 1, // 8  octave (bright high edge)
];

export const BIN_HZ = BIN_RATIOS.map((r) => ROOT_HZ * r);

// Bold saturated per-bin hues (degrees), a rainbow across the field.
export const BIN_HUES = [265, 230, 195, 160, 130, 90, 45, 20, 340];

export interface AudioEngine {
  ctx: AudioContext;
  ringBell: (binIndex: number, velocity: number) => void;
  startPad: () => void;
  resume: () => Promise<void>;
}

export function createAudioEngine(): AudioEngine {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctx();

  // --- Master safety chain ---
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.62;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 7500; // <= 7.5kHz, no harsh highs
  lowpass.Q.value = 0.5;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 6;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;

  masterGain.connect(lowpass);
  lowpass.connect(comp);
  comp.connect(ctx.destination);

  // Per-bell limiter bus so many simultaneous bells stay tame.
  const bellBus = ctx.createGain();
  bellBus.gain.value = 0.85;
  bellBus.connect(masterGain);

  // Rate-limit bells so a burst can't pile into a wall of sound.
  let lastBellAt = 0;

  // --- Warm struck bell: additive sines ~1, 2.0, 3.0, 4.2x ---
  // soft ~4ms attack, exponential decay, higher partials decay faster.
  const PARTIALS: [number, number, number][] = [
    // ratio, gain, decaySeconds
    [1.0, 1.0, 2.6],
    [2.0, 0.45, 1.6],
    [3.0, 0.25, 1.0],
    [4.2, 0.13, 0.6],
  ];

  function ringBell(binIndex: number, velocity: number): void {
    const now = ctx.currentTime;
    if (now - lastBellAt < 0.012) return; // micro de-dupe to avoid clicks
    lastBellAt = now;

    const base = BIN_HZ[binIndex];
    // velocity 0..1 -> gentle dynamic range, always soft-capped.
    const vel = Math.max(0.35, Math.min(1, velocity));
    const peak = 0.16 * vel;

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 1;
    voiceGain.connect(bellBus);

    for (const [ratio, g, dec] of PARTIALS) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = base * ratio;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(peak * g, now + 0.004); // ~4ms attack
      env.gain.exponentialRampToValueAtTime(0.0001, now + dec);
      osc.connect(env);
      env.connect(voiceGain);
      osc.start(now);
      osc.stop(now + dec + 0.05);
    }
    // a touch of shimmer: detuned upper octave, very soft
    const shimmer = ctx.createOscillator();
    shimmer.type = "sine";
    shimmer.frequency.value = base * 2.001;
    const senv = ctx.createGain();
    senv.gain.setValueAtTime(0.0001, now);
    senv.gain.linearRampToValueAtTime(peak * 0.06, now + 0.02);
    senv.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
    shimmer.connect(senv);
    senv.connect(voiceGain);
    shimmer.start(now);
    shimmer.stop(now + 1.5);
  }

  // --- Always-on ambient pad in the same key (root + fifth + octave) ---
  let padStarted = false;
  function startPad(): void {
    if (padStarted) return;
    padStarted = true;
    const now = ctx.currentTime;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.0001;
    padGain.gain.linearRampToValueAtTime(0.07, now + 2.5); // slow fade-in
    padGain.connect(masterGain);

    // gentle low-pass movement for life
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 900;
    padFilter.Q.value = 0.7;
    padFilter.connect(padGain);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 280;
    lfo.connect(lfoGain);
    lfoGain.connect(padFilter.frequency);
    lfo.start(now);

    // root, fifth, octave drones with slight detune for warmth
    const padNotes = [ROOT_HZ / 2, ROOT_HZ, (ROOT_HZ * 3) / 2, ROOT_HZ * 2];
    const padPeaks = [0.5, 0.5, 0.32, 0.22];
    padNotes.forEach((f, i) => {
      [0, 1].forEach((d) => {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = f * (d === 0 ? 1 : 1.004);
        const g = ctx.createGain();
        g.gain.value = padPeaks[i] * 0.5;
        osc.connect(g);
        g.connect(padFilter);
        osc.start(now);
      });
    });
  }

  async function resume(): Promise<void> {
    if (ctx.state !== "running") {
      await ctx.resume();
    }
  }

  return { ctx, ringBell, startPad, resume };
}
