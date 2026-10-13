/**
 * PHRASE CONDUCTOR — the laws (phrase-conductor.ts), on real tracks' deep
 * analysis: the pack's analyses.json (read-only, from the main checkout — the
 * pack is gitignored, so those cases skip where it is absent) and the baked
 * profiles every kiosk build carries (always run).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import {
  conductPhrases, swellAt, formHoldDue, createPhraseCursor, takePhraseEvent, phraseConductorEnabled, phraseSeconds, emblemWindows,
  PHRASE_CONDUCTOR_DEFAULT, PHRASE_LAWS, PHRASE_LOCKED_JOURNEYS, PHRASE_SESSION_KEY, NEUTRAL_SWELL,
  type PhraseInput, type PhraseTimeline,
} from "./phrase-conductor";
import { PARTICLE_PROFILES } from "@/lib/journeys/particle-profiles.generated";
import { PARTICLE_LEADS } from "@/lib/journeys/particle-lead";
import { replayLoop, loopOrder, shares } from "@/lib/journeys/loop-replay";

const L = PHRASE_LAWS;
const PACK = "/Users/karelbarnoski/my-app/public/tramokyo-pack/data/analyses.json";
const hasPack = existsSync(PACK);

/** Three Rise Above tracks across the ladder: solo piano, a groove, THE PEAK. */
const REAL = {
  "dc8d9705-785a-485e-b91f-a12c85bf7b92": "Testimony 3",
  "aadbf1d3-5db1-4f80-a60d-f6d0c4a6e7b6": "Velvet Tears 1",
  "6ee9f014-8203-437c-b05c-9d8bd0de9d3e": "Chenin 5",
} as const;

type Analysis = { recording_id: string; summary: { generated_at?: string; tempo?: { bpm?: number }; sections?: { name?: string }[]; profile?: { duration: number; sections: { start: number; end: number; trend: string; intensity: number }[]; dynamics: { curve: { t: number; intensity: number }[]; climaxTime?: number } } } | null };
let packCache: Analysis[] | null = null;
function packInput(journeyId: string): PhraseInput {
  packCache ??= JSON.parse(readFileSync(PACK, "utf8")) as Analysis[];
  const rec = PARTICLE_PROFILES[journeyId].recordingId;
  const a = packCache
    .filter((x) => x.recording_id === rec && x.summary?.profile?.sections?.length)
    .sort((x, y) => String(y.summary!.generated_at).localeCompare(String(x.summary!.generated_at)))[0];
  if (!a?.summary?.profile) throw new Error(`no pack analysis for ${journeyId}`);
  const s = a.summary, p = s.profile!;
  return {
    duration: p.duration,
    tempo: { bpm: s.tempo?.bpm ?? 0 },
    sections: p.sections.map((x, i) => ({ start: x.start, end: x.end, trend: x.trend, intensity: x.intensity, name: s.sections?.[i]?.name })),
    curve: p.dynamics.curve.map((c) => [c.t, c.intensity] as [number, number]),
    climaxTime: p.dynamics.climaxTime ?? null,
    phaseBounds: PARTICLE_PROFILES[journeyId].phaseBounds ?? [],
  };
}
const optsFor = (id: string) => ({ journeyId: id, formChanges: PARTICLE_LEADS[id].windows.map((w) => w.start) });

