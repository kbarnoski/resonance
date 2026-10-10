// ─────────────────────────────────────────────────────────────────────────────
// statement-piano-card.ts — the card's engine choreography, free of React and
// the DOM so it can be tested (statement-piano.tsx drives it).
//
//   upload  (black)  the prepared photo + its worker-made samples, placement snapped
//   form    (black)  engine runs; motes PLACED on the photograph (no gather), fire wakes
//   reveal           the UI fades the logo + text + piano in together (CSS, one curve)
//   — the UI fades them out together at FADE_OUT_AT (the loop's stage change) —
//   release          engine stopped, image + fire cleared, hold off (all invisible) —
//                    journey 0 (mounting at the pre-start, after this) starts clean
// ─────────────────────────────────────────────────────────────────────────────
import type { ParticleEngine } from "./particle-engine";
import {
  pianoSchedule, stepAllowed, pianoPlaneScale, PIANO_OFFSET_Y, PIANO_FORM, FIRE_STRENGTH, FIRE_LINE_V, PIANO_HEIGHT, PIANO_PAD, type PianoStep,
} from "./statement-piano-plan";

export type CardEngine = Pick<ParticleEngine,
  "start" | "stop" | "setDensity" | "setImageVariant" | "setImageTint" | "setImageScale" | "setOffset" | "setInstances"
  | "snapImage" | "snapToImage" | "loadFormImage" | "setImageForm" | "imageSampleCount" | "setFire">;

export interface PianoImage { width: number; height: number }

export interface CardDeps<I extends PianoImage> {
  engine: CardEngine;
  /** card time (ms since the card began) */
  at: () => number;
  /** screen aspect (width / height) */
  screenAspect: () => number;
  samples: (img: I, n: number) => Float32Array | undefined;
  setHold: (on: boolean) => void;
  /** show the card (logo + text + piano fade in together) */
  reveal: () => void;
  record?: (type: string, detail: string) => void;
}

export interface PianoCard<I extends PianoImage> {
  /** the steps to run and when (card ms), for this readiness time */
  schedule(readyAt: number): { at: number; step: PianoStep }[];
  run(step: PianoStep, img: I | null): void;
  /** stop + clear + hand back now (idempotent) — also the unmount / hold-expiry path */
  release(why?: string): void;
  readonly released: boolean;
  /** the piano was formed (shown with the text) this card */
  readonly formed: boolean;
}

export function createPianoCard<I extends PianoImage>(d: CardDeps<I>): PianoCard<I> {
  const { engine } = d;
  let released = false, formed = false, uploaded = false, revealed = false;
  const release = (why = "release") => {
    if (released) return;
    released = true;
    engine.stop();
    // invisible by now (faded with the text): clear it so the journey that
    // takes the engine next never sees it — no image form, no fire
    engine.setImageForm(0, 0);
    engine.setFire(0);
    engine.snapImage(true);
    if (!revealed) { revealed = true; d.reveal(); } // the text never waits on a failed piano
    d.setHold(false);
    d.record?.("piano", `${why} @${Math.round(d.at())}ms`);
  };
  const run = (step: PianoStep, img: I | null) => {
    const t = d.at();
    if (!stepAllowed(step, t)) { d.record?.("piano-skip", `${step} @${Math.round(t)}ms (guard)`); release("guard"); return; }
    if (step === "reveal") { if (!revealed) { revealed = true; d.reveal(); d.record?.("piano", `${formed ? "reveal" : "text only"} @${Math.round(t)}ms`); } return; }
    if (released) return;
    if (step === "upload" && img) {
      const aspect = img.width / Math.max(1, img.height);
      engine.setDensity(0);
      engine.setImageVariant(false, 0);
      engine.setImageTint(0); // the photograph's own amber, gold and fire
      engine.setImageScale(pianoPlaneScale(aspect, d.screenAspect(), PIANO_HEIGHT * (1 + 2 * PIANO_PAD)));
      engine.setOffset(0, PIANO_OFFSET_Y);
      engine.setInstances(1, 0);
      engine.snapImage(); // placement lands now
      engine.loadFormImage(img as unknown as HTMLCanvasElement, aspect, d.samples(img, engine.imageSampleCount()), true);
      engine.setImageForm(PIANO_FORM, 1);
      engine.setFire(0, FIRE_LINE_V);
      uploaded = true;
    } else if (step === "form" && uploaded) {
      engine.start();
      engine.snapToImage(); // every mote PLACED on its pixel at once — invisible, no gather
      engine.setFire(FIRE_STRENGTH, FIRE_LINE_V);
      formed = true;
      d.record?.("piano", `formed @${Math.round(t)}ms`);
    } else if (step === "release") {
      release();
    }
  };
  return {
    schedule: pianoSchedule,
    run,
    release,
    get released() { return released; },
    get formed() { return formed; },
  };
}
