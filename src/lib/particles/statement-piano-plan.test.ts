/**
 * The statement card's particle piano (Karel's 1919 upright, burning):
 *  • it BURNS (living fire) while shown, then dissolves and is gone — stopped,
 *    cleared, handed back — before journey 0's pre-start, so the spin-up
 *    (pre-start → +3.5 s: Snowflake's 60–80 ms frames, a ~290 ms stall at other
 *    set starts) lands on the static text alone, never on moving particles;
 *  • the card itself never works the GPU inside pre-start − 0.3 s … + 3.5 s;
 *  • after the release the engine has no image form and no fire: journey 0's
 *    first image is its own (Karel 2026-10-09: "your piano particle emblem up
 *    in snowflake lol").
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { EXPERIENCE_INTRO_MS } from "@/components/audio/installation-machine";
import {
  CARD_MS, PRESTART_MS, CYCLE_FADE_AFTER_PRESTART_MS, TEXT_FADE_MS, WINDOW_START_MS, WINDOW_END_MS,
  STOP_AT_MS, DISSOLVE_AT_MS, DISSOLVE_MS, RELEASE_AT_MS, HOLD_MAX_MS, FORMED_BY_MS, LATEST_START_MS, PIANO_HEIGHT,
  engineWorkAllowed, pianoSchedule, stepAllowed, pianoPlaneScale,
} from "./statement-piano-plan";
import { createPianoCard, type CardEngine } from "./statement-piano-card";
import { critStep, type Crit } from "./image-follow";
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

describe("statement piano — alive, then gone before the spin-up", () => {
  it("the schedule: upload → start (fire wakes) → dissolve → release, all before the window", () => {
    const s = pianoSchedule(0);
    const at = (k: string) => s.find((e) => e.step === k)!.at;
    expect(s.map((e) => e.step)).toEqual(["upload", "start", "dissolve", "release"]);
    expect(at("upload")).toBeLessThan(at("start"));
    expect(at("dissolve")).toBe(DISSOLVE_AT_MS);
    expect(at("dissolve") + DISSOLVE_MS).toBeLessThanOrEqual(STOP_AT_MS); // fully faded before the stop
    expect(at("release")).toBe(RELEASE_AT_MS);
    expect(RELEASE_AT_MS).toBeLessThanOrEqual(WINDOW_START_MS); // gone before journey 0 pre-starts
    // the formed piano burns, alive, for ≥ 5 s on a normal card
    expect(DISSOLVE_AT_MS - FORMED_BY_MS).toBeGreaterThanOrEqual(5_000);
  });
  it("whatever time the image / programs become ready, nothing the card does lands in the window", () => {
    for (let ready = 0; ready <= 16_000; ready += 50) {
      for (const ev of pianoSchedule(ready)) {
        if (ev.step === "release") expect(ev.at).toBeLessThanOrEqual(WINDOW_START_MS); // the release only removes work, at the window's edge
        else expect(engineWorkAllowed(ev.at), `${ev.step} @${ev.at} (ready ${ready})`).toBe(true);
      }
      if (ready > LATEST_START_MS) expect(pianoSchedule(ready).map((e) => e.step)).toEqual(["release"]); // too late: no piano
    }
  });
  it("the runtime guard refuses a late timer's upload / start / dissolve inside the window (release is always allowed)", () => {
    for (let t = 0; t < 16_000; t += 10) {
      const inWin = t >= WINDOW_START_MS && t < WINDOW_END_MS;
      expect(stepAllowed("upload", t)).toBe(!inWin);
      expect(stepAllowed("start", t)).toBe(!inWin);
      expect(stepAllowed("dissolve", t)).toBe(!inWin);
      expect(stepAllowed("release", t)).toBe(true);
    }
  });
  it("the BOOT card (programs warm ~3.85–4.2 s in, measured) still gathers and burns ≥ 1.5 s before dissolving", () => {
    for (let ready = 3_800; ready <= 4_700; ready += 50) {
      const start = pianoSchedule(ready).find((e) => e.step === "start");
      expect(start, `ready ${ready}`).toBeDefined();
      expect(DISSOLVE_AT_MS - (start!.at + 2_000)).toBeGreaterThanOrEqual(1_500);
    }
  });
  it("the hold's safety expiry comes after the release, never inside the card (the 15 s expiry fired at 15.0 s on a 15.9 s release)", () => {
    expect(HOLD_MAX_MS).toBeGreaterThan(RELEASE_AT_MS);
  });
  it("the piano stands ~86 % of the screen's height on the kiosk's screens", () => {
    for (const scr of [16 / 9, 16 / 10, 3 / 2]) {
      const img = 590 / 805; // piano-1919-form.jpg
      expect(pianoPlaneScale(img, scr) * 1.06 * (scr / img)).toBeCloseTo(PIANO_HEIGHT, 3);
    }
  });
});

/** A CPU stand-in for the engine's image-form + fire state (same followers as the engine). */
function fakeEngine() {
  const f: Crit = { x: 0, v: 0 }, sh: Crit = { x: 0, v: 0 };
  let fT = 0, sT = 0, fire = 0, running = false;
  const st = { image: null as string | null, loads: [] as string[] };
  const e: CardEngine & { step(dt: number): void; state(): { form: number; show: number; fire: number; running: boolean; image: string | null }; loads: string[] } = {
    start() { running = true; }, stop() { running = false; },
    setDensity() {}, setImageVariant() {}, setImageTint() {}, setImageScale() {}, setOffset() {}, setInstances() {},
    snapImage(clear = false) { if (clear) { fT = sT = 0; f.x = f.v = sh.x = sh.v = 0; fire = 0; st.image = null; } },
    loadFormImage(src) { st.image = (src as unknown as { id: string }).id; st.loads.push(st.image); },
    setImageForm(a, b) { fT = a; sT = b; },
    imageSampleCount() { return 4; },
    setFire(k: number) { fire = k; },
    step(dt) { if (!running) return; critStep(f, fT, 3, dt); critStep(sh, sT, 2.4, dt); },
    state() { return { form: f.x, show: sh.x, fire, running, image: f.x > 0.001 || sh.x > 0.001 ? st.image : null }; },
    loads: st.loads,
  };
  return e;
}

