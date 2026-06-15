// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — kid-safe shadow-monster sound engine.
//
// Sounds (all FRIENDLY, never scary — soft attacks, lowpassed):
//   • ambient bed — warm theatrical hum, always on (NEVER silent)
//   • whoosh      — continuous airy noise whose intensity tracks motion energy
//                   (frame-to-frame silhouette change). Soft, breathy, swelling.
//   • boing       — comic cartoon "BOING" on a jump (centroid rising fast):
//                   pitch-bent sine with a wobble, squash-stretch flavour.
//   • roar        — a BIG soft roar that swells as the monster gets big (mask
//                   area growing). SOFT-ATTACKED + LOW-PASSED so it is friendly,
//                   a happy dinosaur, not a horror growl.
//
// Master chain (HARD kid-safety rule):
//   masterGain(≤0.55) → lowpass(≤7.5kHz) → DynamicsCompressor(-18/6/12) → out
//
// Persistent voices (master, ambient, whoosh, roar) are pre-created so the first
// interaction responds in <50ms. The boing is a short-lived one-shot.
// ─────────────────────────────────────────────────────────────────────────────

export interface MonsterAudio {
  ctx: AudioContext;
  resume: () => Promise<void>;
  /** Continuous whoosh intensity 0..1 (motion energy). Call every frame. */
  setWhoosh: (intensity: number) => void;
  /** Continuous roar amount 0..1 (how big the monster is). Call every frame. */
  setRoar: (amount: number) => void;
  /** Fire a one-shot comic BOING. power 0..1 = how high the jump. */
  boing: (power: number) => void;
  setMuted: (m: boolean) => void;
  dispose: () => void;
}

const MASTER_CAP = 0.55;

