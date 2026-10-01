/**
 * Ghost ARC LAW gate (Karel 2026-10-01, docs/ghost-journey-spec.md §0).
 * Runs before every build with the rest of src/lib/journeys.
 */
import { describe, it, expect } from "vitest";
import { getJourney, GHOST_ANGEL_MARKER, GHOST_ANGEL_WINGLESS_MARKER } from "./journeys";
import { GHOST_BEAT_STAGES, GHOST_PHASE_ORDER, ghostSlotStages, type GhostArcStage } from "./ghost-arc";
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
  it("phases are the six expected ids, contiguous 0→1, stage 8 from 0.85", () => {
    expect(phases.map((p) => p.id)).toEqual([...GHOST_PHASE_ORDER]);
    expect(phases[0].start).toBe(0);
    expect(phases[phases.length - 1].end).toBe(1);
    for (let i = 1; i < phases.length; i++) expect(phases[i].start).toBe(phases[i - 1].end);
    const ret = phases.find((p) => p.id === "return")!;
    const integ = phases.find((p) => p.id === "integration")!;
    expect(ret.end).toBe(0.85);
    expect(integ.start).toBe(0.85);
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

  it("stage 4 is the pool of infinite floating pure white flowers — possession retired", () => {
    const s4 = beats.filter((b) => b.stage === 4);
    for (const b of s4) {
      expect(b.text, label(b)).toMatch(/infinite floating pure white flowers/i);
      expect(b.text, label(b)).not.toMatch(/\bblack\b|\bjet\b|possess|dark reflection|shadow/i);
    }
  });

  it("stage 5: the light is ABOVE — she rises and emerges", () => {
    for (const b of beats.filter((x) => x.stage === 5)) {
      expect(b.text, label(b)).toMatch(/\b(above|upward|up)\b/i);
      expect(b.text, label(b)).toMatch(/\blight\b/i);
    }
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
    }
  });

  it("Ghost laws hold on every beat: angel marker, pure-white flowers, no frozen/drug words", () => {
    for (const b of beats) {
      expect(b.text.includes(GHOST_ANGEL_MARKER) || b.text.includes(GHOST_ANGEL_WINGLESS_MARKER), label(b)).toBe(true);
      expect(b.text, label(b)).not.toMatch(FROZEN);
      expect(b.text, label(b)).not.toMatch(DRUG);
      expect(b.text, label(b)).not.toMatch(/\bpink\b|blossom/i);
    }
  });

  it("wingless only before the wings are found; winged never before the pool", () => {
    for (const b of beats) {
      if (b.text.includes(GHOST_ANGEL_WINGLESS_MARKER)) expect(b.stage, label(b)).toBeLessThanOrEqual(4);
      if (b.text.includes(GHOST_ANGEL_MARKER)) expect(b.stage, label(b)).toBeGreaterThanOrEqual(4);
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
    expect(slotStages.filter((x) => x === 8).length).toBeGreaterThanOrEqual(6);
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
