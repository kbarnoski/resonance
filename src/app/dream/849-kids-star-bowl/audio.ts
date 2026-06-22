// Star Bowl audio engine — Web Audio only, kids-safe bedtime register.
//
// Mandatory safety chain:
//   sources → masterGain (<=0.28) → lowpass (<=7000Hz)
//           → DynamicsCompressor(threshold -10, ratio 20:1) → destination
//
// Harmony idea (the whole point of the piece):
//   tension `t` in 0..1 is the cluster radius (center=0 calm, rim=1 spiky).
//   - A low always-on drone + a warm consonant pad keeps it never-silent.
//   - As t rises, a "tension voice" detunes UP toward a dissonant interval
//     (a soft minor-2nd / tritone cluster), gentle beating partials swell,
//     and a slow shimmer-wobble (tremolo) fades in. Never harsh, never loud.
//   - When t falls (tilt home), the tension voice GLIDES back to a consonant
//     octave via setTargetAtTime — the audible resolution / reward.
//
// All ramps use setTargetAtTime / linearRamp for soft, no-click transitions.

const A2 = 110.0; // low drone root (A2)
// Consonant pad: A2 root + perfect fifth + octave + major tenth — warm/sus.
const PAD_FREQS = [A2, A2 * 1.5, A2 * 2, A2 * 2.5];

// Resolution targets (consonant) vs. tension targets (dissonant) for the
// two "tension voices." Consonant = octave/fifth; tension = minor 2nd above
// the octave and a tritone — soft clustering, the "ooh wobbly" sound.
const VOICE_CONSONANT = [A2 * 2, A2 * 3]; // octave, octave+fifth
const VOICE_TENSION = [A2 * 2 * 1.0595, A2 * 2.6]; // ~minor 2nd up, ~tritone-ish

export interface StarBowlAudio {
  setTension: (t: number) => void; // t in 0..1
  pluck: (bright: number) => void; // soft star "ping" on rim contact
  resolveBloom: () => void; // satisfying bloom when returning home
  close: () => Promise<void>;
  ctx: AudioContext;
}

export function makeAudio(): StarBowlAudio | null {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();

  // ── Safety chain ────────────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.0; // fade in after start
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 5200; // <= 7000, soft top
  lowpass.Q.value = 0.4;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 20;
  comp.knee.value = 8;
  comp.attack.value = 0.02;
  comp.release.value = 0.3;
  master.connect(lowpass);
  lowpass.connect(comp);
  comp.connect(ctx.destination);

  const now = ctx.currentTime;
  master.gain.setTargetAtTime(0.24, now, 0.8); // gentle fade-in (<=0.28)

  // ── Always-on consonant pad/drone ────────────────────────────────────────
  const padGain = ctx.createGain();
  padGain.gain.value = 0.5;
  padGain.connect(master);
  const padOscs: OscillatorNode[] = [];
  PAD_FREQS.forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = i === 0 ? "sine" : "triangle";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.22 : 0.1 - i * 0.018;
    // very slow detune drift for an Eno-style living drone
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.04 + i * 0.017;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 1.2 + i; // cents of drift
    lfo.connect(lfoG);
    lfoG.connect(o.detune);
    o.connect(g);
    g.connect(padGain);
    o.start();
    lfo.start();
    padOscs.push(o, lfo);
  });

  // ── Two tension voices (the dissonance that resolves) ────────────────────
  const tensionGain = ctx.createGain();
  tensionGain.gain.value = 0.0; // silent at center, swells with tension
  tensionGain.connect(master);

  // shimmer tremolo applied to the tension voices
  const tremGain = ctx.createGain();
  tremGain.gain.value = 1.0;
  tremGain.connect(tensionGain);
  const tremLfo = ctx.createOscillator();
  tremLfo.type = "sine";
  tremLfo.frequency.value = 5.5; // soft wobble / beating shimmer
  const tremDepth = ctx.createGain();
  tremDepth.gain.value = 0.0; // depth swells with tension
  tremLfo.connect(tremDepth);
  tremDepth.connect(tremGain.gain);
  tremLfo.start();

  const voiceOscs: OscillatorNode[] = [];
  VOICE_CONSONANT.forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    o.connect(g);
    g.connect(tremGain);
    o.start();
    voiceOscs.push(o);
    void i;
  });

  // ── API ──────────────────────────────────────────────────────────────────
  function setTension(tRaw: number) {
    const t = Math.max(0, Math.min(1, tRaw));
    const time = ctx.currentTime;
    // Glide each tension voice between consonant and dissonant targets.
    for (let i = 0; i < voiceOscs.length; i++) {
      const target =
        VOICE_CONSONANT[i] + (VOICE_TENSION[i] - VOICE_CONSONANT[i]) * t;
      voiceOscs[i].frequency.setTargetAtTime(target, time, 0.12);
    }
    // Tension voices fade in only as you climb out (stay subtle).
    tensionGain.gain.setTargetAtTime(0.16 * t, time, 0.15);
    // Shimmer wobble depth swells with tension.
    tremDepth.gain.setTargetAtTime(0.6 * t, time, 0.2);
    // Open the lowpass slightly at the rim so dissonance has a touch more
    // edge — but still capped well under 7000Hz.
    lowpass.frequency.setTargetAtTime(5200 + 1200 * t, time, 0.25);
  }

  function pluck(bright: number) {
    const time = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    // pluck pitch riding the pad's upper partials
    o.frequency.value = A2 * (3 + bright * 1.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.06, time + 0.05); // soft >=40ms attack
    g.gain.exponentialRampToValueAtTime(0.0008, time + 0.9);
    o.connect(g);
    g.connect(master);
    o.start(time);
    o.stop(time + 0.95);
  }

  function resolveBloom() {
    // A soft consonant swell when the cluster comes home — the reward.
    const time = ctx.currentTime;
    const bloom = ctx.createGain();
    bloom.gain.setValueAtTime(0, time);
    bloom.gain.linearRampToValueAtTime(0.09, time + 0.12);
    bloom.gain.exponentialRampToValueAtTime(0.0008, time + 1.6);
    bloom.connect(master);
    [A2 * 2, A2 * 3, A2 * 4].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = f > A2 * 3 ? 0.3 : 0.5;
      o.connect(g);
      g.connect(bloom);
      o.start(time);
      o.stop(time + 1.7);
    });
  }

  async function close() {
    try {
      const time = ctx.currentTime;
      master.gain.setTargetAtTime(0, time, 0.2);
      await new Promise((r) => setTimeout(r, 250));
      padOscs.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      });
      voiceOscs.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      });
      try {
        tremLfo.stop();
      } catch {
        /* already stopped */
      }
      await ctx.close();
    } catch {
      /* ignore teardown errors */
    }
  }

  return { setTension, pluck, resolveBloom, close, ctx };
}
