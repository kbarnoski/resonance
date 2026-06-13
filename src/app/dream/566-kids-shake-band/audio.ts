/**
 * audio.ts — Web Audio percussion engine for Shake Band
 *
 * Inspired by Brazilian batucada bloco: surdo (low drum), caixa (snare),
 * repique (mid tom), agogo (bell/cowbell), chocalho (shaker/reco-reco).
 *
 * Intensity tiers (0–1 magnitude mapped to shake level):
 *   GRAIN  (< 0.25)  → chocalho (metal shaker grains, soft)
 *   SHAKE  (0.25–0.5)→ repique (mid tom hit)
 *   HIT    (0.5–0.75)→ caixa (snare crack)
 *   BOOM   (≥ 0.75)  → surdo (deep kick + agogo bell accent)
 *
 * Groove bed: soft surdo downbeat + caixa upbeat at 92 BPM
 */

export type BandHit = "chocalho" | "repique" | "caixa" | "surdo" | "agogo";

export interface AudioEngine {
  ctx: AudioContext;
  fireHit: (type: BandHit, gain: number) => void;
  startGroove: () => void;
  stopGroove: () => void;
  close: () => void;
}

/** Build all percussion voices and connect the master safety chain. */
export function buildAudioEngine(): AudioEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();

  // --- Master safety chain: gain → lowpass → compressor → destination ---
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.85;

  const masterLP = ctx.createBiquadFilter();
  masterLP.type = "lowpass";
  masterLP.frequency.value = 7500; // ≤8kHz — safe for children's ears

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-10, ctx.currentTime);
  limiter.knee.setValueAtTime(2, ctx.currentTime);
  limiter.ratio.setValueAtTime(20, ctx.currentTime);
  limiter.attack.setValueAtTime(0.001, ctx.currentTime);
  limiter.release.setValueAtTime(0.08, ctx.currentTime);

  masterGain.connect(masterLP);
  masterLP.connect(limiter);
  limiter.connect(ctx.destination);

  // --- Noise buffer (shared, reused by all noise-based voices) ---
  const noiseFrames = ctx.sampleRate * 2;
  const noiseBuf = ctx.createBuffer(1, noiseFrames, ctx.sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseFrames; i++) noiseData[i] = Math.random() * 2 - 1;

  function makeNoiseSrc() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    return src;
  }

  // --- Voice builders ---

  /** Chocalho — metal shaker grains. Bandpass noise 4–6 kHz, very soft. */
  function fireChocalho(vol: number) {
    const t = ctx.currentTime;
    const src = makeNoiseSrc();
    const bpf = ctx.createBiquadFilter();
    bpf.type = "bandpass";
    bpf.frequency.value = 5000;
    bpf.Q.value = 3;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.28 * vol, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(bpf);
    bpf.connect(env);
    env.connect(masterGain);
    src.start(t);
    src.stop(t + 0.1);
  }

  /** Repique — mid tom. Sine with fast pitch-drop, 260→80 Hz. */
  function fireRepique(vol: number) {
    const t = ctx.currentTime;
    // Body tone
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.14);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.55 * vol, t + 0.003);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(env);
    env.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.25);
    // Attack transient noise
    const src = makeNoiseSrc();
    const bpf = ctx.createBiquadFilter();
    bpf.type = "bandpass";
    bpf.frequency.value = 1200;
    bpf.Q.value = 2;
    const nenv = ctx.createGain();
    nenv.gain.setValueAtTime(0.18 * vol, t);
    nenv.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(bpf);
    bpf.connect(nenv);
    nenv.connect(masterGain);
    src.start(t);
    src.stop(t + 0.05);
  }

  /** Caixa — Brazilian snare crack. Bandpass noise 200–2000 Hz + high body */
  function fireCaixa(vol: number) {
    const t = ctx.currentTime;
    // Snappy noise burst
    const src = makeNoiseSrc();
    const bpf = ctx.createBiquadFilter();
    bpf.type = "bandpass";
    bpf.frequency.value = 900;
    bpf.Q.value = 1.2;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.65 * vol, t + 0.002);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(bpf);
    bpf.connect(env);
    env.connect(masterGain);
    src.start(t);
    src.stop(t + 0.2);
    // High snap
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.06);
    const env2 = ctx.createGain();
    env2.gain.setValueAtTime(0.3 * vol, t);
    env2.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(env2);
    env2.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  /** Surdo — deep kick drum. Sine 120→45 Hz with sharp decay. */
  function fireSurdo(vol: number) {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.22);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.9 * vol, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(env);
    env.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.55);
    // Sub click
    const click = makeNoiseSrc();
    const lpf = ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = 140;
    const cenv = ctx.createGain();
    cenv.gain.setValueAtTime(0.25 * vol, t);
    cenv.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
    click.connect(lpf);
    lpf.connect(cenv);
    cenv.connect(masterGain);
    click.start(t);
    click.stop(t + 0.02);
  }

  /** Agogo bell — two sine partials, metallic ring, 660 + 1320 Hz */
  function fireAgogo(vol: number) {
    const t = ctx.currentTime;
    const freqs = [660, 1100, 1760];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const env = ctx.createGain();
      const pk = (0.35 / (i + 1)) * vol;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(pk, t + 0.004);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.55 - i * 0.1);
      osc.connect(env);
      env.connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  }

  // --- Groove bed scheduler ---
  let grooveScheduleId: ReturnType<typeof setTimeout> | null = null;
  const BPM = 92;
  const BEAT_MS = (60 / BPM) * 1000;
  const SIXTEENTH_MS = BEAT_MS / 4;
  let grooveStep = 0;

  // Batucada groove pattern (16th-note grid, 16 steps per bar)
  // S = surdo, C = caixa, G = agogo, R = repique, H = chocalho
  // Based on basic batucada feel:
  //   Surdo: beats 1 and 3 (steps 0, 8)
  //   Caixa: upbeats 2 and 4 (steps 4, 12) + ghost on 10
  //   Repique: step 2, 6, 14
  //   Agogo: step 0 with surdo accent (bloco cowbell feel)
  //   Chocalho: steps 1, 3, 5, 7, 9, 11, 13, 15 (all offbeats, very soft)
  const GROOVE: Array<Array<[BandHit, number]>> = Array.from({ length: 16 }, () => []);

  // Surdo (deep) on 1 and 3
  GROOVE[0].push(["surdo", 0.75]);
  GROOVE[8].push(["surdo", 0.6]);
  // Agogo bell on 1 with surdo for batucada energy
  GROOVE[0].push(["agogo", 0.5]);
  GROOVE[8].push(["agogo", 0.35]);
  // Caixa on 2 and 4
  GROOVE[4].push(["caixa", 0.45]);
  GROOVE[12].push(["caixa", 0.45]);
  GROOVE[10].push(["caixa", 0.2]); // ghost
  // Repique fills
  GROOVE[2].push(["repique", 0.35]);
  GROOVE[6].push(["repique", 0.3]);
  GROOVE[14].push(["repique", 0.3]);
  // Chocalho on all offbeats, very soft (the shaker bed)
  [1, 3, 5, 7, 9, 11, 13, 15].forEach((s) => GROOVE[s].push(["chocalho", 0.18]));

  function scheduleGrooveStep() {
    const hits = GROOVE[grooveStep % 16];
    for (const [type, vol] of hits) {
      fireHit(type, vol);
    }
    grooveStep++;
    grooveScheduleId = setTimeout(scheduleGrooveStep, SIXTEENTH_MS);
  }

  function fireHit(type: BandHit, vol: number) {
    switch (type) {
      case "chocalho": fireChocalho(vol); break;
      case "repique":  fireRepique(vol);  break;
      case "caixa":    fireCaixa(vol);    break;
      case "surdo":    fireSurdo(vol);    break;
      case "agogo":    fireAgogo(vol);    break;
    }
  }

  function startGroove() {
    if (grooveScheduleId !== null) return;
    grooveStep = 0;
    scheduleGrooveStep();
  }

  function stopGroove() {
    if (grooveScheduleId !== null) {
      clearTimeout(grooveScheduleId);
      grooveScheduleId = null;
    }
  }

  function close() {
    stopGroove();
    void ctx.close();
  }

  return { ctx, fireHit, startGroove, stopGroove, close };
}

/**
 * Map accelerometer magnitude (0–1 normalized) to a BandHit type and gain.
 * Uses adaptive threshold tiers inspired by batucada dynamic range:
 *   micro-jiggle → chocalho grain
 *   light shake  → repique tom
 *   medium shake → caixa snare
 *   hard slam    → surdo kick + agogo accent
 */
export function mapMagnitudeToHit(
  mag: number
): { type: BandHit; gain: number } | null {
  if (mag < 0.08) return null; // below noise floor
  if (mag < 0.25) return { type: "chocalho", gain: 0.3 + mag * 1.2 };
  if (mag < 0.5)  return { type: "repique",  gain: 0.35 + mag * 0.8 };
  if (mag < 0.75) return { type: "caixa",    gain: 0.45 + mag * 0.6 };
  // Hard shake gets surdo + agogo
  return { type: "surdo", gain: Math.min(1.0, 0.7 + mag * 0.4) };
}
