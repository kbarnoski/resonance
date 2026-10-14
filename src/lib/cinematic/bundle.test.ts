import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  validateBundleLayout, BUNDLE_REQUIRED, slugify, bundleColor, srgbToLinear, stillSchedule, slotPhases, shaderSegments,
} from "./bundle";
import { JOURNEYS } from "@/lib/journeys/journeys";
import { ghostSlotStages } from "@/lib/journeys/ghost-arc";
import { CURVE_COLUMNS } from "./curves";

const PHASES = [
  { id: "threshold", start: 0, end: 0.2 },
  { id: "expansion", start: 0.2, end: 0.45 },
  { id: "transcendence", start: 0.45, end: 0.7 },
  { id: "illumination", start: 0.7, end: 0.85 },
  { id: "return", start: 0.85, end: 0.93 },
  { id: "integration", start: 0.93, end: 1 },
];
const files = (n: number) => Array.from({ length: n }, (_, i) => `gen-${String(i).padStart(3, "0")}.jpg`);

describe("bundle layout", () => {
  const full = [...BUNDLE_REQUIRED, "notes.csv", "audio/yellow-bird.wav", "audio/yellow-bird.m4a", "images/gen-000.jpg", "images/depth/gen-000.png", "images/emblems/yellow-bird.jpg"];
  it("accepts a complete bundle", () => {
    expect(validateBundleLayout(full, { media: true, depth: true })).toEqual([]);
    expect(validateBundleLayout([...BUNDLE_REQUIRED], { media: false })).toEqual([]);
  });
  it("names what is missing", () => {
    expect(validateBundleLayout(full.filter((f) => f !== "curves.csv"), { media: true })).toEqual(["curves.csv"]);
    const noMedia = validateBundleLayout([...BUNDLE_REQUIRED], { media: true, depth: true });
    expect(noMedia.some((m) => m.includes(".wav"))).toBe(true);
    expect(noMedia.some((m) => m.includes("depth"))).toBe(true);
    // a still in a sub-folder is not a top-level still
    expect(validateBundleLayout([...BUNDLE_REQUIRED, "audio/a.wav", "audio/a.m4a", "images/emblems/x.jpg"], { media: true })).toEqual(["images/<still>.jpg|png"]);
  });
  it("slugs names", () => {
    expect(slugify("Yellow Bird")).toBe("yellow-bird");
    expect(slugify("The Other Side 9")).toBe("the-other-side-9");
    expect(slugify("Ébène — Nº 2")).toBe("ebene-no-2");
    expect(slugify("***")).toBe("journey");
  });
});

describe("colour", () => {
  it("decodes sRGB to Unreal linear", () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 9);
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214, 3);
    expect(bundleColor("#ffd94d")?.hex).toBe("#ffd94d");
    expect(bundleColor("#666")?.hex).toBe("#666666");
    expect(bundleColor("#808080")?.linear[0]).toBeCloseTo(0.2159, 3);
    expect(bundleColor("nope")).toBeNull();
  });
});

describe("still schedule", () => {
  const D = 200;
  const f = files(30);
  const sched = stillSchedule({ phases: PHASES, files: f, duration: D, cadence: 10 });
  const owner = slotPhases(PHASES, f.length);

  it("is contiguous, in time order and never repeats a still back to back", () => {
    expect(sched[0].start).toBe(0);
    for (let i = 1; i < sched.length; i++) {
      expect(sched[i].start).toBe(sched[i - 1].end);
      expect(sched[i].slot).not.toBe(sched[i - 1].slot);
    }
    expect(sched[sched.length - 1].end).toBe(D);
  });

  it("keeps the arc: every still belongs to the phase it is shown in, slots only move forward across phases", () => {
    for (const s of sched) expect(owner[s.slot]).toBe(s.phase);
    const order = PHASES.map((p) => p.id);
    for (let i = 1; i < sched.length; i++) expect(order.indexOf(sched[i].phase)).toBeGreaterThanOrEqual(order.indexOf(sched[i - 1].phase));
  });

  it("opens every phase on its first slot", () => {
    for (const p of PHASES) {
      const first = sched.find((s) => s.phase === p.id);
      if (first) expect(first.slot).toBe(owner.indexOf(p.id));
    }
  });

  it("honours a scripted take, the intro pin and the finale pin", () => {
    const s = stillSchedule({ phases: PHASES, files: f, duration: D, script: [[30, "gen-007.jpg"]], introFile: "gen-002.jpg", finaleFile: "gen-029.jpg" });
    expect(s[0]).toMatchObject({ start: 0, file: "gen-002.jpg", reason: "intro" });
    expect(s.find((x) => x.start === 30)).toMatchObject({ file: "gen-007.jpg", reason: "scripted" });
    expect(s[s.length - 1]).toMatchObject({ start: 0.93 * D, end: D, file: "gen-029.jpg", reason: "finale" });
  });

  it("walks Ghost's 90 stills in arc order (the Ghost arc law)", () => {
    const ghost = JOURNEYS.find((j) => j.id === "ghost")!;
    const gf = files(90);
    const stages = ghostSlotStages(ghost.phases, 90);
    const s = stillSchedule({ phases: ghost.phases, files: gf, duration: 219.4, finaleFile: "gen-089.jpg" });
    const seen = s.map((x) => stages[x.slot]);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(seen[0]).toBe(1);
    expect(seen[seen.length - 1]).toBe(8);
  });
});