/** Every law, asserted on one timeline. */
function assertLaws(tl: PhraseTimeline, input: PhraseInput, formChanges: readonly number[], name: string) {
  const D = input.duration;
  const forms = tl.events.filter((e) => e.action === "form" || e.action === "refigure");
  const pbs = input.phaseBounds ?? [];
  // forms hold: the conductor's own changes ≥ 14 s apart (≥ the 10 s floor)
  for (let i = 1; i < forms.length; i++) expect(forms[i].t - forms[i - 1].t, `${name} hold @${forms[i].t}`).toBeGreaterThanOrEqual(L.FORM_HOLD_SEC);
  for (const f of forms) {
    // ONE BIG CHANGE: clear of every travel morph (busy ±4 s + 3 s) and a full hold after it
    for (const pb of pbs) expect(f.t <= pb - (L.PHASE_BUSY_SEC + L.BIG_CHANGE_GAP_SEC) || f.t >= pb + L.MIN_FORM_HOLD_SEC, `${name} form ${f.t} vs morph ${pb}`).toBe(true);
    // …and of every conducted window's form
    for (const w of formChanges) expect(f.t <= w - L.BIG_CHANGE_GAP_SEC || f.t >= w + L.MIN_FORM_HOLD_SEC, `${name} form ${f.t} vs window ${w}`).toBe(true);
    // emblems untouchable: none inside the opening (+hold), the 15 s lead-in to the closing / mid emblem
    expect(f.t, `${name} after opening`).toBeGreaterThanOrEqual(L.OPENING_EMBLEM_END + L.MIN_FORM_HOLD_SEC);
    if (D > 40) expect(f.t, `${name} before closing lead-in`).toBeLessThan(D - 17 - L.TIMED_LEAD_SEC);
    if (D > 200) expect(f.t < D * 0.5 - L.TIMED_LEAD_SEC || f.t >= D * 0.5 + 15 + L.MIN_FORM_HOLD_SEC, `${name} mid emblem ${f.t}`).toBe(true);
  }
  // no event of any kind inside an emblem window
  for (const e of tl.events.filter((x) => x.action !== "morph")) for (const [a, b] of emblemWindows(D)) expect(e.t >= a && e.t < b, `${name} ${e.kind}@${e.t} in emblem ${a}-${b}`).toBe(false);
  // NEVER OUT-AND-RIGHT-BACK: swells / thins ≥ BRIDGE_SEC apart, a thin lasts ≥ BRIDGE_SEC
  const marks = tl.events.filter((e) => e.action === "swell" || e.action === "thin");
  for (let i = 1; i < marks.length; i++) expect(marks[i].t - marks[i - 1].t, `${name} bridge @${marks[i].t}`).toBeGreaterThanOrEqual(L.BRIDGE_SEC);
  for (const b of marks.filter((e) => e.action === "thin")) expect((b.rise ?? 0) + 2 + (b.fall ?? 0), `${name} thin span`).toBeGreaterThanOrEqual(L.BRIDGE_SEC);
  // MOTION, NOT BRIGHTNESS + emblem neutrality, sampled every 0.25 s
  for (let t = 0; t <= D; t += 0.25) {
    const s = swellAt(tl, t);
    expect(Object.keys(s).sort()).toEqual(["density", "react", "size"]);
    expect(s.density).toBeGreaterThanOrEqual(0.6); // a thin is never a fade
    expect(s.density).toBeLessThanOrEqual(1.4);
    expect(s.size).toBeGreaterThanOrEqual(0.9);
    expect(s.size).toBeLessThanOrEqual(1.2);
    if (emblemWindows(D).some(([a, b]) => t >= a && t < b)) expect(s, `${name} neutral in emblem @${t}`).toEqual(NEUTRAL_SWELL);
  }
  // smooth: no swell multiplier jumps more than 0.05 in a quarter second
  let prev = swellAt(tl, 0);
  for (let t = 0.25; t <= D; t += 0.25) {
    const s = swellAt(tl, t);
    expect(Math.abs(s.density - prev.density), `${name} density step @${t}`).toBeLessThan(0.05);
    prev = s;
  }
}

