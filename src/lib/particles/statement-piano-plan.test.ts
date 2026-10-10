/**
 * The statement card's particle piano never works the GPU inside the set-start
 * stall window: no engine start, image upload or simulation between
 * pre-start − 0.3 s and pre-start + 3.5 s (the formed piano is a STILL frame
 * there), and the journey behind the card waits for the release.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { EXPERIENCE_INTRO_MS } from "@/components/audio/installation-machine";
import {
  CARD_MS, PRESTART_MS, CYCLE_FADE_AFTER_PRESTART_MS, TEXT_FADE_MS, WINDOW_START_MS, WINDOW_END_MS,
  STOP_AT_MS, FADE_AT_MS, RELEASE_AT_MS, FORMED_BY_MS, LATEST_START_MS, PIANO_HEIGHT,
  engineWorkAllowed, pianoSchedule, stepAllowed, pianoPlaneScale,
} from "./statement-piano-plan";
import { setStatementHold, statementHoldActive, onStatementHoldChange } from "./shared-engine";

describe("statement piano — the clock matches the loop's choreography", () => {
  const loop = readFileSync("src/components/audio/installation-loop-client.tsx", "utf8");
  it("card length, pre-start and text hold are the loop client's own numbers", () => {
    expect(CARD_MS).toBe(EXPERIENCE_INTRO_MS);
    expect(loop).toMatch(/preStartDelay = isGesture \? 0 : Math\.max\(0, expMs - 4_500\)/);
    expect(PRESTART_MS).toBe(EXPERIENCE_INTRO_MS - 4_500);
    expect(loop).toMatch(/const CYCLE_FADE_AFTER_PRESTART_MS = 3_500;/);
    expect(CYCLE_FADE_AFTER_PRESTART_MS).toBe(3_500);
    expect(readFileSync("src/components/audio/installation-intro.tsx", "utf8")).toMatch(/transition: "opacity 1800ms ease-out"/);
    expect(TEXT_FADE_MS).toBe(1_800);
  });
  it("the guarded window is pre-start − 0.3 s … pre-start + 3.5 s", () => {
    expect(WINDOW_START_MS).toBe(PRESTART_MS - 300);
    expect(WINDOW_END_MS).toBe(PRESTART_MS + 3_500);
  });
});

describe("statement piano — no engine work inside the stall window", () => {
  it("the schedule: upload + start before it, stop at its edge, CSS fade at its end, release after the fade", () => {
    const s = pianoSchedule(0);
    const at = (k: string) => s.find((e) => e.step === k)!.at;
    expect(at("upload")).toBeLessThan(at("start"));
    expect(at("start")).toBeLessThan(WINDOW_START_MS);
    expect(at("stop")).toBe(STOP_AT_MS);
    expect(at("stop")).toBeLessThanOrEqual(WINDOW_START_MS);
    expect(at("fade")).toBe(WINDOW_END_MS);
    expect(at("release")).toBeGreaterThanOrEqual(FADE_AT_MS + TEXT_FADE_MS);
    // the piano has formed before the engine stops (a still, not a half-gathered field)
    expect(FORMED_BY_MS).toBeLessThanOrEqual(STOP_AT_MS);
    expect(at("stop") - at("start")).toBeGreaterThanOrEqual(1_800);
  });
  it("whatever time the image / programs become ready, nothing that works the GPU lands in the window", () => {
    for (let ready = 0; ready <= 12_000; ready += 50) {
      for (const ev of pianoSchedule(ready)) {
        if (ev.step === "upload" || ev.step === "start") expect(engineWorkAllowed(ev.at), `${ev.step} @${ev.at} (ready ${ready})`).toBe(true);
        if (ev.step === "release") expect(ev.at).toBeGreaterThanOrEqual(WINDOW_END_MS);
      }
      if (ready > LATEST_START_MS) expect(pianoSchedule(ready).map((e) => e.step)).toEqual(["release"]); // too late to gather: no piano
    }
  });
  it("the runtime guard refuses a late timer's upload / start inside the window (stop is always allowed)", () => {
    for (let t = 0; t < 12_000; t += 10) {
      const inWin = t >= WINDOW_START_MS && t < WINDOW_END_MS;
      expect(stepAllowed("upload", t)).toBe(!inWin);
      expect(stepAllowed("start", t)).toBe(!inWin);
      expect(stepAllowed("release", t)).toBe(!inWin);
      expect(stepAllowed("stop", t)).toBe(true);
    }
  });
  it("release lands after the text has faded and before the journey title is fully up", () => {
    // journey title mounts at CARD_MS + 800 with a 3.8 s fade: the field returns under it
    expect(RELEASE_AT_MS).toBeGreaterThanOrEqual(WINDOW_END_MS + TEXT_FADE_MS);
    expect(RELEASE_AT_MS).toBeLessThan(CARD_MS + 800 + 3_800);
  });
});

describe("statement piano — at load, longer, clearer (Karel 2026-10-09)", () => {
  it("the card is 13 s: pre-start at 8.5 s, text still until 12 s, title at 13.8 s", () => {
    expect(CARD_MS).toBe(13_000);
    expect(PRESTART_MS).toBe(8_500);
    expect(WINDOW_END_MS).toBe(12_000);
    expect(CARD_MS + 800).toBe(13_800); // loop client: mountDelay = expMs + 800
  });
  it("a normal card shows the formed piano ≥ 5 s before it freezes", () => {
    const s = pianoSchedule(0);
    expect(STOP_AT_MS - FORMED_BY_MS).toBeGreaterThanOrEqual(5_000);
    expect(s.find((e) => e.step === "start")!.at).toBe(700);
  });
  it("the BOOT card (programs warm ~3.9–4.5 s in, measured) still gathers, with ≥ 3.5 s to form before the freeze", () => {
    for (let ready = 3_800; ready <= 4_700; ready += 50) {
      const s = pianoSchedule(ready);
      const start = s.find((e) => e.step === "start");
      expect(start, `ready ${ready}`).toBeDefined();
      expect(STOP_AT_MS - start!.at).toBeGreaterThanOrEqual(3_500);
      expect(engineWorkAllowed(start!.at)).toBe(true);
    }
    expect(LATEST_START_MS).toBeGreaterThanOrEqual(5_500);
  });
  it("the piano stands ~86 % of the screen's height on the kiosk's screens", () => {
    for (const scr of [16 / 9, 16 / 10, 3 / 2]) {
      const img = 590 / 805; // piano-1919-form.jpg
      const halfH = pianoPlaneScale(img, scr) * 1.06 * (scr / img);
      expect(halfH).toBeCloseTo(PIANO_HEIGHT, 3);
    }
  });
});

describe("statement piano — the journey behind the card waits", () => {
  afterEach(() => { setStatementHold(false); vi.useRealTimers(); });
  it("the hold is visible to the journey layer and notifies its release", () => {
    const seen: boolean[] = [];
    const off = onStatementHoldChange(() => seen.push(statementHoldActive()));
    setStatementHold(true);
    expect(statementHoldActive()).toBe(true);
    setStatementHold(false);
    off();
    expect(seen).toEqual([true, false]);
  });
  it("a forgotten hold expires on its own (the show never waits on the card)", () => {
    vi.useFakeTimers();
    setStatementHold(true, 15_000);
    vi.advanceTimersByTime(14_999);
    expect(statementHoldActive()).toBe(true);
    vi.advanceTimersByTime(2);
    expect(statementHoldActive()).toBe(false);
  });
  it("the layer defers its engine setup while the card holds it", () => {
    const src = readFileSync("src/components/audio/particle-lead-layer.tsx", "utf8");
    expect(src).toMatch(/if \(!host \|\| cardHeld\) return;/);
    expect(src).toMatch(/\}, \[cast, journeyId, cardHeld\]\);/);
    // an outgoing journey still mounted for its fade stands down (no engine calls, no canvas styling)
    expect(src).toMatch(/if \(statementHoldActive\(\)\) \{ lastTick = performance\.now\(\); return; \}/);
    // …and its unmount cannot pull the canvas away from the card
    expect(readFileSync("src/lib/particles/shared-engine.ts", "utf8")).toMatch(/if \(statementHold\) return;/);
  });
});
