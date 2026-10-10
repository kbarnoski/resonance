/**
 * The statement card (Karel 2026-10-09: "the piano in title screen should fade
 * out as the text does. it should also appear in the beginning with the
 * resonance logo and text fading in. so nice smooth transitions and no weird
 * movements"):
 *  • logo + text + piano fade in together and out together — the same curve,
 *    the same frame; the piano is already formed when it appears (no gather),
 *    and the fire is the only motion while it shows;
 *  • everything is gone before journey 0's pre-start: the spin-up lands on
 *    black; the title arrives after it; the music starts when it always did;
 *  • the card never works the GPU inside the spin-up window;
 *  • after the release the engine has no image form and no fire — journey 0's
 *    first image is its own ("your piano particle emblem up in snowflake lol").
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { EXPERIENCE_INTRO_MS } from "@/components/audio/installation-machine";
import {
  CARD_MS, PRESTART_MS, SPINUP_MS, TITLE_AFTER_PRESTART_MS, TEXT_OUT_BEFORE_PRESTART_MS, REVEAL_AT_MS, REVEAL_MS, TEXT_FADE_MS,
  STOP_AT_MS, FADE_OUT_AT_MS, RELEASE_AT_MS, HOLD_MAX_MS, LATEST_REVEAL_MS, WINDOW_START_MS, WINDOW_END_MS, PIANO_OPACITY, PIANO_HEIGHT,
  engineWorkAllowed, pianoSchedule, textOnlySchedule, stepAllowed, pianoPlaneScale, cardLayer,
} from "./statement-piano-plan";
import { createPianoCard, type CardEngine } from "./statement-piano-card";
import { critStep, type Crit } from "./image-follow";
import { setStatementHold, statementHoldActive, onStatementHoldChange } from "./shared-engine";

const loop = readFileSync("src/components/audio/installation-loop-client.tsx", "utf8");
const intro = readFileSync("src/components/audio/installation-intro.tsx", "utf8");

describe("statement card — the loop's choreography", () => {
  it("card length and pre-start (= when the music starts) are unchanged", () => {
    expect(CARD_MS).toBe(EXPERIENCE_INTRO_MS);
    expect(loop).toMatch(/preStartDelay = isGesture \? 0 : Math\.max\(0, expMs - 4_500\)/);
    expect(PRESTART_MS).toBe(EXPERIENCE_INTRO_MS - 4_500);
  });
  it("the text fade-out ends 0.3 s before the pre-start; the title mounts after the spin-up", () => {
    expect(loop).toMatch(/setIntroStage\("fading-cycle"\), Math\.max\(0, preStartDelay - TEXT_OUT_BEFORE_PRESTART_MS\)\)/);
    expect(loop).toMatch(/const mountDelay = isGesture \? 2000 : preStartDelay \+ TITLE_AFTER_PRESTART_MS;/);
    expect(FADE_OUT_AT_MS + TEXT_FADE_MS).toBe(PRESTART_MS - 300);
    expect(PRESTART_MS - TEXT_OUT_BEFORE_PRESTART_MS).toBe(FADE_OUT_AT_MS);
    expect(TITLE_AFTER_PRESTART_MS).toBeGreaterThanOrEqual(SPINUP_MS);
  });
  it("the text and the piano (and its halo) share ONE layer function", () => {
    expect(intro).toMatch(/opacity: card \? \(card\.shown \? 1 : 0\) : expOpacity,/);
    expect(intro).toMatch(/transition: card \? card\.transition : "opacity 1800ms ease-out",/);
    const piano = readFileSync("src/components/audio/statement-piano.tsx", "utf8");
    expect(piano).toMatch(/const layer = cardLayer\(stage, revealed\);/);
    expect(piano).toMatch(/opacity: layer\.shown \? PIANO_OPACITY : 0, transition: layer\.transition/);
  });
  it("in: 1.4 s ease-out when revealed; out: 1.8 s ease-out on the stage change", () => {
    expect(cardLayer("experience", false)).toEqual({ shown: false, transition: `opacity ${TEXT_FADE_MS}ms ease-out` });
    expect(cardLayer("experience", true)).toEqual({ shown: true, transition: `opacity ${REVEAL_MS}ms ease-out` });
    expect(cardLayer("fading-cycle", true)).toEqual({ shown: false, transition: `opacity ${TEXT_FADE_MS}ms ease-out` });
  });
});

/** A CPU stand-in for the engine's image-form + fire state (same followers as the engine). */
function fakeEngine() {
  const f: Crit = { x: 0, v: 0 }, sh: Crit = { x: 0, v: 0 };
  let fT = 0, sT = 0, fire = 0, running = false, snaps = 0;
  const st = { image: null as string | null, loads: [] as string[] };
  const e: CardEngine & { step(dt: number): void; state(): { form: number; show: number; fire: number; running: boolean; image: string | null; snaps: number }; loads: string[] } = {
    start() { running = true; }, stop() { running = false; },
    setDensity() {}, setImageVariant() {}, setImageTint() {}, setImageScale() {}, setOffset() {}, setInstances() {},
    snapImage(clear = false) { if (clear) { fT = sT = 0; f.x = f.v = sh.x = sh.v = 0; fire = 0; st.image = null; } },
    snapToImage() { f.x = fT; sh.x = sT; f.v = sh.v = 0; snaps++; },
    loadFormImage(src) { st.image = (src as unknown as { id: string }).id; st.loads.push(st.image); },
    setImageForm(a, b) { fT = a; sT = b; },
    imageSampleCount() { return 4; },
    setFire(k: number) { fire = k; },
    step(dt) { if (!running) return; critStep(f, fT, 3, dt); critStep(sh, sT, 2.4, dt); },
    state() { return { form: f.x, show: sh.x, fire, running, snaps, image: f.x > 0.001 || sh.x > 0.001 ? st.image : null }; },
    loads: st.loads,
  };
  return e;
}

