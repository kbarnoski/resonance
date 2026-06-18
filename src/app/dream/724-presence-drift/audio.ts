// ── Presence Drift · spatial concatenative engine ───────────────────────────
// Cycle-2 of 710-presence-bloom, fused with the lab's concatenative-grain piano
// work (718-duet-paths, 720-paths-grainfield).
//
// Spatialization IS the instrument. ONE AudioListener at the origin (the user's
// ears). Every PERSISTENT voice is its own HRTF PannerNode at a fixed 3D point,
// with distance attenuation and a reverb send that GROWS with distance.
//
// THE ONE CHANGE vs 710: a placed voice is NO LONGER a synth oscillator. Each
// voice owns its OWN slow READ-HEAD walking through Karel's REAL "Welcome Home"
// recording, continuously playing Hann-windowed grains from wherever its head
// currently sits. Every voice drifts at a slightly different rate, so the
// spatial chord never holds still — it re-voices itself over minutes. Overall
// body energy gently steers drift speed (still = slow; moving = heads advance
// faster). Placement is still the discrete reach→dwell→flick gesture.

// ─── Corpus loader (copied verbatim from 720-paths-grainfield) ───────────────

/** Karel's real solo-piano recording id (read-only existing API route). */
export const PIANO_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

export type AudioSourceKind = "piano" | "fallback";

/**
 * Fetch Karel's recording into an AudioBuffer. (Proven pattern, copied verbatim
 * from the lab's piano loaders.)
 * - 4s abort timeout.
 * - If the response is JSON: parse {url}, fetch that for the bytes.
 * - Else: the body itself is the audio bytes.
 * Returns null on ANY failure (caller falls back to synthesis).
 */
