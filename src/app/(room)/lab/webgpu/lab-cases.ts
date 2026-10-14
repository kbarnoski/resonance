/**
 * Lab cases for /lab/webgpu?case=… — each drives the engine ONLY through the
 * ParticleEngine surface (exactly the calls particle-lead-layer.tsx makes), so
 * the same case runs on WebGPU (default) and on the show's WebGL engine
 * (?gpu=webgl2) for a side-by-side film. The mastered-journey cases reproduce
 * Snowflake's and Ghost's scripted particle moments (parity.ts MASTERED_PARITY):
 * Karel: "i do want the new particle engine and all that in snowflake and
 * ghost" — they must look the same or better before the engine drives them.
 *
 * Stills come from the offline pack (/tramokyo-pack/emblems, kiosk only) and
 * the drawn angel ("@angel"). Importance sampling runs on the main thread here
 * (the show samples in its decode worker) — before each gather, never inside
 * a measured hold.
 */
import type { ParticleEngine } from "@/lib/particles/particle-engine";
import type { SoulId } from "@/lib/particles/souls";
import type { LabCaseId } from "@/lib/particles/webgpu/parity";
import { formCanvas, uvFor } from "@/app/review/forms/form-images";
import { pairOrder, PAIR_GROUPS } from "@/lib/particles/spatial-pairing";
import { COLLIDE_LAWS, blurDepthField, coverRect } from "@/lib/particles/webgpu/depth-collide";

export interface CaseCtx {
  alive: () => boolean;
  say: (s: string) => void;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function image(e: ParticleEngine, src: string, ctx: CaseCtx) {
  const img = await formCanvas(src, 512);
  if (!img) { ctx.say(`could not load ${src} (pack stills exist on the kiosk only)`); return null; }
  const uv = uvFor(img, e.imageSampleCount());
  // spatial pairing, as the journey layer does (each mote arrives where it is)
  const pair = uv ? pairOrder(uv, PAIR_GROUPS) : undefined;
  return { img, uv, pair, aspect: img.width / Math.max(1, img.height) };
}

/** gather an image form (glide), hold, release */
async function emblem(e: ParticleEngine, src: string, ctx: CaseCtx, holdMs: number, opts: { literal?: number; scale?: number } = {}) {
  const im = await image(e, src, ctx);
  if (!im || !ctx.alive()) return;
  ctx.say(`gather ${src}`);
  e.loadFormImage(im.img, im.aspect, im.uv, true, im.pair);
  const lit = opts.literal ?? 0.97;
  e.setImageLiteral(lit);
  e.setImageScale(opts.scale ?? 0.55);
  e.setImageForm(lit, 1);
  await wait(holdMs);
  if (!ctx.alive()) return;
  ctx.say(`release ${src}`);
  e.setImageForm(0, 0);
}

export const CASE_NOTES: Record<LabCaseId, string> = {
  forms: "procedural forms (WebGPU) / comparable souls (WebGL)",
  "snowflake-emblems": "Snowflake: emblem variants 1-7, calm pace, gather / hold / release",
  "snowflake-calm": "Snowflake: calm holds (~28 s), slow breath, gentle dolly",
  "ghost-opening": "Ghost: emblem → slow blob rising in place, fine motes, then beside the imagery",
  "ghost-angel": "Ghost: the angel flash (flash pace) and its outline treatment",
  "ghost-blossom-wings": "Ghost: blossom → wings hover hand-off",
  "fluid-smoke": "phase C: smoke / ink souls in the fluid (add &fluid=1; compare without)",
  "depth-snowflake": "phase D: murmuration colliding with a Snowflake still's depth (add &collide=1)",
};

/** A pack still's depth map → the blurred 96-px R8 field the collisions sample. */
async function depthField(stillUrl: string): Promise<{ px: Uint8Array; w: number; h: number; aspect: number } | null> {
  const url = stillUrl.replace("/images/journeys/", "/depth/journeys/").replace(/\.jpg$/, ".png");
  const img = new Image();
  img.src = url;
  try { await img.decode(); } catch { return null; }
  const w = COLLIDE_LAWS.SAMPLE_W, h = Math.max(1, Math.round((w * img.naturalHeight) / Math.max(1, img.naturalWidth)));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const r = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) r[i] = d[i * 4];
  const b = blurDepthField(r, w, h, COLLIDE_LAWS.BLUR_PASSES);
  return { px: Uint8Array.from(b, (x) => Math.max(0, Math.min(255, Math.round(x)))), w, h, aspect: img.naturalWidth / Math.max(1, img.naturalHeight) };
}