describe.skipIf(!hasPack)("phrase conductor — real deep analysis from the pack (3 Rise Above tracks)", () => {
  for (const [id, name] of Object.entries(REAL)) {
    it(`${name}: section starts drive forms or ride a morph, crests swell, every law holds`, () => {
      const input = packInput(id);
      const tl = conductPhrases(input, optsFor(id));
      assertLaws(tl, input, optsFor(id).formChanges, name);
      // the music is heard: the climax swells at full strength, ≥ 1 more crest
      const crests = tl.events.filter((e) => e.kind === "crest");
      expect(crests.length, name).toBeGreaterThanOrEqual(2);
      if (input.climaxTime != null && !emblemWindows(input.duration).some(([a, b]) => input.climaxTime! >= a - 4 && input.climaxTime! < b + 2)) {
        expect(crests.some((c) => c.strength === 1 && Math.abs(c.t - input.climaxTime!) < 6), `${name} climax`).toBe(true);
        expect(swellAt(tl, crests.find((c) => c.strength === 1)!.t).density).toBeGreaterThan(1.3);
      }
      // every section start (after the opening) is accounted for: a form at its
      // exact time, a travel morph carrying it, or a stated reason to hold
      for (const s of input.sections.slice(1)) {
        const driven = tl.events.some((e) => e.kind === "section" && (e.t === s.start || e.action === "morph") && e.label.includes(`"${s.name}"`));
        const held = tl.skipped.some((k) => k.t === s.start);
        expect(driven || held, `${name} section @${s.start}`).toBe(true);
      }
      // forms keep moving: no gap between conducted changes (forms, morphs,
      // windows) longer than ~2.2 phrases outside the emblem windows
      const changes = [...tl.events.filter((e) => e.action === "form" || e.action === "refigure").map((e) => e.t), ...(input.phaseBounds ?? []), ...optsFor(id).formChanges, L.OPENING_EMBLEM_END, input.duration - 17].sort((a, b) => a - b);
      for (let i = 1; i < changes.length; i++) if (changes[i] > 26) expect(changes[i] - changes[i - 1], `${name} gap before ${changes[i]}`).toBeLessThanOrEqual(Math.max(36, tl.phraseSec * 2.4));
    });
  }
  it("the pack analysis and the baked profile give the same timeline (the kiosk conducts what was tested)", () => {
    for (const id of Object.keys(REAL)) {
      const a = conductPhrases(packInput(id), optsFor(id));
      const b = conductPhrases(PARTICLE_PROFILES[id], optsFor(id));
      const strip = (tl: PhraseTimeline) => tl.events.map((e) => [e.t, e.kind, e.action, e.strength]);
      expect(strip(b)).toEqual(strip(a));
    }
  });
});

describe("phrase conductor — every non-locked journey (baked profiles)", () => {
  const ids = Object.keys(PARTICLE_PROFILES).filter((id) => PARTICLE_LEADS[id] && !PARTICLE_LEADS[id].mastered);
  it("covers the catalogue", () => expect(ids.length).toBeGreaterThan(40));
  it("every law holds on every journey", () => {
    for (const id of ids) {
      const p = PARTICLE_PROFILES[id];
      assertLaws(conductPhrases(p, optsFor(id)), p, optsFor(id).formChanges, p.name);
    }
  });
  it("is deterministic", () => {
    for (const id of ids.slice(0, 10)) expect(conductPhrases(PARTICLE_PROFILES[id], optsFor(id))).toEqual(conductPhrases(PARTICLE_PROFILES[id], optsFor(id)));
  });
});

describe("phrase conductor — Snowflake + Ghost are never conducted", () => {
  for (const id of ["first-snow", "ghost"]) {
    it(`${id}: empty timeline, neutral swell`, () => {
      expect(PHRASE_LOCKED_JOURNEYS.has(id)).toBe(true);
      const tl = conductPhrases(PARTICLE_PROFILES[id], optsFor(id));
      expect(tl.events).toEqual([]);
      for (let t = 0; t < PARTICLE_PROFILES[id].duration; t += 1) expect(swellAt(tl, t)).toEqual(NEUTRAL_SWELL);
      expect(swellAt(null, 30)).toEqual(NEUTRAL_SWELL);
    });
  }
});

