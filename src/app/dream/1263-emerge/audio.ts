// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the journey's audio bed, slaved to the 5-phase arc.
//
//   Built entirely from the SHARED psychedelic toolkit (not reinvented):
//     • startShepard      — an endless Shepard–Risset ascent whose drive (and so
//                           brightness + glide rate) climbs to the breakthrough.
//     • startDroneBank    — a just-intonation drone whose lowpass opens with the
//                           same intensity, a calm sub at rest → a saturated wall.
//     • createVoidReverb  — a vast code-generated "void" convolution tail; the
//                           wet mix opens as the self-boundary dissolves.
//
//   Signal path:  (shepard + drone) → bus → voidReverb → master(0.35)
//                 → DynamicsCompressor limiter → destination.
//   The music is the carrier: it peaks exactly at the visual dissolution.
// ─────────────────────────────────────────────────────────────────────────────

import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

const MASTER_GAIN = 0.35;

export interface JourneyAudio {
  resume(): Promise<void>;
  /** Feed the arc every frame. intensity → Shepard/drone drive; dissolve →
   *  void reverb + brightness; dt → glissando advance. */
  update(intensity: number, dissolve: number, dt: number): void;
  setMuted(muted: boolean): void;
  close(): void;
}

export function createJourneyAudio(): JourneyAudio {
  const Ctx: typeof AudioContext =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();

  const master = ctx.createGain();
  master.gain.value = MASTER_GAIN;

  // Brick-wall-ish limiter so a swelling wall never clips the user's ears.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  master.connect(limiter);
  limiter.connect(ctx.destination);

  const verb: VoidReverb = createVoidReverb(ctx, { seconds: 5, decay: 2.4, wet: 0.4 });
  verb.output.connect(master);

  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(verb.input);

  const shepard: ShepardEngine = startShepard(ctx, bus, {
    peakGain: 0.4,
    baseRate: 0.01,
    driveRate: 0.18,
  });
  const drone: DroneBank = startDroneBank(ctx, bus, { peakGain: 0.3 });

  let closed = false;
  let muted = false;

  return {
    async resume() {
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          // some browsers require an additional gesture; the loop still runs
        }
      }
    },
    update(intensity, dissolve, dt) {
      if (closed) return;
      const i = Math.min(1, Math.max(0, intensity));
      const d = Math.min(1, Math.max(0, dissolve));
      shepard.setDrive(i);
      shepard.step(dt);
      drone.setDrive(Math.min(1, i * 0.9 + d * 0.2));
      verb.setWet(0.32 + d * 0.55);
    },
    setMuted(m: boolean) {
      if (closed || m === muted) return;
      muted = m;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(m ? 0 : MASTER_GAIN, t, 0.3);
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        shepard.stop();
        drone.stop();
      } catch {
        // already stopping
      }
      // let the fades finish, then release the context.
      window.setTimeout(() => {
        void ctx.close().catch(() => {});
      }, 900);
    },
  };
}
