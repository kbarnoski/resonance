/**
 * Ghost ARC LAW gate (Karel 2026-10-01, docs/ghost-journey-spec.md §0).
 * Runs before every build with the rest of src/lib/journeys.
 */
import { describe, it, expect } from "vitest";
import { getJourney, GHOST_ANGEL_MARKER, GHOST_ANGEL_WINGLESS_MARKER, composeGhostPrompt, ghostLoraScaleForPhase, getGhostAgeForPhase } from "./journeys";
import { GHOST_BEAT_STAGES, GHOST_FLASH_PROGRESS, GHOST_PHASE_ORDER, ghostSlotStages, type GhostArcStage } from "./ghost-arc";
import { packSlotForProgress, packPhaseSliceForProgress, nextSlotInSlice } from "./pack-image-allocation";

const ghost = getJourney("ghost")!;
const phases = ghost.phases;
const beats: { phase: string; i: number; stage: GhostArcStage; text: string }[] = [];
for (const p of phases) {
  (p.aiPromptSequence ?? []).forEach((text, i) => {
    beats.push({ phase: p.id, i: i + 1, stage: GHOST_BEAT_STAGES[p.id]?.[i], text });
  });
}
const label = (b: (typeof beats)[number]) => `${b.phase} beat ${b.i} (stage ${b.stage})`;

// Stone room / castle / portal content belongs to stage 1 ONLY.
const STONE_ROOM = /\b(castle|medieval|stone|stones|chamber|window|windows|archway|arch|arched|portal|masonry|brick|bricks|forest|woodland)\b/i;
// The ending is pure light amidst the cosmos.
const NOT_IN_ENDING = /\b(trees?|roots?|tunnels?|pools?|caverns?|shaft|earth|lil(y|ies)|castle|stone|chamber|window|archway|portal)\b/i;
const FROZEN = /\b(ice|icy|frost|frosted|frozen|snow|snowy|crystal|crystalline)\b/i;
const DRUG = /\b(psychedelic|dmt|k-hole|ketamine|lsd|trip|tripping|hallucinat\w*|mushrooms?|ayahuasca)\b/i;