export function buildMonsterAudio(): MonsterAudio {
  const Ctx: typeof AudioContext =
    window.AudioContext ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webkitAudioContext;
  const ctx = new Ctx();

  // ── Kid-safe master chain ──────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = MASTER_CAP;

  const safeLowpass = ctx.createBiquadFilter();
  safeLowpass.type = "lowpass";
  safeLowpass.frequency.value = 7500; // no piercing highs
  safeLowpass.Q.value = 0.5;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 6;
  comp.knee.value = 12;
  comp.attack.value = 0.005;
  comp.release.value = 0.2;

  master.connect(safeLowpass);
  safeLowpass.connect(comp);
  comp.connect(ctx.destination);

  // Shared long noise buffer (used by whoosh + roar texture).
  const noiseBuf = makeNoiseBuffer(ctx, 3.0);

  // ── Ambient bed: a warm, slightly wobbling theatre hum (never silent) ───────
  const ambGain = ctx.createGain();
  ambGain.gain.value = 0.06;
  ambGain.connect(master);

  const ambFilter = ctx.createBiquadFilter();
  ambFilter.type = "lowpass";
  ambFilter.frequency.value = 520;
  ambFilter.Q.value = 0.7;
  ambFilter.connect(ambGain);

  const ambA = ctx.createOscillator();
  ambA.type = "triangle";
  ambA.frequency.value = 96;
  const ambB = ctx.createOscillator();
  ambB.type = "sine";
  ambB.frequency.value = 144.5; // a soft fifth-ish, slightly off → gentle beat
  ambA.connect(ambFilter);
  ambB.connect(ambFilter);

  // Slow breathing wobble so the bed feels alive, theatrical, not a drone.
  const ambLfo = ctx.createOscillator();
  ambLfo.type = "sine";
  ambLfo.frequency.value = 0.16;
  const ambLfoGain = ctx.createGain();
  ambLfoGain.gain.value = 0.025;
  ambLfo.connect(ambLfoGain);
  ambLfoGain.connect(ambGain.gain);
  ambA.start();
  ambB.start();
  ambLfo.start();

  // ── Persistent WHOOSH: looping filtered noise, gain & cutoff track motion ───
  const whooshSrc = ctx.createBufferSource();
  whooshSrc.buffer = noiseBuf;
  whooshSrc.loop = true;
  const whooshFilter = ctx.createBiquadFilter();
  whooshFilter.type = "bandpass";
  whooshFilter.frequency.value = 700;
  whooshFilter.Q.value = 0.8;
  const whooshGain = ctx.createGain();
  whooshGain.gain.value = 0.0;
  whooshSrc.connect(whooshFilter);
  whooshFilter.connect(whooshGain);
  whooshGain.connect(master);
  whooshSrc.start();

  // ── Persistent ROAR: detuned low oscillators + noise, swelling, lowpassed ───
  // Built friendly: low fundamental, soft attack via the gain we ride each
  // frame, and a permanent lowpass so it can never get harsh/scary.
  const roarGain = ctx.createGain();
  roarGain.gain.value = 0.0;
  const roarLp = ctx.createBiquadFilter();
  roarLp.type = "lowpass";
  roarLp.frequency.value = 900; // soft, rounded — a happy dino, not horror
  roarLp.Q.value = 0.6;
  roarLp.connect(roarGain);
  roarGain.connect(master);

  const roarA = ctx.createOscillator();
  roarA.type = "sawtooth";
  roarA.frequency.value = 70;
  const roarB = ctx.createOscillator();
  roarB.type = "sawtooth";
  roarB.frequency.value = 70 * 1.5; // a fifth up — fuller, still gentle
  roarA.detune.value = -6;
  roarB.detune.value = 7;
  roarA.connect(roarLp);
  roarB.connect(roarLp);

  // A growly flutter on the cutoff gives it a "raaar" texture (slow → friendly).
  const roarFlutter = ctx.createOscillator();
  roarFlutter.type = "sine";
  roarFlutter.frequency.value = 7;
  const roarFlutterGain = ctx.createGain();
  roarFlutterGain.gain.value = 220;
  roarFlutter.connect(roarFlutterGain);
  roarFlutterGain.connect(roarLp.frequency);

  // A whisper of noise riding the roar = breathy big-creature air.
  const roarNoise = ctx.createBufferSource();
  roarNoise.buffer = noiseBuf;
  roarNoise.loop = true;
  const roarNoiseFilter = ctx.createBiquadFilter();
  roarNoiseFilter.type = "lowpass";
  roarNoiseFilter.frequency.value = 600;
  const roarNoiseGain = ctx.createGain();
  roarNoiseGain.gain.value = 0.4;
  roarNoise.connect(roarNoiseFilter);
  roarNoiseFilter.connect(roarNoiseGain);
  roarNoiseGain.connect(roarLp);
  roarA.start();
  roarB.start();
  roarFlutter.start();
  roarNoise.start();

  let muted = false;
  let whooshTarget = 0;
  let roarTarget = 0;

  function setWhoosh(intensity: number) {
    if (muted) return;
    const now = ctx.currentTime;
    const s = clamp01(intensity);
    whooshTarget = s;
    // Gentle: idles near silent, swells to a soft airy rush.
    whooshGain.gain.setTargetAtTime(0.01 + s * 0.16, now, 0.06);
    // Brighter (higher band) as motion rises → feels faster, still safe.
    whooshFilter.frequency.setTargetAtTime(500 + s * 1600, now, 0.08);
  }

  function setRoar(amount: number) {
    if (muted) return;
    const now = ctx.currentTime;
    const s = clamp01(amount);
    roarTarget = s;
    // SOFT-ATTACKED: we ride the gain with a slow time-constant so there is
    // never a sudden transient. Swells in as the monster gets big.
    roarGain.gain.setTargetAtTime(s * 0.22, now, 0.12);
    // Pitch rises a touch as it gets big → "GETTING BIGGER" without harshness.
    const base = 64 + s * 26;
    roarA.frequency.setTargetAtTime(base, now, 0.15);
    roarB.frequency.setTargetAtTime(base * 1.5, now, 0.15);
    // Open the lowpass a little when big, but keep it rounded.
    roarLp.frequency.setTargetAtTime(700 + s * 700, now, 0.15);
  }

  function boing(power: number) {
    if (muted) return;
    const now = ctx.currentTime;
    const s = clamp01(power);
    const dur = 0.32 + s * 0.22;

    const bus = ctx.createGain();
    bus.gain.value = 0.0001;
    bus.connect(master);
    // Soft attack (no scary snap), comic decay.
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.exponentialRampToValueAtTime(0.18 + s * 0.08, now + 0.03);
    bus.gain.setTargetAtTime(0.0001, now + dur * 0.4, dur * 0.4);

    // Classic cartoon boing: sine that springs up then wobbles down.
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const top = 360 + s * 360;
    const bottom = 120 + s * 60;
    osc.frequency.setValueAtTime(bottom, now);
    osc.frequency.exponentialRampToValueAtTime(top, now + 0.05);
    osc.frequency.exponentialRampToValueAtTime(bottom, now + dur);

    // Wobble = the springy "oioioing".
    const wob = ctx.createOscillator();
    wob.type = "sine";
    wob.frequency.setValueAtTime(18 + s * 14, now);
    wob.frequency.exponentialRampToValueAtTime(6, now + dur);
    const wobGain = ctx.createGain();
    wobGain.gain.value = 80 + s * 80;
    wob.connect(wobGain);
    wobGain.connect(osc.frequency);

    osc.connect(bus);
    osc.start(now);
    osc.stop(now + dur + 0.05);
    wob.start(now);
    wob.stop(now + dur + 0.05);

    window.setTimeout(
      () => {
        try {
          bus.disconnect();
        } catch {
          /* gone */
        }
      },
      (dur + 0.2) * 1000,
    );
  }

  async function resume() {
    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  function setMuted(m: boolean) {
    muted = m;
    const now = ctx.currentTime;
    master.gain.setTargetAtTime(m ? 0 : MASTER_CAP, now, 0.05);
    if (m) {
      whooshGain.gain.setTargetAtTime(0, now, 0.05);
      roarGain.gain.setTargetAtTime(0, now, 0.05);
    } else {
      // Restore continuous voices to their last targets.
      whooshGain.gain.setTargetAtTime(0.01 + whooshTarget * 0.16, now, 0.06);
      roarGain.gain.setTargetAtTime(roarTarget * 0.22, now, 0.12);
    }
  }

  function dispose() {
    try {
      ambA.stop();
      ambB.stop();
      ambLfo.stop();
      whooshSrc.stop();
      roarA.stop();
      roarB.stop();
      roarFlutter.stop();
      roarNoise.stop();
    } catch {
      /* already stopped */
    }
    void ctx.close();
  }

  return {
    ctx,
    resume,
    setWhoosh,
    setRoar,
    boing,
    setMuted,
    dispose,
  };
}

function makeNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
