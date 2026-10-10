// ─────────────────────────────────────────────────────────────────────────────
// statement-piano-card.ts — the card's engine choreography, free of React and
// the DOM so the hand-back can be tested (statement-piano.tsx drives it).
//
//   upload  (black)   the prepared photo + its worker-made samples, placement snapped
//   start             gather; the canvas fades in with the text; the FIRE wakes
//   dissolve          the image lets go (motes swirl up as embers) + the canvas fades
//   release           engine stopped, image + fire cleared, canvas invisible, hold off —
//                     journey 0 (mounting at the pre-start, after this) starts clean
// ─────────────────────────────────────────────────────────────────────────────
import type { ParticleEngine } from "./particle-engine";
import {
  pianoSchedule, stepAllowed, pianoPlaneScale, PIANO_OPACITY, PIANO_OFFSET_Y, PIANO_FORM, DISSOLVE_MS,
  FIRE_STRENGTH, FIRE_LINE_V, type PianoStep,
} from "./statement-piano-plan";

export type CardEngine = Pick<ParticleEngine,
  "start" | "stop" | "setDensity" | "setImageVariant" | "setImageTint" | "setImageScale" | "setOffset" | "setInstances"
  | "snapImage" | "loadFormImage" | "setImageForm" | "imageSampleCount" | "setFire">;

export interface PianoImage { width: number; height: number }

export interface CardDeps<I extends PianoImage> {
  engine: CardEngine;
  /** the shared canvas's style (opacity / transition) */
  style: { opacity: string; transition: string };
  /** card time (ms since the card began) */
  at: () => number;
  /** screen aspect (width / height) */
  screenAspect: () => number;
  samples: (img: I, n: number) => Float32Array | undefined;
  setHold: (on: boolean) => void;
  record?: (type: string, detail: string) => void;
}

export interface PianoCard<I extends PianoImage> {
  /** the steps to run and when (card ms), for this readiness time */
  schedule(readyAt: number): { at: number; step: PianoStep }[];
  run(step: PianoStep, img: I | null): void;
  /** stop + clear + hand back now (idempotent) — also the unmount / hold-expiry path */
  release(why?: string): void;
  readonly released: boolean;
}

export function createPianoCard<I extends PianoImage>(d: CardDeps<I>): PianoCard<I> {
  const { engine, style } = d;
  let released = false;
  const release = (why = "release") => {
    if (released) return;
    released = true;
    engine.stop();
    // the piano has already dissolved (or never showed): clear it so the journey
    // that takes the engine next never sees it — no image form, no fire
    engine.setImageForm(0, 0);
    engine.setFire(0);
    engine.snapImage(true);
    style.transition = "none";
    style.opacity = "0.001";
    d.setHold(false);
    d.record?.("piano", `${why} @${Math.round(d.at())}ms`);
  };
  const run = (step: PianoStep, img: I | null) => {
    const t = d.at();
    if (!stepAllowed(step, t)) { d.record?.("piano-skip", `${step} @${Math.round(t)}ms (guard)`); release("guard"); return; }
    if (released) return;
    if (step === "upload" && img) {
      const aspect = img.width / Math.max(1, img.height);
      engine.setDensity(0);
      engine.setImageVariant(false, 0);
      engine.setImageTint(0); // the photograph's own amber, gold and fire
      engine.setImageScale(pianoPlaneScale(aspect, d.screenAspect()));
      engine.setOffset(0, PIANO_OFFSET_Y);
      engine.setInstances(1, 0);
      engine.snapImage(); // invisible: placement lands now, never glides mid-gather
      engine.loadFormImage(img as unknown as HTMLCanvasElement, aspect, d.samples(img, engine.imageSampleCount()), true);
      engine.setImageForm(PIANO_FORM, 1);
      engine.setFire(0, FIRE_LINE_V);
    } else if (step === "start") {
      engine.start();
      engine.setFire(FIRE_STRENGTH, FIRE_LINE_V); // wakes over ~1 s as the piano gathers
      style.transition = "opacity 1400ms ease-out";
      style.opacity = String(PIANO_OPACITY);
      d.record?.("piano", `gather @${Math.round(t)}ms`);
    } else if (step === "dissolve") {
      // the image lets go: pull eases out faster than presence, so the motes
      // swirl up and away as embers while the canvas fades (never a pop)
      engine.setImageForm(0, 0);
      style.transition = `opacity ${DISSOLVE_MS}ms ease-in`;
      style.opacity = "0.001";
      d.record?.("piano", `dissolve @${Math.round(t)}ms`);
    } else if (step === "release") {
      release();
    }
  };
  return {
    schedule: pianoSchedule,
    run,
    release,
    get released() { return released; },
  };
}