describe("Ghost arc law — stage map", () => {
  it("phases are the six expected ids, contiguous 0→1, retimed 2026-10-01 (flight +3% from the ending: stage 8 from 0.91)", () => {
    expect(phases.map((p) => p.id)).toEqual([...GHOST_PHASE_ORDER]);
    expect(phases[0].start).toBe(0);
    expect(phases[phases.length - 1].end).toBe(1);
    for (let i = 1; i < phases.length; i++) expect(phases[i].start).toBe(phases[i - 1].end);
    const ret = phases.find((p) => p.id === "return")!;
    const integ = phases.find((p) => p.id === "integration")!;
    expect(phases.map((p) => [p.start, p.end])).toEqual([
      [0, 0.12], [0.12, 0.3], [0.3, 0.76], [0.76, 0.85], [0.85, 0.91], [0.91, 1],
    ]);
    expect(ret.end).toBe(0.91);
    expect(integ.start).toBe(0.91);
  });

  it("both bass flashes happen UNDERGROUND (stages 2–5), never after emerging", () => {
    for (const fp of GHOST_FLASH_PROGRESS) {
      const ph = phases.find((p) => fp >= p.start! && fp < p.end!)!;
      const stages = GHOST_BEAT_STAGES[ph.id];
      for (const st of stages) expect(st, `flash @${fp} in ${ph.id}`).toBeGreaterThanOrEqual(2);
      for (const st of stages) expect(st, `flash @${fp} in ${ph.id}`).toBeLessThanOrEqual(5);
      // the beat playing at the flash moment (by time fraction) is underground too
      const seq = ph.aiPromptSequence!;
      const k = Math.min(seq.length - 1, Math.floor(((fp - ph.start!) / (ph.end! - ph.start!)) * seq.length));
      expect(stages[k], `beat at flash ${fp}`).toBeGreaterThanOrEqual(2);
      expect(stages[k], `beat at flash ${fp}`).toBeLessThanOrEqual(5);
      expect(seq[k], `beat at flash ${fp}`).toMatch(/deep|beneath the earth|underground|shaft|cavern/i);
      // and the pack still shown at that moment, for every jitter
      for (let j = 0; j <= 5; j++) {
        const st = ghostSlotStages(phases, 90)[packSlotForProgress(phases, 90, fp, j)];
        expect(st, `pack slot at flash ${fp} j=${j}`).toBeGreaterThanOrEqual(2);
        expect(st, `pack slot at flash ${fp} j=${j}`).toBeLessThanOrEqual(5);
      }
    }
  });

  it("every phase's stage list matches its beat count", () => {
    for (const p of phases) {
      expect(GHOST_BEAT_STAGES[p.id]?.length, `${p.id} stage map length`).toBe(p.aiPromptSequence?.length);
    }
  });

  it("stages never run backwards and cover all eight in order", () => {
    const seq = beats.map((b) => b.stage);
    for (let i = 1; i < seq.length; i++) expect(seq[i], label(beats[i])).toBeGreaterThanOrEqual(seq[i - 1]);
    expect([...new Set(seq)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(GHOST_BEAT_STAGES.threshold.every((s) => s === 1)).toBe(true);
    expect(GHOST_BEAT_STAGES.integration.every((s) => s === 8)).toBe(true);
  });
});

describe("Ghost arc law — beat text honors its stage", () => {
  it("no stone room / castle / portal / forest after stage 1", () => {
    for (const b of beats.filter((x) => x.stage >= 2)) expect(b.text, label(b)).not.toMatch(STONE_ROOM);
  });

  it("stage 2 is the ENTRANCE, seen before she is inside", () => {
    const s2 = beats.filter((b) => b.stage === 2);
    expect(s2.length).toBeGreaterThanOrEqual(2);
    for (const b of s2) {
      expect(b.text, label(b)).toMatch(/\b(entrance|threshold)\b/i);
      expect(b.text, label(b)).toMatch(/depths of the earth|into the earth|into the depths/i);
      expect(b.text, label(b)).not.toMatch(/inside the tunnel|deep beneath/i);
    }
    expect(s2[0].text).toMatch(/not yet entered/i);
  });

  it("stage 3 goes deeper beneath the earth", () => {
    for (const b of beats.filter((x) => x.stage === 3)) {
      expect(b.text, label(b)).toMatch(/deep|deeper|depths|beneath the earth/i);
    }
  });

  it("stage 4 is the pool of infinite floating cherry-pink blossoms (same as the tree) — possession retired", () => {
    const s4 = beats.filter((b) => b.stage === 4);
    for (const b of s4) {
      expect(b.text, label(b)).toMatch(/infinite floating saturated cherry-pink blossoms/i);
      expect(b.text, label(b)).not.toMatch(/\bblack\b|\bjet\b|possess|dark reflection|shadow/i);
    }
  });

  it("stage 5: blossoms lead her deeper toward the distant EXIT light ahead, then she looks out", () => {
    for (const b of beats.filter((x) => x.stage === 5)) {
      expect(b.text, label(b)).toMatch(/\b(ahead|exit|mouth|looks out)\b/i);
      expect(b.text, label(b)).toMatch(/\blight\b/i);
    }
    const tunnel = beats.filter((b) => b.stage === 5 && b.phase === "transcendence");
    expect(tunnel.length).toBeGreaterThanOrEqual(4);
    for (const b of tunnel) {
      expect(b.text, label(b)).toMatch(/tunnel exit/i);
      expect(b.text, label(b)).toMatch(/distant/i);
      expect(b.text, label(b)).toMatch(/cherry blossoms|cherry-pink blossoms/i);
      expect(b.text, label(b)).toMatch(/deep beneath the earth|deep underground/i);
    }
    const out = beats.filter((b) => b.stage === 5 && b.phase === "illumination");
    expect(out.some((b) => /mouth of the tunnel/i.test(b.text) && /looks out/i.test(b.text))).toBe(true);
    // the emergence beat sees the tree on its distant planet
    expect(beats.filter((b) => b.stage === 5).some((b) => /tree/.test(b.text) && /planet/.test(b.text))).toBe(true);
  });

  it("stages 6–7: bloom PERCENT grows monotonically during the approach and union, ending at 100", () => {
    const pct = beats
      .filter((b) => b.stage === 6 || b.stage === 7)
      .map((b) => {
        const m = b.text.match(/(\d+) PERCENT/);
        expect(m, `${label(b)} needs a bloom PERCENT`).not.toBeNull();
        return { b, v: Number(m![1]) };
      });
    for (let i = 1; i < pct.length; i++) expect(pct[i].v, label(pct[i].b)).toBeGreaterThanOrEqual(pct[i - 1].v);
    expect(pct[pct.length - 1].v).toBe(100);
    for (const { b, v } of pct) {
      if (b.stage === 6) expect(v, label(b)).toBeLessThanOrEqual(40);
      if (b.stage === 7) expect(v, label(b)).toBeGreaterThanOrEqual(45);
    }
    expect(pct.find((x) => x.b.stage === 6)!.v).toBeLessThanOrEqual(10);
  });

  it("stage 7 is spiritual union — hair spiral, no body-dissolving-into-wood", () => {
    const s7 = beats.filter((b) => b.stage === 7);
    for (const b of s7) expect(b.text, label(b)).not.toMatch(/dissolv|wood-grain|wood grain|into the wood|side .* (merged|dissolved)/i);
    expect(s7.some((b) => /infinite spiral/i.test(b.text))).toBe(true);
    expect(s7.some((b) => /union/i.test(b.text))).toBe(true);
  });

  it("stage 8 is the angel unifying with light amidst the cosmos — nothing earthly", () => {
    for (const b of beats.filter((x) => x.stage === 8)) {
      expect(b.text, label(b)).toMatch(/\blight\b/i);
      expect(b.text, label(b)).toMatch(/\bcosmos\b/i);
      expect(b.text, label(b)).not.toMatch(NOT_IN_ENDING);
      expect(b.text, label(b)).toMatch(/\b(extreme wide|wide)\b/i);
      expect(b.text, label(b)).toMatch(/\b(small|tiny|distant)\b/i);
      expect(b.text, label(b)).not.toMatch(/\bclose|medium shot|mid shot|mid-wide|portrait/i);
      expect(b.text, label(b)).toMatch(/pink particles/i);
      expect(b.text, label(b)).toMatch(/moving away/i);
    }
    const s8 = beats.filter((x) => x.stage === 8);
    expect(s8[s8.length - 1].text, "the final beat is the most distant").toMatch(/most distant/i);
  });

  it("Ghost laws hold on every beat: angel marker, pure-white flowers, no frozen/drug words", () => {
    for (const b of beats) {
      expect(b.text.includes(GHOST_ANGEL_MARKER) || b.text.includes(GHOST_ANGEL_WINGLESS_MARKER), label(b)).toBe(true);
      expect(b.text, label(b)).not.toMatch(FROZEN);
      expect(b.text, label(b)).not.toMatch(DRUG);
      // Every flower is the SAME saturated cherry-pink blossom (Karel 2026-10-01).
      expect(b.text, label(b)).not.toMatch(/white flowers|water lil|\byellow\b/i);
    }
  });

  it("the tree is saturated cherry-pink throughout stages 5–7 — never a white tree, never a moon", () => {
    const treeBeats = beats.filter((b) => b.stage >= 5 && b.stage <= 7 && /\btree\b(?! roots)/i.test(b.text));
    expect(treeBeats.length).toBeGreaterThanOrEqual(6); // round 5b: the two union-mandala beats avoid the word "tree" (it drew orchards)
    for (const b of treeBeats) {
      expect(b.text, label(b)).toMatch(/cherry-pink/i);
      expect(b.text, label(b)).not.toMatch(/pure white flowers|white flowers|perfectly round planet/i);
      if (/planet/i.test(b.text)) expect(b.text, label(b)).toMatch(/planet of black obsidian/i); // round 6b (Karel): obsidian with glowing light veins, never Earth-like
    }
  });

  it("tunnel flowers (stage-2 entrance) are the same cherry-pink blossoms as the tree", () => {
    const s2 = beats.filter((x) => x.stage === 2 && /blossom|flower/i.test(x.text));
    expect(s2.length).toBeGreaterThanOrEqual(1);
    for (const b of s2) expect(b.text, label(b)).toMatch(/saturated cherry-pink blossoms/i);
  });

  it("stages 6–7: the blossoms grow in SPIRALS; at the union they are ENTANGLED in her spiraling hair", () => {
    for (const b of beats.filter((x) => x.stage === 6 || x.stage === 7)) expect(b.text, label(b)).toMatch(/spiral/i);
    const s7 = beats.filter((x) => x.stage === 7);
    expect(s7.some((b) => /entangled/i.test(b.text) && /weaving in and out/i.test(b.text))).toBe(true);
    expect(s7.some((b) => /kaleidoscopic/i.test(b.text) && /visionary/i.test(b.text) && /FILLED/.test(b.text))).toBe(true);
    expect(s7[s7.length - 1].text, "last union beat: light from the top of the tree").toMatch(/light (shining|shines) (down )?from the top of the tree/i);
  });

  it("one consistent ADULT angel with her wings in EVERY beat (round 5) — never wingless, never a child", () => {
    for (const b of beats) {
      expect(b.text, label(b)).toContain(GHOST_ANGEL_MARKER);
      expect(b.text, label(b)).not.toContain(GHOST_ANGEL_WINGLESS_MARKER);
      expect(b.text, label(b)).not.toMatch(/\b(child|children|young|youthful|adolescent|girl|wingless)\b/i);
      expect(b.text, label(b)).not.toMatch(/finds?\b.*\bwings|wings attach/i);
    }
    for (const p of phases) {
      expect(p.aiPrompt ?? "", p.id).not.toContain(GHOST_ANGEL_WINGLESS_MARKER);
      const age = getGhostAgeForPhase(p.id);
      expect(age).toBe(getGhostAgeForPhase("threshold"));
      expect(age).toMatch(/adult/i);
      expect(age).not.toMatch(/\b(child|young|adolescent)\b/i);
    }
  });

  it("identical wings + da Vinci spiral hair are stated up front in EVERY frame's prompt", () => {
    // Integration is the deliberate exception: the distance branch drops the
    // detail lines so she stays a tiny speck (round 5b).
    for (const b of beats.filter((x) => x.phase !== "integration")) {
      const { scene } = composeGhostPrompt(b.text, b.phase, "white");
      expect(scene, label(b)).toMatch(/translucent veils of glowing mist and light unfurling from her shoulder blades like wings/);
      expect(scene, label(b)).toMatch(/Leonardo da Vinci fibonacci spiral curls/);
      expect(scene, label(b)).not.toMatch(/wingless/i);
    }
  });
});

describe("Ghost arc law — pack slots and playback", () => {
  const N = 90;
  const slotStages = ghostSlotStages(phases, N);

  it("harvested slot stages run in arc order with room for every stage", () => {
    expect(slotStages).toHaveLength(N);
    for (let i = 1; i < N; i++) expect(slotStages[i], `slot ${i}`).toBeGreaterThanOrEqual(slotStages[i - 1]);
    for (const s of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      expect(slotStages.filter((x) => x === s).length, `stage ${s} slots`).toBeGreaterThanOrEqual(2);
    }
    // 5 since the flight took 3% from the ending (Karel 2026-10-01)
    expect(slotStages.filter((x) => x === 8).length).toBeGreaterThanOrEqual(5);
  });

  it("playback: for every per-run jitter the shown stage never runs backwards; stage 8 owns the ending", () => {
    const thresholdEnd = phases[0].end!;
    const integStart = phases.find((p) => p.id === "integration")!.start!;
    for (let jitter = 0; jitter <= 5; jitter++) {
      let last = 0;
      for (let p = 0; p <= 0.96; p += 0.0005) {
        const slot = packSlotForProgress(phases, N, p, jitter);
        expect(slot, `p=${p.toFixed(4)} j=${jitter}`).toBeGreaterThanOrEqual(0);
        const st = slotStages[slot];
        expect(st, `p=${p.toFixed(4)} j=${jitter} slot ${slot}`).toBeGreaterThanOrEqual(last);
        if (p >= thresholdEnd + 1e-9) expect(st, `p=${p.toFixed(4)} stone room after threshold`).toBeGreaterThan(1);
        if (p >= integStart + 1e-9) expect(st, `p=${p.toFixed(4)} ending`).toBe(8);
        last = st;
      }
    }
  });

  it("every phase opens on its first slot (stage 2 entrance is always seen)", () => {
    for (let jitter = 0; jitter <= 5; jitter++) {
      const p = phases.find((x) => x.id === "expansion")!.start! + 1e-6;
      expect(slotStages[packSlotForProgress(phases, N, p, jitter)]).toBe(2);
    }
  });

  it("idle-rescue / morph-cover walks stay inside the phase — never wrap to the stone room", () => {
    for (let p = 0.15; p <= 0.96; p += 0.01) {
      const slice = packPhaseSliceForProgress(phases, N, p)!;
      expect(slice).toBeTruthy();
      for (let idx = slice.start; idx < slice.end; idx++) {
        const next = nextSlotInSlice(idx, slice, (i) => i !== idx);
        expect(next).toBeGreaterThanOrEqual(slice.start);
        expect(next).toBeLessThan(slice.end);
        expect(slotStages[next], `walk from ${idx} at p=${p.toFixed(2)}`).toBeGreaterThan(1);
      }
    }
  });
});

describe("Ghost arc law — stage-8 distance pipeline (Karel 2026-10-01, round 4)", () => {
  it("integration prompts are EXTREME LONG SHOT, never the close rear-view framing", () => {
    for (const b of beats.filter((x) => x.phase === "integration")) {
      const { scene, tail } = composeGhostPrompt(b.text, "integration", "white");
      expect(scene, label(b)).toContain("EXTREME LONG SHOT");
      expect(scene, label(b)).toMatch(/tiny speck/);
      expect(scene, label(b)).toMatch(/one tenth of the frame height/);
      expect(scene, label(b)).not.toContain("REAR VIEW ONLY");
      expect(scene, label(b)).not.toMatch(/her arms are healthy/);
      expect(scene, label(b)).not.toMatch(/skin texture/);
      expect(`${scene} ${tail}`, label(b)).not.toMatch(/\bclose|portrait/i);
    }
  });

  it("every other phase keeps the rear-view / healthy-arms framing", () => {
    for (const b of beats.filter((x) => x.phase !== "integration")) {
      const { scene } = composeGhostPrompt(b.text, b.phase, "white");
      expect(scene, label(b)).toContain("REAR VIEW ONLY");
      expect(scene, label(b)).toMatch(/her arms are healthy/);
      expect(scene, label(b)).not.toContain("EXTREME LONG SHOT:");
    }
  });

  it("LoRA scale: 0.25 for the ending, 0.9 everywhere else", () => {
    expect(ghostLoraScaleForPhase("integration")).toBe(0.25);
    for (const id of ["threshold", "expansion", "transcendence", "illumination", "return", null]) {
      expect(ghostLoraScaleForPhase(id)).toBe(0.9);
    }
  });

});