/** CSS opacity as the compositor plays a transition (ease-out ≈ 1-(1-u)^1.7). */
function cssTrack() {
  let op = 0, from = 0, to = 0, t0 = 0, dur = 0, key = "";
  return (t: number, target: number, transition: string) => {
    const k = `${target}|${transition}`;
    if (k !== key) { key = k; from = op; to = target; t0 = t; dur = Number(/opacity (\d+)ms/.exec(transition)?.[1] ?? 0); }
    const u = dur ? Math.min(1, (t - t0) / dur) : 1;
    op = from + (to - from) * (1 - Math.pow(1 - u, 1.7));
    return op;
  };
}

const piano = { id: "piano", width: 590, height: 805 };
/** Play one card at 60 fps: the loop's stage clock, the card driver, both CSS layers. */
function playCard(readyAt = 0, endMs = PRESTART_MS + TITLE_AFTER_PRESTART_MS) {
  const eng = fakeEngine();
  let now = 0, revealed = false;
  const holds: boolean[] = [];
  const card = createPianoCard({ engine: eng, at: () => now, screenAspect: () => 16 / 9, samples: () => undefined, setHold: (on) => holds.push(on), reveal: () => { revealed = true; } });
  const sched = readyAt === Infinity ? textOnlySchedule(LATEST_REVEAL_MS) : card.schedule(readyAt);
  const done = new Set<number>();
  const text = cssTrack(), pianoCss = cssTrack();
  const frames: { t: number; text: number; piano: number; show: number; form: number; running: boolean }[] = [];
  for (let t = 0; t <= endMs; t += 1000 / 60) {
    now = t;
    sched.forEach((ev, i) => { if (ev.at <= t && !done.has(i)) { done.add(i); card.run(ev.step, piano); } });
    const stage = t >= FADE_OUT_AT_MS ? "fading-cycle" : "experience";
    const L = cardLayer(stage, revealed);
    const tx = text(t, L.shown ? 1 : 0, L.transition);
    const pc = pianoCss(t, L.shown ? PIANO_OPACITY : 0, L.transition);
    eng.step(1 / 60);
    const s = eng.state();
    frames.push({ t, text: tx, piano: pc * s.show, show: s.show, form: s.form, running: s.running });
  }
  return { eng, card, holds, frames };
}