export async function fetchPianoBuffer(
  ctx: BaseAudioContext,
): Promise<AudioBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`/api/audio/${PIANO_RECORDING_ID}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    let arrayBuf: ArrayBuffer;
    if (ct.includes("application/json")) {
      const json = (await res.json()) as { url?: string };
      if (!json.url) return null;
      const r2 = await fetch(json.url, { signal: controller.signal });
      if (!r2.ok) return null;
      arrayBuf = await r2.arrayBuffer();
    } else {
      arrayBuf = await res.arrayBuffer();
    }
    return await ctx.decodeAudioData(arrayBuf);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Fallback synthesis (copied verbatim from 720-paths-grainfield) ──────────
// If the live recording can't be fetched, render a few seconds of a soft,
// detuned arpeggio offline so the grain corpus is NEVER empty. A small notice
// surfaces in the UI that a fallback tone is playing.

const FALLBACK_ROOT_HZ = 196; // ~G3
const FALLBACK_PHRASE = [0, 4, 7, 11, 12, 11, 7, 4, 0, 7, 12, 16, 12, 7, 4, 0];

/**
 * Render a ~14s gentle piano-ish buffer with an OfflineAudioContext: a soft
 * arpeggio with 3–4 detuned partials + a gentle hammer attack, so the grain
 * field always has real harmonic + percussive content to scan.
 */
export async function renderFallbackBuffer(sampleRate = 44100): Promise<AudioBuffer> {
  const durationSecs = 14;
  const length = Math.floor(durationSecs * sampleRate);
  const OfflineCtx: typeof OfflineAudioContext =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const offline = new OfflineCtx(1, length, sampleRate);

  const noteSecs = durationSecs / FALLBACK_PHRASE.length;
  const master = offline.createGain();
  master.gain.value = 0.9;
  master.connect(offline.destination);

  FALLBACK_PHRASE.forEach((semi, i) => {
    const start = i * noteSecs;
    const freq = FALLBACK_ROOT_HZ * Math.pow(2, semi / 12);
    const partials = [
      { mult: 1, gain: 0.5, detune: 0 },
      { mult: 2, gain: 0.22, detune: 5 },
      { mult: 3, gain: 0.12, detune: -6 },
      { mult: 4.01, gain: 0.05, detune: 8 },
    ];
    const bodyGain = offline.createGain();
    bodyGain.connect(master);
    const a = 0.006;
    bodyGain.gain.setValueAtTime(0.0001, start);
    bodyGain.gain.exponentialRampToValueAtTime(0.3, start + a);
    bodyGain.gain.exponentialRampToValueAtTime(0.0008, start + noteSecs * 2.4);
    for (const p of partials) {
      const osc = offline.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * p.mult;
      osc.detune.value = p.detune;
      const g = offline.createGain();
      g.gain.value = p.gain;
      osc.connect(g);
      g.connect(bodyGain);
      osc.start(start);
      osc.stop(start + noteSecs * 2.6);
    }
    // Soft hammer transient → gives the corpus some bright, percussive grains.
    const hammerLen = Math.floor(0.035 * sampleRate);
    const hammerBuf = offline.createBuffer(1, hammerLen, sampleRate);
    const hd = hammerBuf.getChannelData(0);
    for (let n = 0; n < hammerLen; n++) {
      const t = n / hammerLen;
      hd[n] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.5);
    }
    const hammer = offline.createBufferSource();
    hammer.buffer = hammerBuf;
    const hammerFilt = offline.createBiquadFilter();
    hammerFilt.type = "bandpass";
    hammerFilt.frequency.value = Math.min(4200, freq * 6);
    hammerFilt.Q.value = 0.6;
    const hammerGain = offline.createGain();
    hammerGain.gain.value = 0.35;
    hammer.connect(hammerFilt);
    hammerFilt.connect(hammerGain);
    hammerGain.connect(master);
    hammer.start(start);
  });

  const drone = offline.createOscillator();
  drone.type = "sine";
  drone.frequency.value = FALLBACK_ROOT_HZ / 2;
  const droneGain = offline.createGain();
  droneGain.gain.value = 0.04;
  drone.connect(droneGain);
  droneGain.connect(master);
  drone.start(0);
  drone.stop(durationSecs);

  return offline.startRendering();
}

// ─── Spatial drifting-read-head engine ───────────────────────────────────────

export interface VoiceState {
  id: number;
  // World position in metres (listener at origin). x right, y up, z toward user.
  pos: { x: number; y: number; z: number };
  bornAt: number; // ctx time
  age: number; // seconds alive (updated each tick)
  level: number; // current rendered loudness 0..1 (for visuals)
  pulse: number; // 0..1.4 grain-fire burst (for visuals)
  head: number; // 0..1 read-head position THROUGH THE RECORDING (for visuals)
  fading: boolean;
}

interface Voice {
  state: VoiceState;
  // Audio graph: per-grain sources connect into `gain` → panner → dry/wet.
  gain: GainNode; // overall voice level (attack/fade)
  panner: PannerNode;
  dry: GainNode;
  wet: GainNode; // reverb send
  // Read-head walk through the recording.
  headPos: number; // current offset INTO the recording, seconds
  driftRate: number; // base seconds-of-recording advanced per real second
  nextGrainAt: number; // ctx time the next grain should fire
  grainTranspose: number; // fixed slight detune per voice (playbackRate)
}

const MAX_VOICES = 24;

// Grain timing. Hann-windowed grains ~60–120ms with overlap, scheduled a little
// ahead of the audio clock for steady concatenation.
const GRAIN_SECS = 0.1; // ~100ms grains
const GRAIN_STRIDE = 0.05; // 50% overlap → smooth, continuous read-head texture

// Build a short, smooth reverb impulse response (procedural — no asset).
function makeReverbIR(ctx: AudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.pow(1 - t, 2.6) * (1 - Math.exp(-i / (rate * 0.02)));
      data[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return buf;
}

// Pre-render a reusable Hann window as an AudioBuffer-friendly gain envelope.
// We apply the window per grain via the grain gain node's ramp schedule.

export class DriftAudio {
  ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private convolver: ConvolverNode;
  private reverbReturn: GainNode;
  private voices: Voice[] = [];
  private nextId = 0;
  private startedAt = 0;

  // The recording corpus we read grains out of.
  private corpus: AudioBuffer | null = null;
  private corpusDur = 0;
  kind: AudioSourceKind = "piano";

  // Energy-steered drift multiplier (smoothed). 1 = baseline.
  private driftSpeed = 1;

  constructor() {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctx();
    const ctx = this.ctx;
    this.startedAt = ctx.currentTime;

    // Listener at origin, facing -z (default). Up is +y.
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = 0;
      L.positionY.value = 0;
      L.positionZ.value = 0;
      L.forwardX.value = 0;
      L.forwardY.value = 0;
      L.forwardZ.value = -1;
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    }

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001; // fade in on start

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.28;

    this.convolver = ctx.createConvolver();
    this.convolver.buffer = makeReverbIR(ctx, 3.4);
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.gain.value = 0.9;

    this.master.connect(this.comp);
    this.convolver.connect(this.reverbReturn);
    this.reverbReturn.connect(this.comp);
    this.comp.connect(ctx.destination);
  }

  // Resume + fade master in (call inside the Start gesture).
  async start() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(this.targetMaster(), now + 0.7);
  }

  /**
   * Load the corpus: fetch Karel's recording, fall back to synthesis on failure.
   * Returns the kind actually used so the UI can surface a fallback notice.
   */
  async loadCorpus(): Promise<AudioSourceKind> {
    let buf = await fetchPianoBuffer(this.ctx);
    let kind: AudioSourceKind = "piano";
    if (!buf) {
      buf = await renderFallbackBuffer(this.ctx.sampleRate);
      kind = "fallback";
    }
    this.corpus = buf;
    this.corpusDur = buf.duration;
    this.kind = kind;
    return kind;
  }

  hasCorpus(): boolean {
    return this.corpus != null;
  }

  // Master scales down as voices accrete so the sum never gets harsh.
  private targetMaster(): number {
    const n = this.voices.filter((v) => !v.state.fading).length;
    const g = 0.42 / (1 + n * 0.085);
    return Math.max(0.09, g);
  }

  // Place a persistent drifting-read-head voice at a body-space point.
  // bx,by in [-1,1]; bz depth 0..1.
  placeVoice(bx: number, by: number, bz: number) {
    if (!this.corpus) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Map body space → world metres (a shell around the listener; depth on z).
    const radius = 3.2;
    const x = bx * radius;
    const y = by * radius * 0.7;
    const z = (bz - 0.5) * 4.0 - 1.2;
    const pos = { x, y, z };

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1.2;
    panner.maxDistance = 18;
    panner.rolloffFactor = 1.1;
    if (panner.positionX) {
      panner.positionX.value = x;
      panner.positionY.value = y;
      panner.positionZ.value = z;
    } else {
      panner.setPosition(x, y, z);
    }

    gain.connect(panner);

    // Dry + wet sends. Wet (reverb) grows with distance.
    const dist = Math.hypot(x, y, z);
    const wetAmt = Math.min(0.9, 0.12 + (dist / panner.maxDistance) * 1.6);
    const dryAmt = Math.max(0.25, 1 - wetAmt * 0.7);

    const dry = ctx.createGain();
    dry.gain.value = dryAmt;
    const wet = ctx.createGain();
    wet.gain.value = wetAmt;

    panner.connect(dry);
    panner.connect(wet);
    dry.connect(this.master);
    wet.connect(this.convolver);

    // Soft attack — a voice blooms in over ~1.4s.
    const peak = 0.6;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 1.4);

    // Each head starts at a different place in the recording (height biases it),
    // and owns a slightly different drift rate so the chord never moves in lock.
    const startFrac = Math.min(
      0.98,
      Math.max(0, ((by + 1) / 2) * 0.7 + Math.random() * 0.25),
    );
    const headPos = startFrac * this.corpusDur;
    // Baseline drift: a head crawls ~0.05–0.13 recording-seconds per real second
    // (i.e. dramatically time-stretched — a long-form walk through the piece).
    const driftRate = 0.05 + Math.random() * 0.08;
    // Tiny per-voice transpose (within ±~1 semitone) for chordal spread.
    const grainTranspose = Math.pow(2, (Math.random() * 2 - 1) / 14);

    const state: VoiceState = {
      id: this.nextId++,
      pos,
      bornAt: now,
      age: 0,
      level: 0,
      pulse: 1, // bloom burst at placement
      head: startFrac,
      fading: false,
    };
    this.voices.push({
      state,
      gain,
      panner,
      dry,
      wet,
      headPos,
      driftRate,
      nextGrainAt: now,
      grainTranspose,
    });

    // Cap: fade the oldest when we exceed the limit.
    if (this.voices.length > MAX_VOICES) {
      const oldest = this.voices.find((v) => !v.state.fading);
      if (oldest) this.fadeOut(oldest);
    }

    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.targetMaster(), now, 0.5);
  }

  // Fire ONE Hann-windowed grain for a voice from its current head position.
  private fireGrain(v: Voice, when: number) {
    const ctx = this.ctx;
    const buf = this.corpus;
    if (!buf) return;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = v.grainTranspose;

    // Per-grain Hann window applied via a gain node ramped over the grain.
    const gg = ctx.createGain();
    gg.gain.value = 0.0001;
    const half = GRAIN_SECS / 2;
    const peak = 0.5; // grain amplitude (overlap sums toward unity)
    gg.gain.setValueAtTime(0.0001, when);
    // Raised-cosine attack then release ≈ Hann window.
    gg.gain.linearRampToValueAtTime(peak, when + half);
    gg.gain.linearRampToValueAtTime(0.0001, when + GRAIN_SECS);

    src.connect(gg);
    gg.connect(v.gain);

    // Read from the head position, clamped inside the buffer.
    const offset = Math.min(
      Math.max(0, v.headPos),
      Math.max(0, this.corpusDur - GRAIN_SECS - 0.001),
    );
    try {
      src.start(when, offset, GRAIN_SECS + 0.02);
      src.stop(when + GRAIN_SECS + 0.05);
    } catch {
      /* scheduling edge — skip this grain */
    }
    src.onended = () => {
      try {
        src.disconnect();
        gg.disconnect();
      } catch {
        /* noop */
      }
    };
  }

  /**
   * Per-frame update. Advances each voice's read-head, schedules grains a little
   * ahead of the clock, evolves visuals. `energy` 0..1 from body motion gently
   * steers global drift speed (still = slow walk; moving = heads advance faster).
   */
  tick(dt: number, energy: number) {
    const now = this.ctx.currentTime;

    // Energy steers drift: 0.6x when still → ~2.2x when very active. Smoothed.
    const targetDrift = 0.6 + energy * 1.6;
    this.driftSpeed += (targetDrift - this.driftSpeed) * 0.05;

    // Body energy swells overall level; stillness eases it down (voices keep
    // sounding — master never drops to silence).
    const energized = this.targetMaster() * (0.62 + energy * 0.5);
    this.master.gain.setTargetAtTime(Math.min(0.45, energized), now, 0.4);

    const scheduleAhead = 0.12; // schedule grains up to 120ms ahead

    for (const v of this.voices) {
      v.state.age = now - v.state.bornAt;

      // Advance the read-head slowly through the recording. At the end, wrap
      // back near the start (a long, slow loop through his whole performance —
      // but each head wraps at a different time so the chord never re-aligns).
      if (!v.state.fading) {
        v.headPos += v.driftRate * this.driftSpeed * dt;
        if (v.headPos > this.corpusDur - GRAIN_SECS) {
          v.headPos = 0.0 + Math.random() * 0.05 * this.corpusDur;
        }
      }
      v.state.head =
        this.corpusDur > 0
          ? Math.min(1, Math.max(0, v.headPos / this.corpusDur))
          : 0;

      // Schedule grains for this voice up to the look-ahead horizon.
      if (!v.state.fading) {
        let fired = false;
        while (v.nextGrainAt < now + scheduleAhead) {
          if (v.nextGrainAt < now) v.nextGrainAt = now;
          this.fireGrain(v, v.nextGrainAt);
          v.nextGrainAt += GRAIN_STRIDE;
          fired = true;
        }
        if (fired) v.state.pulse = Math.min(1.4, v.state.pulse + 0.12);
      }

      // Visual level: attack ramp × distance attenuation × energy lift.
      const attack = Math.min(1, v.state.age / 1.4);
      const dist = Math.hypot(v.state.pos.x, v.state.pos.y, v.state.pos.z);
      const distAtten = 1.2 / (1.2 + dist * 0.5);
      v.state.level = v.state.fading
        ? Math.max(0, v.state.level - dt * 0.25)
        : attack * distAtten * (0.7 + energy * 0.4);

      // Pulse decays after each grain burst; gentle re-bloom on high energy.
      v.state.pulse = Math.max(0, v.state.pulse - dt * 0.9) + energy * dt * 0.3;
      v.state.pulse = Math.min(1.4, v.state.pulse);
    }
  }

  private fadeOut(v: Voice) {
    v.state.fading = true;
    const now = this.ctx.currentTime;
    const g = v.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.exponentialRampToValueAtTime(0.0001, now + 4.0);
    window.setTimeout(() => {
      this.voices = this.voices.filter((x) => x !== v);
      try {
        v.gain.disconnect();
        v.panner.disconnect();
        v.dry.disconnect();
        v.wet.disconnect();
      } catch {
        /* noop */
      }
    }, 4500);
  }

  // Snapshot for the renderer.
  snapshot(): VoiceState[] {
    return this.voices.map((v) => v.state);
  }

  voiceCount(): number {
    return this.voices.filter((v) => !v.state.fading).length;
  }

  async close() {
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    } catch {
      /* noop */
    }
    // Grain sources self-stop; just fade and close.
    await new Promise((r) => window.setTimeout(r, 400));
    try {
      await this.ctx.close();
    } catch {
      /* noop */
    }
  }
}