export async function runCase(id: LabCaseId, e: ParticleEngine, ctx: CaseCtx): Promise<void> {
  const soul = (s: SoulId, sec = 4) => e.setSoul(s, sec);
  switch (id) {
    case "snowflake-emblems": {
      soul("murmuration", 1);
      e.setImagePace(0.6); // calm journeys gather unhurried
      for (let k = 0; ctx.alive(); k++) {
        await emblem(e, `/tramokyo-pack/emblems/snowflake-${(k % 7) + 1}.jpg`, ctx, 10_000);
        await wait(7000);
      }
      return;
    }
    case "snowflake-calm": {
      e.setImagePace(0.6);
      const souls: SoulId[] = ["murmuration", "rings", "threads"];
      for (let k = 0; ctx.alive(); k++) {
        ctx.say(`hold ${souls[k % souls.length]} (28 s)`);
        soul(souls[k % souls.length], 6);
        for (let t = 0; t < 28 && ctx.alive(); t += 2) {
          // slow breath + gentle dolly (phrase-long, never on the beat)
          const ph = (k * 28 + t) / 14;
          e.setBreath({ amount: 0.5, breath: Math.sin(ph * Math.PI), settle: 0.2 });
          e.setCamScale(1 + 0.08 * Math.sin(ph * 0.5));
          await wait(2000);
        }
      }
      return;
    }
    case "ghost-opening": {
      e.setImagePace(0.6);
      for (; ctx.alive();) {
        soul("spirit", 1);
        e.setSizeScale(0.85);
        e.setOffset(0, 0);
        e.setDensity(1);
        e.setCamScale(1);
        await emblem(e, "@angel", ctx, 6000, { scale: 0.6 });
        ctx.say("slow blob rising in place");
        await wait(14_000);
        if (!ctx.alive()) return;
        ctx.say("later phases: beside the imagery, sparser, further");
        e.setOffset(-0.35, 0.05);
        e.setDensity(0.6);
        e.setCamScale(1.3);
        await wait(12_000);
      }
      return;
    }
    case "ghost-angel": {
      soul("spirit", 1);
      e.setImagePace(0.6);
      for (let k = 0; ctx.alive(); k++) {
        const src = k % 2 ? "@angel-outline" : "@angel";
        const im = await image(e, src, ctx);
        if (!im || !ctx.alive()) return;
        ctx.say(`flash approach ${src}`);
        // the flash meets the angel on the beat: no glide (flash pace)
        e.loadFormImage(im.img, im.aspect, im.uv, false, im.pair);
        e.setImageLiteral(1);
        e.setImageScale(0.62);
        for (let a = 1; a <= 10 && ctx.alive(); a++) { e.setImageForm(a / 10, a / 10); await wait(150); }
        ctx.say(`wear ${src}`);
        await wait(3000);
        ctx.say("dissipate");
        e.setImageForm(0, 0);
        e.impulse("scatter", 0.35);
        await wait(9000);
      }
      return;
    }
    case "ghost-blossom-wings": {
      soul("spirit", 1);
      e.setImagePace(0.6);
      for (let k = 0; ctx.alive(); k++) {
        const bl = await image(e, `/tramokyo-pack/emblems/ghost-blossoms-${(k % 2) + 1}.jpg`, ctx);
        if (!bl || !ctx.alive()) return;
        ctx.say("blossom");
        e.loadFormImage(bl.img, bl.aspect, bl.uv, true, bl.pair);
        e.setImageLiteral(0.97);
        e.setImageScale(0.55);
        e.setImageForm(0.97, 1);
        await wait(8000);
        if (!ctx.alive()) return;
        // the hover hand-off: the pull is held off while the blossom lets go,
        // so the motes stay put, then the wings gather from where they are
        ctx.say("hover hand-off");
        e.setHover(1);
        e.setImageForm(0, 0);
        await wait(1500);
        const wings = await image(e, `/tramokyo-pack/emblems/ghost-wings-${(k % 2) + 1}.jpg`, ctx);
        if (!wings || !ctx.alive()) return;
        e.loadFormImage(wings.img, wings.aspect, wings.uv, true, wings.pair);
        e.setHover(0);
        e.setImageForm(0.97, 1);
        ctx.say("wings");
        await wait(9000);
        e.setImageForm(0, 0);
        await wait(6000);
      }
      return;
    }
    case "fluid-smoke": {
      const souls: SoulId[] = ["smoke", "ink", "wisp"];
      for (let k = 0; ctx.alive(); k++) {
        ctx.say(`${souls[k % souls.length]} (fluid ${"fluidState" in e ? JSON.stringify((e as unknown as { fluidState(): unknown }).fluidState()) : "n/a"})`);
        soul(souls[k % souls.length], 6);
        await wait(20_000);
      }
      return;
    }
    case "depth-snowflake": {
      soul("murmuration", 1);
      const stills = ["gen-103", "gen-108"];
      const de = e as unknown as { setDepthField?(slot: 0 | 1, f: Uint8Array | null, w: number, h: number, r: [number, number, number, number], weight: number): boolean };
      if (!de.setDepthField) { ctx.say("this engine has no depth collisions (WebGPU parity engine + &collide=1)"); return; }
      for (let k = 0; ctx.alive(); k++) {
        const slot = (k % 2) as 0 | 1;
        const f = await depthField(`/tramokyo-pack/images/journeys/first-snow/${stills[k % stills.length]}.jpg`);
        if (!f || !ctx.alive()) { ctx.say("no depth map (pack stills exist on the kiosk only)"); return; }
        const rect = coverRect(f.aspect, innerWidth / Math.max(1, innerHeight));
        // crossfade like the pictures: the other slot fades out, this one in
        de.setDepthField((1 - slot) as 0 | 1, null, 0, 0, rect, 0);
        await wait(1200);
        de.setDepthField(slot, f.px, f.w, f.h, rect, 1);
        ctx.say(`depth ${stills[k % stills.length]} (slot ${slot})`);
        await wait(20_000);
      }
      return;
    }
    case "forms":
    default:
      return; // the page's own form cycle
  }
}