describe("phrase conductor — flag OFF is the old hold clock, exactly", () => {
  it("defaults off", () => {
    expect(PHRASE_CONDUCTOR_DEFAULT).toBe(false);
    expect(phraseConductorEnabled("")).toBe(false);
    expect(phraseConductorEnabled("?pfx=1")).toBe(false);
  });
  it("?phrase=1 turns it on for the tab (kept across navigations), ?phrase=0 off", () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    expect(phraseConductorEnabled("?phrase=1", store)).toBe(true);
    expect(m.get(PHRASE_SESSION_KEY)).toBe("1");
    expect(phraseConductorEnabled("", store)).toBe(true);
    expect(phraseConductorEnabled("?phrase=0", store)).toBe(false);
    expect(phraseConductorEnabled("", store)).toBe(false);
  });
  it("no cursor ⇒ due exactly when the form has held longer than formDur (10k random cases)", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < 10_000; i++) {
      const since = rnd() * 40_000, formDur = 12_000 + rnd() * 6_000, t = rnd() * 300;
      const r = formHoldDue(null, t, since, formDur);
      expect(r.due).toBe(since > formDur);
      expect(r.event).toBeNull();
    }
  });
  it("the loop replay with the flag off is identical to the replay as it was", () => {
    expect(replayLoop(loopOrder(), 2, undefined, { phrase: false })).toEqual(replayLoop(loopOrder(), 2));
  });
});

describe("phrase conductor — flag ON at run time", () => {
  const id = "6ee9f014-8203-437c-b05c-9d8bd0de9d3e"; // Chenin 5
  const tl = conductPhrases(PARTICLE_PROFILES[id], optsFor(id));
  const forms = tl.events.map((e, i) => ({ e, i })).filter(({ e }) => e.action === "form" || e.action === "refigure");
  it("a form event is due from its time once the form has held ≥ 10 s, taken once", () => {
    const { e, i } = forms[0];
    const c = createPhraseCursor(tl);
    expect(formHoldDue(c, e.t - 0.5, 60_000, 14_000).event).toBeNull(); // not yet
    expect(formHoldDue(c, e.t + 1, 9_000, 14_000).due).toBe(false); // held < 10 s
    const r = formHoldDue(c, e.t + 1, 10_500, 14_000);
    expect(r.due).toBe(true);
    expect(r.index).toBe(i);
    takePhraseEvent(c, r.index);
    expect(formHoldDue(c, e.t + 1.5, 10_600, 14_000).event).toBeNull();
    // missed past its grace: the event lets go, the slow fallback clock remains
    const c2 = createPhraseCursor(tl);
    expect(formHoldDue(c2, e.t + L.EVENT_GRACE_SEC + 0.5, 12_000, 14_000).due).toBe(false);
    expect(formHoldDue(c2, e.t + L.EVENT_GRACE_SEC + 0.5, 14_000 * 2.2 + 1, 14_000).due).toBe(true);
  });
  it("Snowflake + Ghost replay identically with the flag on; other forms stay diverse", () => {
    const on = replayLoop(loopOrder(), 2, undefined, { phrase: true });
    const off = replayLoop(loopOrder(), 2);
    on.forEach((l, k) => { if (l.mastered) expect(l.forms, l.name).toEqual(off[k].forms); });
    for (const [soul, v] of shares(on)) expect(v, soul).toBeLessThanOrEqual(0.07);
  });
});

describe("phrase length", () => {
  it("whole bars near 15 s", () => {
    expect(phraseSeconds(96)).toBe(15); // 6 bars
    expect(phraseSeconds(80)).toBe(12); // 4 bars
    expect(phraseSeconds(61)).toBeCloseTo(15.74, 2); // 4 bars
    expect(phraseSeconds(0)).toBe(15);
    for (let bpm = 40; bpm <= 200; bpm += 3) { const s = phraseSeconds(bpm); expect(s).toBeGreaterThanOrEqual(10); expect(s).toBeLessThanOrEqual(22); }
  });
});
