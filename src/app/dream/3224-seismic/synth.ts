// ════════════════════════════════════════════════════════════════════════════
// Seismic Bell-Choir (3224) — SONIFICATION / MODAL-BELL SYNTH
//
// Each earthquake is struck as a modal bell: a few decaying INHARMONIC partials
// (physical-modeling-flavoured, not a sample) plus a short filtered noise-click
// transient (the "mallet"). The mapping is data-driven and CONTINUOUS — depth is
// never snapped to a musical scale, because the Earth doesn't play in tune.
//
//   depthKm  →  base pitch   (shallow = high, deep = low; ~3.6 octaves, continuous)
//   mag      →  loudness + decay length + partial richness
//   lon      →  stereo pan   (-180° hard L … +180° hard R)
//
// Lineage: the USGS real-time earthquake GeoJSON feed as source material, and
// Florian Dombois's earthquake *audification* — making seismic data audible.
// ════════════════════════════════════════════════════════════════════════════

// ── Deterministic PRNG for the seeded, byte-reproducible demo path. ──────────
// (No Math.random / Date.now on the demo path — determinism is required.)
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// stable 32-bit hash of a string (for per-quake timbre seeding)
export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Ideal-bell inharmonic partial ratios (minor-third bell family) with their
// relative amplitudes. We take the first N by magnitude.
const BELL_RATIOS = [0.5, 1.0, 1.19, 1.56, 2.0, 2.51, 2.66, 3.01, 4.1];
const BELL_AMPS = [0.35, 1.0, 0.55, 0.42, 0.5, 0.28, 0.22, 0.18, 0.12];

// ── Pure mapping functions (also used by the headless self-check). ───────────

/** depthKm → base frequency. 0km ≈ 660 Hz (bright), 700km ≈ 55 Hz (deep gong).
 *  Exponential so the ear reads it as ~3.6 continuous octaves. */
export function freqFromDepth(depthKm: number): number {
  const d = Math.max(0, Math.min(700, depthKm));
  const oct = (1 - d / 700) * 3.6; // 0 (deep) .. 3.6 (shallow)
  return 55 * Math.pow(2, oct);
}

/** mag → normalized 0..1 over the audible band (M2..M7). */
export function magNorm(mag: number): number {
  return Math.max(0, Math.min(1, (mag - 2) / 5));
}

/** mag → peak envelope gain (pre-master). M2 ≈ 0.03 tick, M7 ≈ 0.26 ring. */
export function peakFromMag(mag: number): number {
  return 0.03 + magNorm(mag) * 0.23;
}

/** mag → decay length in seconds. M2 ≈ 0.35s tick, M7 ≈ 5.0s long ring. */
export function decayFromMag(mag: number): number {
  return 0.35 + magNorm(mag) * 4.65;
}

/** mag → number of inharmonic partials (richness). M2 ≈ 2, M7 ≈ 8. */
export function partialsFromMag(mag: number): number {
  return Math.max(2, Math.min(BELL_RATIOS.length, Math.round(2 + magNorm(mag) * 6)));
}

/** lon → stereo pan, clamped to [-1, 1]. */
export function panFromLon(lon: number): number {
  return Math.max(-1, Math.min(1, lon / 180));
}

// ── The audio graph: master bus with a limiter so chords never clip. ─────────
export interface SeismicSynth {
  ctx: AudioContext;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  voices: { endsAt: number; nodes: AudioNode[] }[];
  maxVoices: number;
  noiseBuffer: AudioBuffer;
}

export function makeSynth(ctx: AudioContext): SeismicSynth {
  const master = ctx.createGain();
  master.gain.value = 0.13; // ≤ 0.15 master, per brief

  // brick-wall-ish limiter guarding overlapping chords
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.18;

  // short convolution-free "hall" via a feedback delay for planetary depth
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.27;
  const fb = ctx.createGain();
  fb.gain.value = 0.28;
  const wet = ctx.createGain();
  wet.gain.value = 0.22;

  master.connect(limiter);
  limiter.connect(ctx.destination);
  master.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(limiter);

  // one-shot white-noise buffer for the mallet transient
  const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
  const nd = noiseBuffer.getChannelData(0);
  const rng = mulberry32(0x5e15c0de);
  for (let i = 0; i < nd.length; i++) nd[i] = rng() * 2 - 1;

  return { ctx, master, limiter, voices: [], maxVoices: 16, noiseBuffer };
}

/** Strike one bell for a quake. `seed` gives deterministic timbre jitter. */
export function strikeQuake(
  s: SeismicSynth,
  q: { id: string; depthKm: number; mag: number; lon: number },
  nowMs: number,
): void {
  const now = s.ctx.currentTime;

  // reap finished voices; steal oldest if at cap (keep the flow alive)
  s.voices = s.voices.filter((v) => v.endsAt > nowMs);
  if (s.voices.length >= s.maxVoices) {
    const oldest = s.voices.shift();
    oldest?.nodes.forEach((n) => {
      try {
        (n as OscillatorNode).stop?.();
      } catch {
        /* already stopped */
      }
    });
  }

  const f0 = freqFromDepth(q.depthKm);
  const peak = peakFromMag(q.mag);
  const decay = decayFromMag(q.mag);
  const nPartials = partialsFromMag(q.mag);
  const rng = mulberry32(hashSeed(q.id));

  const panner = s.ctx.createStereoPanner();
  panner.pan.value = panFromLon(q.lon);
  panner.connect(s.master);
  const nodes: AudioNode[] = [panner];

  // ── partial voices ──
  for (let i = 0; i < nPartials; i++) {
    const ratio = BELL_RATIOS[i] * (1 + (rng() - 0.5) * 0.012); // micro-detune
    const amp = BELL_AMPS[i];
    const osc = s.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f0 * ratio, now);

    const g = s.ctx.createGain();
    // higher partials decay faster (real bells) → shimmer that settles
    const pDecay = decay * (1 - i / (nPartials + 2));
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * amp), now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.004 + pDecay);

    osc.connect(g);
    g.connect(panner);
    osc.start(now);
    osc.stop(now + 0.02 + pDecay);
    nodes.push(osc, g);
  }

  // ── mallet transient: a short band-passed noise click, louder for big quakes ──
  const noise = s.ctx.createBufferSource();
  noise.buffer = s.noiseBuffer;
  const bp = s.ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = f0 * 2.2;
  bp.Q.value = 0.7;
  const ng = s.ctx.createGain();
  const clickPeak = peak * (0.5 + magNorm(q.mag) * 0.6);
  ng.gain.setValueAtTime(clickPeak, now);
  ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
  noise.connect(bp);
  bp.connect(ng);
  ng.connect(panner);
  noise.start(now);
  noise.stop(now + 0.08);
  nodes.push(noise, bp, ng);

  s.voices.push({ endsAt: nowMs + (0.02 + decay + 0.1) * 1000, nodes });
}