describe("statement card — fades in and out WITH the text, no weird movements", () => {
  it("the piano's visible curve IS the text's (× its opacity) on every frame, in and out", () => {
    const { frames } = playCard(0);
    for (const f of frames) expect(f.piano, `t=${f.t.toFixed(0)}`).toBeCloseTo(f.text * PIANO_OPACITY, 6);
    expect(frames.find((f) => f.t >= REVEAL_AT_MS + REVEAL_MS + 50)!.text).toBeGreaterThan(0.99);
  });
  it("no gather: whenever anything of the piano is visible it is fully formed (the fire is its only motion)", () => {
    const { frames, eng } = playCard(0);
    expect(eng.state().snaps).toBe(1);
    for (const f of frames) if (f.piano > 0.0005) { expect(f.show, `t=${f.t.toFixed(0)}`).toBe(1); expect(f.form).toBe(1); }
  });
  it("nothing visible during the spin-up: from 0.3 s before the pre-start to the title, the card is black and the engine stopped", () => {
    const { frames } = playCard(0);
    for (const f of frames.filter((x) => x.t >= STOP_AT_MS && x.t <= PRESTART_MS + TITLE_AFTER_PRESTART_MS)) {
      expect(f.text, `t=${f.t.toFixed(0)}`).toBeLessThan(0.005);
      expect(f.piano).toBeLessThan(0.005);
      expect(f.running).toBe(false);
    }
  });
  it("the BOOT card: the logo, text and piano wait for the warm-up and appear together", () => {
    for (const ready of [3_850, 4_200, 4_600]) {
      const { frames } = playCard(ready);
      const first = frames.find((f) => f.text > 0.001)!;
      expect(first.t).toBeGreaterThan(ready);
      expect(first.t).toBeLessThan(ready + 600);
      for (const f of frames) expect(f.piano).toBeCloseTo(f.text * PIANO_OPACITY, 6);
    }
  });
  it("a piano never ready: the text appears alone by the latest reveal, and nothing else changes", () => {
    const { frames } = playCard(Infinity);
    const first = frames.find((f) => f.text > 0.001)!;
    expect(first.t).toBeLessThanOrEqual(LATEST_REVEAL_MS + 20);
    for (const f of frames) expect(f.piano).toBe(0);
  });
});

describe("statement card — no engine work inside the spin-up window", () => {
  it("for any ready time, the schedule finishes before the window (release at its edge)", () => {
    for (let ready = 0; ready <= 16_000; ready += 50) {
      for (const ev of pianoSchedule(ready)) {
        if (ev.step === "release") expect(ev.at).toBeLessThanOrEqual(WINDOW_START_MS);
        else if (ev.step !== "reveal") expect(engineWorkAllowed(ev.at), `${ev.step} @${ev.at} (ready ${ready})`).toBe(true);
      }
    }
  });
  it("the runtime guard refuses a late upload / form inside the window", () => {
    for (let t = 0; t < 16_000; t += 10) {
      const inWin = t >= WINDOW_START_MS && t < WINDOW_END_MS;
      expect(stepAllowed("upload", t)).toBe(!inWin);
      expect(stepAllowed("form", t)).toBe(!inWin);
      expect(stepAllowed("release", t)).toBe(true);
      expect(stepAllowed("reveal", t)).toBe(true);
    }
  });
  it("the hold's safety expiry comes after the release, never inside the card", () => {
    expect(HOLD_MAX_MS).toBeGreaterThan(RELEASE_AT_MS);
  });
  it("the piano stands ~86 % of the screen's height on the kiosk's screens", () => {
    for (const scr of [16 / 9, 16 / 10, 3 / 2]) {
      const img = 590 / 805; // piano-1919-form.jpg
      expect(pianoPlaneScale(img, scr) * 1.06 * (scr / img)).toBeCloseTo(PIANO_HEIGHT, 3);
    }
  });
});

describe("statement card — the hand-back to journey 0 is clean", () => {
  afterEach(() => { setStatementHold(false); vi.useRealTimers(); });
  it("after RELEASE the engine is stopped with no image form and no fire, the hold off", () => {
    const { eng, card, holds } = playCard(0, RELEASE_AT_MS + 100);
    expect(card.released).toBe(true);
    expect(eng.state()).toMatchObject({ form: 0, show: 0, fire: 0, running: false, image: null });
    expect(holds.at(-1)).toBe(false);
  });
  it("the journey's first image is its own: the piano is never worn once the journey starts", () => {
    const { eng } = playCard(0, RELEASE_AT_MS + 100);
    eng.start();
    eng.loadFormImage({ id: "snowflake-emblem" } as unknown as HTMLCanvasElement, 1);
    eng.setImageForm(0.97, 1);
    for (let i = 0; i < 120; i++) { eng.step(1 / 60); expect(eng.state().image).toBe("snowflake-emblem"); }
    expect(eng.loads).toEqual(["piano", "snowflake-emblem"]);
  });
  it("an unmount / operator skip mid-card hands back just as cleanly (and never leaves the text hidden)", () => {
    const eng = fakeEngine();
    let revealed = false;
    const card = createPianoCard({ engine: eng, at: () => 300, screenAspect: () => 16 / 9, samples: () => undefined, setHold: () => {}, reveal: () => { revealed = true; } });
    card.run("upload", piano); card.run("form", piano);
    card.release("unmount");
    expect(eng.state()).toMatchObject({ form: 0, show: 0, fire: 0, running: false, image: null });
    expect(revealed).toBe(true);
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
