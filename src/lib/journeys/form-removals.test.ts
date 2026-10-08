/**
 * Form review removals (Karel 2026-10-08). Proves:
 *  1. with an EMPTY removal list every cast is untouched (same objects — and
 *     the committed list is what PARTICLE_LEADS uses; mastered-lock.test.ts
 *     fingerprints the mastered casts against docs/mastered-lock.json);
 *  2. with a soul removed, NO cast references it anywhere (souls, windows,
 *     breaks, morph souls, form cycle, per-phase forms), lists never go empty,
 *     replacements stay inside the allowed shape language.
 */
import { describe, it, expect } from "vitest";
import { buildParticleLeads, PARTICLE_LEADS, JOURNEY_SIGNATURES } from "./particle-lead";
import { applySoulRemovals, castSoulsOf, EMPTY_REMOVALS, FORM_REMOVALS, momentsWithout, normalizeRemovals, replacementCandidates } from "./form-removals";
import { BANNED_SOULS } from "./particle-motifs";
import { SHAPE_SOULS, SOULS, type SoulId } from "@/lib/particles/souls";

const usedSouls = () => [...new Set(Object.values(PARTICLE_LEADS).flatMap((c) => castSoulsOf(c)))];

describe("form removals — empty list changes nothing", () => {
  it("applySoulRemovals with no removals returns every cast unchanged (same object)", () => {
    for (const [id, c] of Object.entries(PARTICLE_LEADS)) expect(applySoulRemovals(c, [], id)).toBe(c);
  });

  it("an empty removal list builds byte-identical casts", () => {
    const fresh = buildParticleLeads(EMPTY_REMOVALS);
    // while the committed list is empty, the live registry IS today's casts
    if (!FORM_REMOVALS.souls.length && !FORM_REMOVALS.moments.length) expect(JSON.stringify(fresh)).toBe(JSON.stringify(PARTICLE_LEADS));
    // and the moment images are untouched
    expect(fresh["ghost"].signatureMoments).toBe(JOURNEY_SIGNATURES["ghost"].moments);
  });

  it("a removal that no cast uses leaves casts unchanged", () => {
    const unused = SOULS.map((s) => s.id).find((s) => !usedSouls().includes(s));
    expect(unused).toBeTruthy();
    const out = buildParticleLeads({ ...EMPTY_REMOVALS, souls: [unused!] });
    expect(JSON.stringify(out)).toBe(JSON.stringify(buildParticleLeads(EMPTY_REMOVALS)));
  });

  it("normalizes a malformed removals file to empty lists", () => {
    expect(normalizeRemovals(null)).toEqual(EMPTY_REMOVALS);
    expect(normalizeRemovals({ souls: ["wisp", 3] })).toEqual({ ...EMPTY_REMOVALS, souls: ["wisp"] });
  });
});

describe("form removals — a removed soul is never cast", () => {
  const check = (removed: SoulId[]) => {
    const leads = buildParticleLeads({ ...EMPTY_REMOVALS, souls: removed });
    for (const c of Object.values(leads)) {
      const all = castSoulsOf(c);
      for (const r of removed) expect(all, `${c.name} still casts ${r}`).not.toContain(r);
      expect(c.formCycle.length, c.name).toBeGreaterThan(0);
      expect(c.morphSouls.length, c.name).toBeGreaterThan(0);
      for (const s of [...Object.values(c.souls), ...c.morphSouls, ...c.formCycle]) {
        expect(SHAPE_SOULS, `${c.name}:${s}`).toContain(s);
        expect(BANNED_SOULS, `${c.name}:${s}`).not.toContain(s);
      }
      // a phase that had forms keeps forms
      const before = PARTICLE_LEADS[Object.keys(leads).find((k) => leads[k] === c)!];
      c.phaseChars?.forEach((p, i) => { if (before.phaseChars?.[i]?.forms.length) expect(p.forms.length, `${c.name} phase ${i}`).toBeGreaterThan(0); });
    }
    return leads;
  };

  it("every soul the casts use, removed one at a time", () => {
    for (const s of usedSouls()) check([s]);
  });

  it("several removed at once", () => {
    check(["blossom", "mandala", "vortex"]);
    check(["ribbons", "murmuration", "girih", "medallion", "kaleido"]);
  });

  it("prefers a replacement from the same family", () => {
    const fam = (id: SoulId) => SOULS.find((x) => x.id === id)!.traits.family;
    expect(fam(replacementCandidates("mandala", new Set(["mandala"]), "x")[0])).toBe("geometric");
    expect(fam(replacementCandidates("blossom", new Set(["blossom"]), "x")[0])).toBe("organic");
  });

  it("removing a soul only touches casts that used it", () => {
    const leads = check(["caustic"]);
    for (const [id, c] of Object.entries(PARTICLE_LEADS)) {
      if (!castSoulsOf(c).includes("caustic")) expect(JSON.stringify(leads[id]), id).toBe(JSON.stringify(c));
    }
  });
});

describe("form removals — moments", () => {
  it("drops removed moment images, and a moment with none left", () => {
    const m = JOURNEY_SIGNATURES["ghost"].moments!;
    const [a, b] = m[0].images;
    expect(momentsWithout(m, [])).toBe(m);
    expect(momentsWithout(m, [a])![0].images).toEqual([b]);
    expect(momentsWithout(m, [a, b])).toEqual([]);
    expect(buildParticleLeads({ ...EMPTY_REMOVALS, moments: [a] })["ghost"].signatureMoments![0].images).toEqual([b]);
  });
});