describe("statement piano — the hand-back to journey 0 is clean", () => {
  afterEach(() => { setStatementHold(false); vi.useRealTimers(); });
  const piano = { id: "piano", width: 590, height: 805 };
  function playCard(readyAt = 0, stopAtMs = CARD_MS) {
    const eng = fakeEngine();
    const style = { opacity: "0.001", transition: "none" };
    let now = 0;
    const holds: boolean[] = [];
    const card = createPianoCard({ engine: eng, style, at: () => now, screenAspect: () => 16 / 9, samples: () => undefined, setHold: (on) => holds.push(on) });
    const sched = card.schedule(readyAt);
    const frames: { t: number; show: number; visible: number }[] = [];
    // the canvas's CSS opacity as the compositor plays it: 1.4 s ease-out in, DISSOLVE_MS ease-in out
    let op = 0, from = 0, to = 0, t0 = 0, dur = 1, easeIn = false, lastTarget = style.opacity;
    for (let t = 0; t <= stopAtMs; t += 1000 / 60) {
      now = t;
      for (const ev of sched) if (ev.at <= t && !(ev as { done?: boolean }).done) { (ev as { done?: boolean }).done = true; card.run(ev.step, piano); }
      if (style.opacity !== lastTarget) {
        lastTarget = style.opacity; from = op; to = Number(style.opacity); t0 = t;
        const m = /opacity (\d+)ms (ease-in|ease-out)/.exec(style.transition);
        dur = m ? Number(m[1]) : 0; easeIn = m?.[2] === "ease-in";
      }
      const u = dur ? Math.min(1, (t - t0) / dur) : 1;
      op = from + (to - from) * (easeIn ? Math.pow(u, 1.7) : 1 - Math.pow(1 - u, 1.7));
      eng.step(1 / 60);
      frames.push({ t, show: eng.state().show, visible: eng.state().show * op });
    }
    return { eng, style, card, holds, frames };
  }
  it("after RELEASE the engine is stopped with no image form and no fire, the canvas invisible, the hold off", () => {
    const { eng, style, card, holds } = playCard();
    expect(card.released).toBe(true);
    const s = eng.state();
    expect(s).toMatchObject({ form: 0, show: 0, fire: 0, running: false, image: null });
    expect(Number(style.opacity)).toBeLessThanOrEqual(0.001);
    expect(holds.at(-1)).toBe(false);
  });
  it("the journey's first image is its own: the piano is never worn once the journey starts", () => {
    const { eng } = playCard();
    // journey 0 (Snowflake) mounts at the pre-start and loads its emblem
    eng.start();
    eng.loadFormImage({ id: "snowflake-emblem" } as unknown as HTMLCanvasElement, 1);
    eng.setImageForm(0.97, 1);
    for (let i = 0; i < 120; i++) { eng.step(1 / 60); expect(eng.state().image).toBe("snowflake-emblem"); }
    expect(eng.loads).toEqual(["piano", "snowflake-emblem"]);
  });
  it("the dissolve is smooth: what is SEEN (image presence × canvas opacity) never steps, and is ~0 at the release", () => {
    const { frames } = playCard();
    for (let i = 1; i < frames.length; i++) expect(Math.abs(frames[i].visible - frames[i - 1].visible), `t=${frames[i].t.toFixed(0)}`).toBeLessThan(0.03);
    expect(frames.find((f) => f.t >= RELEASE_AT_MS - 20)!.visible).toBeLessThan(0.005);
  });
  it("an unmount / operator skip mid-card hands back just as cleanly", () => {
    const { eng, card } = playCard(0, 5_000);
    expect(eng.state().show).toBeGreaterThan(0.9);
    card.release("unmount");
    expect(eng.state()).toMatchObject({ form: 0, show: 0, fire: 0, running: false, image: null });
  });
  it("a forgotten hold expires on its own AND clears the card first", () => {
    vi.useFakeTimers();
    const cleared: string[] = [];
    setStatementHold(true, HOLD_MAX_MS, () => cleared.push("released"));
    vi.advanceTimersByTime(HOLD_MAX_MS - 1);
    expect(statementHoldActive()).toBe(true);
    vi.advanceTimersByTime(2);
    expect(cleared).toEqual(["released"]);
    expect(statementHoldActive()).toBe(false);
  });
  it("the hold is visible to the journey layer and notifies its release", () => {
    const seen: boolean[] = [];
    const off = onStatementHoldChange(() => seen.push(statementHoldActive()));
    setStatementHold(true);
    setStatementHold(false);
    off();
    expect(seen).toEqual([true, false]);
  });
  it("the layer defers its setup while held, stands down while held, and starts clean", () => {
    const src = readFileSync("src/components/audio/particle-lead-layer.tsx", "utf8");
    expect(src).toMatch(/if \(!host \|\| cardHeld\) return;/);
    expect(src).toMatch(/\}, \[cast, journeyId, cardHeld\]\);/);
    expect(src).toMatch(/if \(statementHoldActive\(\)\) \{ lastTick = performance\.now\(\); return; \}/);
    expect(src).toMatch(/if \(carry === 0\) engine\.snapImage\(true, false\);/);
    expect(readFileSync("src/lib/particles/shared-engine.ts", "utf8")).toMatch(/if \(statementHold\) return;/);
  });
});
