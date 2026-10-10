/**
 * EMBLEM / IMAGE-FORM HAND-OFFS, frame by frame (Karel 2026-10-09: "the
 * grasshopper emblem didnt transition smoothly. it just dropped so better
 * check on all emblem transitions").
 *
 * Steps the layer's image conductor (emblemEnvelope + imageSlotStep, strict
 * mode as non-mastered journeys run it) and the engine's followers (critStep /
 * springTau — the engine calls these very functions) at 60 fps through a whole
 * journey: opening emblem → released to the procedural form, a motif design,
 * the mid emblem with a motif wanted right behind it (image → image), the
 * closing emblem and the track end. Asserts no frame-to-frame jump in image
 * pull, presence, plane scale, placement, mirror, tint — and that a new image
 * (which swaps every mote's colour + target) only ever loads once the last one
 * has cleared.
 */
import { describe, it, expect } from "vitest";
import { critStep, springTau, emblemEnvelope, imageSlotStep, IMAGE_CLEAR, type Crit, type ImageSlot } from "./image-follow";

const FPS = 60, DT = 1 / FPS;

interface Frame { t: number; form: number; show: number; scale: number; off: number; mirror: number; tint: number; worldFade: number; loadLevel?: number }

function run(strict: boolean, D = 300) {
  const imgF: Crit = { x: 0, v: 0 }, imgS: Crit = { x: 0, v: 0 };
  const vel = new Float64Array(8);
  let scale = 1, off = 0, mirror = 1, tint = 0;
  let scaleT = 1, offT = 0, mirrorT = 1, tintT = 0;
  const slot: ImageSlot = { key: null, releasing: false, releaseAt: 0 };
  let loaded: "emblem" | "motif" | null = null;
  const frames: Frame[] = [];
  const loads: { t: number; key: string; level: number }[] = [];
  // a motif design is wanted 40–56 s, and again right behind the mid emblem (D/2+14 … D/2+30)
  const motifAt = (t: number) => (t >= 40 && t < 56 ? 1 : t >= D * 0.5 + 14 && t < D * 0.5 + 30 ? 2 : 0);
  for (let i = 0; i < D * FPS; i++) {
    const t = i * DT, ms = t * 1000;
    const em = emblemEnvelope(t, D);
    const mf = motifAt(t);
    const mfEnv = mf === 1 ? Math.min(1, (t - 40) / 4, (56 - t) / 4) : mf === 2 ? Math.min(1, (t - D * 0.5 - 14) / 4, (D * 0.5 + 30 - t) / 4) : 0;
    const want = em.form > 0.02 || em.show > 0.02 ? `emblem:${em.occ}` : mfEnv > 0.02 ? `motif:${mf}` : null;
    const level = Math.max(imgF.x, imgS.x, Math.abs(imgF.v) * 0.2, Math.abs(imgS.v) * 0.2);
    // the layer syncs the slot from its own state each tick
    slot.key = loaded ? slot.key : null;
    const act = imageSlotStep(slot, want, level, ms, strict);
    if (act === "unload") loaded = null;
    if (act === "load" && want) {
      loaded = want.startsWith("emblem") ? "emblem" : "motif";
      loads.push({ t, key: want, level });
      // per-image treatment set at load (layer): motifs mirrored + tinted, emblems plain
      mirrorT = loaded === "motif" ? -1 : 1;
      tintT = loaded === "motif" ? 1 : 0;
    }
    // targets the layer sets while an image is worn
    let fT = 0, sT = 0;
    if (loaded && !slot.releasing) {
      if (loaded === "emblem") { fT = em.form * 0.97; sT = em.show; scaleT = 0.5 - 0.14 * em.age; }
      else { fT = mfEnv * 0.82; sT = mfEnv; scaleT = 0.72; }
    }
    // the layer's "all envelopes gone" reset
    if (loaded && !slot.releasing && fT < 0.01 && sT < 0.01 && (loaded === "emblem" ? !want?.startsWith("emblem") : !want?.startsWith("motif"))) { loaded = null; slot.key = null; mirrorT = 1; }
    offT = 0; // non-mastered fields are always centred; a pinned emblem is centred too
    // engine followers (same functions, same rates)
    const h = Math.min(DT, 0.05);
    critStep(imgF, fT, 3, h);
    critStep(imgS, sT, 2.4, h);
    scale = springTau(vel, 0, scale, scaleT, 1.5, DT);
    off = springTau(vel, 1, off, offT, 4, DT);
    mirror = springTau(vel, 2, mirror, mirrorT, 0.9, DT);
    tint += (tintT - tint) * (1 - Math.exp(-DT / 0.8));
    frames.push({ t, form: imgF.x, show: imgS.x, scale, off, mirror, tint, worldFade: 1 - 0.85 * imgS.x });
  }
  return { frames, loads };
}

const maxStep = (fr: Frame[], k: keyof Frame) => fr.reduce((m, f, i) => (i ? Math.max(m, Math.abs((f[k] as number) - (fr[i - 1][k] as number))) : m), 0);

describe("image-form hand-offs are continuous (strict conductor, non-mastered journeys)", () => {
  const { frames, loads } = run(true);
  it("emblem → form → motif → mid emblem → motif → closing emblem all happen", () => {
    expect(loads.map((l) => l.key)).toEqual(["emblem:0", "motif:1", "emblem:1", "motif:2", "emblem:2"]);
  });
  it("no frame-to-frame jump in image pull, presence, world fade, plane scale, placement, mirror, tint", () => {
    expect(maxStep(frames, "form")).toBeLessThan(0.03);
    expect(maxStep(frames, "show")).toBeLessThan(0.03);
    expect(maxStep(frames, "worldFade")).toBeLessThan(0.03);
    expect(maxStep(frames, "scale")).toBeLessThan(0.01);
    expect(maxStep(frames, "off")).toBeLessThan(0.005);
    expect(maxStep(frames, "mirror")).toBeLessThan(0.04);
    expect(maxStep(frames, "tint")).toBeLessThan(0.03);
  });
  it("a new image only ever loads once the previous one has CLEARED (its colour + target swap is invisible)", () => {
    for (const l of loads) expect(l.level, `${l.key} @ ${l.t.toFixed(2)} s`).toBeLessThan(IMAGE_CLEAR);
  });
  it("the opening emblem forms by ~4 s and has fully released by ~19 s", () => {
    const at = (t: number) => frames[Math.round(t * FPS)];
    expect(at(5).show).toBeGreaterThan(0.9);
    expect(at(19).show).toBeLessThan(0.02);
  });
  it("the old fixed-1.4 s release (still used by mastered journeys) loaded the next image over a visible one", () => {
    const old = run(false);
    expect(Math.max(...old.loads.map((l) => l.level))).toBeGreaterThan(0.05);
  });
});