describe("shader segments", () => {
  it("compacts per-layer runs", () => {
    const seg = shaderSegments([
      { t: 0, primary: "a", dual: null, tertiary: null, opacity: 1 },
      { t: 1, primary: "a", dual: "x", tertiary: null, opacity: 1 },
      { t: 2, primary: "b", dual: "x", tertiary: null, opacity: 1 },
      { t: 3, primary: "b", dual: null, tertiary: null, opacity: 1 },
    ], 4);
    expect(seg).toEqual([
      { layer: "primary", shader: "a", start: 0, end: 2 },
      { layer: "dual", shader: "x", start: 1, end: 3 },
      { layer: "primary", shader: "b", start: 2, end: 4 },
    ]);
  });
});

// ── end to end: the real exporter on the real pack (skipped where there is no pack) ──
const REPO = path.resolve(__dirname, "../../..");
const PACK = [process.env.RESONANCE_PACK, path.join(REPO, "public/tramokyo-pack"), path.resolve(REPO, "../../../public/tramokyo-pack")]
  .find((p): p is string => !!p && existsSync(path.join(p, "data/journeys.json")));

function listFiles(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p, base) : [path.relative(base, p).split(path.sep).join("/")];
  });
}

describe.skipIf(!PACK)("export-unreal-bundle.mjs (real pack, --no-media)", () => {
  it("writes a valid, deterministic Yellow Bird bundle", () => {
    const out = mkdtempSync(path.join(tmpdir(), "unreal-bundle-"));
    try {
      const run = (dir: string) => execFileSync(process.execPath, [path.join(REPO, "scripts/export-unreal-bundle.mjs"), "--journey=Yellow Bird", `--pack=${PACK}`, `--out=${dir}`, "--no-media"], { cwd: REPO, stdio: "pipe" });
      run(path.join(out, "a"));
      run(path.join(out, "b"));
      const a = path.join(out, "a/yellow-bird"), b = path.join(out, "b/yellow-bird");
      const fl = listFiles(a);
      expect(validateBundleLayout(fl, { media: false })).toEqual([]);
      for (const f of ["curves.csv", "curvetable.csv", "events.json", "palette.json", "images/index.json"]) {
        const h = (d: string) => createHash("sha256").update(readFileSync(path.join(d, f))).digest("hex");
        expect(h(b), f).toBe(h(a));
      }
      const header = readFileSync(path.join(a, "curves.csv"), "utf8").split("\n", 1)[0];
      expect(header).toBe("Name," + CURVE_COLUMNS.join(","));
      const ev = JSON.parse(readFileSync(path.join(a, "events.json"), "utf8"));
      expect(ev.journey.name).toBe("Yellow Bird");
      expect(ev.analysis.sections.length).toBeGreaterThan(2);
      expect(ev.shaders.segments.length).toBeGreaterThan(3);
      expect(ev.emblems.flights.map((x: { kind: string }) => x.kind)).toEqual(["opening", "closing"]);
      const idx = JSON.parse(readFileSync(path.join(a, "images/index.json"), "utf8"));
      expect(idx.stills.length).toBeGreaterThan(5);
      expect(idx.stills.every((s: { depth: string | null }) => s.depth?.startsWith("images/depth/"))).toBe(true);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 120_000);
});
