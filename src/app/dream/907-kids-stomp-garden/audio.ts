// Kid-safe Web Audio engine for the Stomp Garden.
// Master chain (HARD constraint):
//   source -> master Gain (<=0.26) -> lowpass (~6000Hz) -> compressor -> destination
// The mic is used ONLY for live onset detection. Audio is never recorded or stored.

export type Timbre = "thump" | "shaker";

export interface AudioEngine {
  ctx: AudioContext;
  busIn: GainNode; // connect voices here
  ambientGain: GainNode;
  resume: () => Promise<void>;
  hit: (timbre: Timbre, velocity: number) => void;
  startAmbient: () => void;
  teardown: () => void;
}

// ---- master chain -----------------------------------------------------------

export function createAudioEngine(): AudioEngine {
  const Ctx = (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext) as typeof AudioContext;
  const ctx = new Ctx();

  const master = ctx.createGain();
  master.gain.value = 0.26; // hard cap: kid-safe loudness

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 6000; // tame any harshness / high ringing

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 12;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;

  // Everything (voices + ambient) flows through this single bus.
  const busIn = ctx.createGain();
  busIn.gain.value = 1;

  busIn.connect(master);
  master.connect(lp);
  lp.connect(comp);
  comp.connect(ctx.destination);

  // ---- ambient: quiet warm pad + soft heartbeat ---------------------------
  const ambientGain = ctx.createGain();
  ambientGain.gain.value = 0; // faded in by startAmbient
  ambientGain.connect(busIn);

  let ambientNodes: { stop: () => void } | null = null;

  function startAmbient() {
    if (ambientNodes) return;
    const now = ctx.currentTime;

    // Warm pad: two detuned triangle oscillators through a gentle lowpass.
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 900;
    padFilter.connect(ambientGain);

    const oscs: OscillatorNode[] = [];
    [98, 146.83, 196].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      o.detune.value = i === 1 ? 6 : i === 2 ? -5 : 0;
      const g = ctx.createGain();
      g.gain.value = 0.18 / (i + 1);
      o.connect(g);
      g.connect(padFilter);
      o.start(now);
      oscs.push(o);
    });

    // Slow breathing LFO on the pad filter cutoff.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 280;
    lfo.connect(lfoGain);
    lfoGain.connect(padFilter.frequency);
    lfo.start(now);

    // Soft heartbeat-ish pulse every ~1.1s so silence never looks broken.
    let stopped = false;
    let beatTimer = 0;
    const heartbeat = () => {
      if (stopped) return;
      const t = ctx.currentTime;
      thumpVoice(ctx, ambientGain, t, 70, 0.12, 0.16); // very soft low pulse
      beatTimer = window.setTimeout(heartbeat, 1100);
    };
    heartbeat();

    // Fade the ambient in gently.
    ambientGain.gain.cancelScheduledValues(now);
    ambientGain.gain.setValueAtTime(0, now);
    ambientGain.gain.linearRampToValueAtTime(0.5, now + 1.6);

    ambientNodes = {
      stop: () => {
        stopped = true;
        window.clearTimeout(beatTimer);
        oscs.forEach((o) => {
          try {
            o.stop();
          } catch {
            /* noop */
          }
        });
        try {
          lfo.stop();
        } catch {
          /* noop */
        }
      },
    };
  }

  // ---- percussion voices (capped polyphony) -------------------------------
  const MAX_VOICES = 6;
  const active: { node: AudioNode; end: number }[] = [];

  function track(node: AudioNode, dur: number) {
    const end = ctx.currentTime + dur;
    active.push({ node, end });
    // Steal oldest if over the cap.
    while (active.length > MAX_VOICES) {
      const oldest = active.shift();
      try {
        (oldest?.node as GainNode).disconnect();
      } catch {
        /* noop */
      }
    }
    // Lazy cleanup of finished voices.
    const cutoff = ctx.currentTime;
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].end < cutoff - 0.05) active.splice(i, 1);
    }
  }

  function hit(timbre: Timbre, velocity: number) {
    // velocity 0..1, but OUTPUT stays soft regardless of input loudness.
    const v = 0.35 + Math.min(1, Math.max(0, velocity)) * 0.65;
    const t = ctx.currentTime;
    if (timbre === "shaker") {
      const g = shakerVoice(ctx, busIn, t, 0.18 * v);
      track(g, 0.25);
    } else {
      const g = thumpVoice(ctx, busIn, t, 95, 0.28 * v, 0.28);
      track(g, 0.35);
    }
  }

  async function resume() {
    if (ctx.state === "suspended") await ctx.resume();
  }

  function teardown() {
    try {
      ambientNodes?.stop();
    } catch {
      /* noop */
    }
    active.forEach((a) => {
      try {
        (a.node as GainNode).disconnect();
      } catch {
        /* noop */
      }
    });
    active.length = 0;
    try {
      if (ctx.state !== "closed") void ctx.close();
    } catch {
      /* noop */
    }
  }

  return { ctx, busIn, ambientGain, resume, hit, startAmbient, teardown };
}

// ---- voice generators -------------------------------------------------------

// Membrane-y sine thump (drum / low plant). Returns the voice's gain node.
function thumpVoice(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  freq: number,
  peak: number,
  dur: number,
): GainNode {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq * 1.6, t);
  osc.frequency.exponentialRampToValueAtTime(freq, t + 0.08);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  osc.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  return g;
}

// Filtered noise burst (shaker / chime plant). Returns the voice's gain node.
function shakerVoice(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  peak: number,
): GainNode {
  const len = Math.floor(ctx.sampleRate * 0.2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.7;

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 3200;
  bp.Q.value = 1.2;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

  src.connect(bp);
  bp.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + 0.22);
  return g;
}
