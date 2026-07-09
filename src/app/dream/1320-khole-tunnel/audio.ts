// ─────────────────────────────────────────────────────────────────────────────
// 1320-khole-tunnel · audio.ts — the desynced rhythmic pulse, the piece's IDENTITY.
//
//   The spine is NOT a "strike-a-bell" texture — it is a steady rhythmic THROB
//   read through the desync engine. Every frame the page hands us the LAGGED
//   pulse value (the visual ~3 Hz breath from `lagSeconds` ago). We drive:
//     • a warm sub sine whose amplitude throbs with the lagged pulse, and
//     • a filtered mid tone whose amplitude + cutoff throb with it.
//   So the beat you HEAR arrives offset from the flash you SEE — the unbinding.
//
//   A thin drone bed, a downward Shepard undertow, and a cavern reverb add
//   depth, but the throb is the through-line. Master ≤ 0.28, 1.2 s fade-in,
//   DynamicsCompressor limiter on the master. Full teardown on stop().
// ─────────────────────────────────────────────────────────────────────────────

import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

export interface KholeAudio {
  /** Feed the LAGGED pulse (0..1), the dissociation depth (0..1), and dt. */
  update(laggedPulse: number, dissociation: number, dtSeconds: number): void;
  stop(): void;
}

const MASTER_PEAK = 0.26; // ≤ 0.28 ceiling

export function makeKholeAudio(ctx: AudioContext): KholeAudio {
  const now0 = ctx.currentTime;

  // ── master bus: limiter → fade-in gain → destination ──
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now0);
  master.gain.exponentialRampToValueAtTime(MASTER_PEAK, now0 + 1.2);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  master.connect(limiter);
  limiter.connect(ctx.destination);

  // cavernous void tail — the spine feeds a wet send for depth
  const verb: VoidReverb = createVoidReverb(ctx, { seconds: 5, wet: 0.4 });
  verb.output.connect(master);

  // ── the rhythmic THROB spine ──
  // warm sub sine
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = 41; // ~E1
  const subGain = ctx.createGain();
  subGain.gain.value = 0.0001;
  sub.connect(subGain);
  subGain.connect(master);
  subGain.connect(verb.input);

  // filtered mid tone — its cutoff also throbs so the pulse has "teeth"
  const tone = ctx.createOscillator();
  tone.type = "triangle";
  tone.frequency.value = 82; // ~E2 (octave over the sub)
  const toneLp = ctx.createBiquadFilter();
  toneLp.type = "lowpass";
  toneLp.frequency.value = 300;
  toneLp.Q.value = 3;
  const toneGain = ctx.createGain();
  toneGain.gain.value = 0.0001;
  tone.connect(toneLp);
  toneLp.connect(toneGain);
  toneGain.connect(master);
  toneGain.connect(verb.input);

  sub.start();
  tone.start();

  // ── depth beds (thin) ──
  const drone: DroneBank = startDroneBank(ctx, master, { root: 41, peakGain: 0.1 });
  const shepard: ShepardEngine = startShepard(ctx, verb.input, {
    dir: -1, // downward plunge — the NDE / k-hole descent
    peakGain: 0.16,
  });

  let stopped = false;

  const update = (laggedPulse: number, dissociation: number, dt: number) => {
    if (stopped) return;
    const now = ctx.currentTime;
    const p = Math.min(1, Math.max(0, laggedPulse));
    const d = Math.min(1, Math.max(0, dissociation));

    // Shape the throb: a clearer beat than a raw sine, but never a click.
    const beat = p * p;

    // sub amplitude throbs on the lagged pulse (this IS the heard rhythm)
    const subLevel = (0.1 + 0.22 * beat) * (0.7 + 0.3 * d);
    subGain.gain.setTargetAtTime(subLevel, now, 0.02);

    // mid tone amplitude + cutoff throb together
    const toneLevel = (0.04 + 0.14 * beat) * (0.6 + 0.4 * d);
    toneGain.gain.setTargetAtTime(toneLevel, now, 0.02);
    const cutoff = 260 + 1600 * beat + 500 * d;
    toneLp.frequency.setTargetAtTime(cutoff, now, 0.02);

    // beds follow the depth, not the beat — they swell as you dissociate
    drone.setDrive(0.2 + 0.6 * d);
    shepard.setDrive(0.15 + 0.7 * d);
    shepard.step(dt);

    // let the void open up as the world un-binds
    verb.setWet(0.35 + 0.25 * d);
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    const now = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
    } catch {
      /* ctx may be closing */
    }
    drone.stop();
    shepard.stop();
    const killAt = now + 0.9;
    try {
      sub.stop(killAt);
      tone.stop(killAt);
    } catch {
      /* already stopped */
    }
  };

  return { update, stop };
}
