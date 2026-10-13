/**
 * MIDI DRIVE (midi-drive.ts): the Nord's exact notes → the living score /
 * two hands / trails inputs, the audio ↔ MIDI crossfade timing, and the
 * seizure law — with MIDI driving, no feature reacts faster than its own
 * existing smoothing (the score's attack, the hands' attack / release / slew,
 * the trails' EMA + gain slew).
 */
import { describe, it, expect } from "vitest";
import { MidiState } from "@/lib/audio/midi-input";
import { MidiDrive, MIDI_DRIVE as D, midiPitch, velocityStrength, midiRightShare } from "./midi-drive";
import { LivingScore, SCORE_TUNING, rippleEnvelope, type Onset } from "./living-score";
import { TwoHands, HANDS_TUNING } from "./two-hands";
import { SustainMeter, TRAILS_LAWS } from "./resonance-trails";

const DT = 1 / 60;
const MS = 1000 / 60;

function rig(devices = ["Nord Stage 3"]) {
  const st = new MidiState();
  st.setDevices(devices);
  const md = new MidiDrive(st);
  let now = 0;
  md.step(now);
  const run = (secs: number, each?: (t: number) => void) => {
    const n = Math.round(secs * 60);
    for (let i = 0; i < n; i++) { now += MS; each?.(now); md.step(now); }
  };
  return { st, md, run, now: () => now };
}

describe("mapping", () => {
  it("MIDI 21–108 → the score's 0..1 stave, monotone, clamped", () => {
    expect(midiPitch(21)).toBe(0);
    expect(midiPitch(108)).toBe(1);
    expect(midiPitch(60)).toBeCloseTo((60 - 21) / 87, 6);
    expect(midiPitch(0)).toBe(0);
    expect(midiPitch(127)).toBe(1);
    for (let n = 22; n <= 108; n++) expect(midiPitch(n)).toBeGreaterThan(midiPitch(n - 1));
  });

  it("velocity → strength in [floor, 1], monotone", () => {
    expect(velocityStrength(1)).toBeGreaterThanOrEqual(D.STRENGTH_FLOOR);
    expect(velocityStrength(127)).toBe(1);
    expect(velocityStrength(100)).toBeGreaterThan(velocityStrength(40));
  });

  it("the hands split at middle C by default, configurable", () => {
    expect(midiRightShare(48)).toBe(0);
    expect(midiRightShare(72)).toBe(1);
    expect(midiRightShare(60)).toBeCloseTo(0.5, 6);
    expect(midiRightShare(60, 48)).toBe(1);
  });
});

describe("living score: each note-on → an onset at its exact pitch", () => {
  it("a note → one onset, exact pitch, velocity strength (at full mix)", () => {
    const { st, md, run, now } = rig();
    st.noteOn(30, 10, now()); // wake MIDI
    run(3, () => md.scoreOnset(null));
    expect(md.mix).toBe(1);
    st.noteOn(72, 100, now());
    run(DT);
    const o = md.scoreOnset(null)!;
    expect(o.pitch).toBeCloseTo(midiPitch(72), 6);
    expect(o.strength).toBeCloseTo(velocityStrength(100), 6);
    run(DT);
    expect(md.scoreOnset(null)).toBeNull();
  });

  it("a chord is offered one note per score spacing; stale ones expire", () => {
    const { st, md, run, now } = rig();
    st.noteOn(30, 10, now());
    run(3, () => md.scoreOnset(null));
    for (const n of [48, 52, 55, 60, 64, 67]) st.noteOn(n, 90, now());
    const at: number[] = [];
    let t = 0;
    run(1, () => { t += DT; if (md.scoreOnset(null)) at.push(t); });
    expect(at.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(SCORE_TUNING.MIN_SPAWN_GAP_SEC - 1e-9);
    expect(at[at.length - 1]).toBeLessThanOrEqual(D.MAX_WAIT_SEC + 2 * DT);
    expect(md.pending()).toBe(0);
  });

  it("at full MIDI the audio guesses are silenced; at mix 0 they pass untouched", () => {
    const idle = rig();
    const audio: Onset = { pitch: 0.4, strength: 0.8 };
    expect(idle.md.mix).toBe(0);
    expect(idle.md.scoreOnset(audio)).toBe(audio); // same object: exact old behaviour
    const { st, md, run, now } = rig();
    st.noteOn(30, 10, now());
    run(3, () => md.scoreOnset(null));
    expect(md.scoreOnset(audio)).toBeNull();
  });

  it("notes played before the bridge existed are never replayed", () => {
    const st = new MidiState();
    st.setDevices(["Nord"]);
    st.noteOn(60, 100, 0);
    const md = new MidiDrive(st);
    md.step(10);
    expect(md.pending()).toBe(0);
  });
});

describe("two hands: held notes split at the split note, velocity-weighted", () => {
  it("left-hand chord → low target, right-hand melody → high target", () => {
    const { st, md, run, now } = rig();
    for (const n of [36, 43, 48]) st.noteOn(n, 100, now());
    run(1);
    expect(md.hands.low).toBeGreaterThan(0.5);
    expect(md.hands.high).toBeLessThan(0.05);
    for (const n of [36, 43, 48]) st.noteOff(n, now());
    run(6);
    st.noteOn(84, 100, now()); st.noteOn(88, 100, now());
    run(0.5);
    expect(md.hands.high).toBeGreaterThan(md.hands.low);
  });

  it("softer playing reads less activity", () => {
    const a = rig(), b = rig();
    for (const n of [36, 43]) { a.st.noteOn(n, 120, 0); b.st.noteOn(n, 30, 0); }
    a.run(0.5); b.run(0.5);
    expect(a.md.hands.low).toBeGreaterThan(b.md.hands.low);
  });
});

describe("trails: sustain = pedal down OR notes held, decaying after release", () => {
  it("a held chord rings; with the pedal it keeps ringing after release; dampers stop it", () => {
    const { st, md, run, now } = rig();
    for (const n of [48, 55, 64]) st.noteOn(n, 100, now());
    run(1);
    expect(md.trails.raw).toBeGreaterThan(0.5);
    st.setPedal(true, now());
    for (const n of [48, 55, 64]) st.noteOff(n, now());
    run(2);
    expect(md.trails.raw).toBeGreaterThan(0.4); // the pedal holds the ring
    st.setPedal(false, now());
    run(0.05);
    expect(md.trails.raw).toBe(0); // dampers down: nothing sounding
    run(1.5);
    st.setPedal(true, now());
    run(0.05);
    expect(md.trails.raw).toBeLessThan(0.15); // the energy already fell with the dampers
  });

  it("fast staccato reads busy → no tails", () => {
    const { st, md, run, now } = rig();
    let k = 0;
    run(3, (t) => {
      if (Math.round(t / MS) % 4 === 0) { // 15 notes / s
        const n = 60 + (k++ % 12);
        st.noteOn(n, 90, now());
        st.noteOff(n, now() + 20);
      }
    });
    expect(md.busy).toBeGreaterThan(0.9);
    expect(md.trails.raw).toBeLessThan(0.1);
  });
});

describe("audio ↔ MIDI crossfade", () => {
  it("rises over CROSSFADE_SEC (≥ 2 s), holds 10 s after the last note, falls over ≥ 2 s", () => {
    expect(D.CROSSFADE_SEC).toBeGreaterThanOrEqual(2);
    const { st, md, run, now } = rig();
    st.noteOn(60, 90, now());
    st.noteOff(60, now() + 100);
    let prev = 0, maxStep = 0, tFull = -1, t = 0;
    run(D.ACTIVE_WINDOW_MS / 1000 + 6, () => {
      t += DT;
      maxStep = Math.max(maxStep, Math.abs(md.mix - prev));
      prev = md.mix;
      if (tFull < 0 && md.mix >= 1) tFull = t;
    });
    expect(tFull).toBeGreaterThanOrEqual(2);
    // smoothstep(w) has a max slope of 1.5 → per-frame change ≤ 1.5·dt/CROSSFADE
    expect(maxStep).toBeLessThanOrEqual((1.5 * DT) / D.CROSSFADE_SEC + 1e-6);
    expect(md.mix).toBe(0);
  });

  it("stays fully MIDI through the 10 s window, then never drops faster than the fade", () => {
    const { st, md, run, now } = rig();
    st.noteOn(60, 90, now());
    st.noteOff(60, now());
    run(9.5);
    expect(md.mix).toBe(1);
    run(1); // window passed at 10 s: fading
    expect(md.mix).toBeLessThan(1);
    expect(md.mix).toBeGreaterThan(0.5);
    run(D.CROSSFADE_SEC);
    expect(md.mix).toBe(0);
  });

  it("unplugging the keyboard fades back to audio over ≥ 2 s (never a jump)", () => {
    const { st, md, run, now } = rig();
    st.noteOn(60, 90, now());
    run(3);
    expect(md.mix).toBe(1);
    st.releaseSource("in", now());
    st.setDevices([]);
    run(1);
    expect(md.mix).toBeGreaterThan(0.5);
    run(2);
    expect(md.mix).toBe(0);
  });

  it("a connected but silent keyboard never takes over", () => {
    const { md, run } = rig();
    run(5);
    expect(md.mix).toBe(0);
  });
});

describe("seizure law — MIDI never makes a feature react faster than its smoothing", () => {
  it("two hands: a slammed chord still eases in ≥ ATTACK_SEC and the voices obey the slew cap", () => {
    const { st, md, run, now } = rig();
    st.noteOn(30, 10, now());
    run(3); // MIDI fully in
    const hands = new TwoHands();
    // settle the gate first, silence
    for (let i = 0; i < 300; i++) { md.step(now() + i * MS); hands.step(null, null, DT, 1, md.hands); }
    let base = now() + 300 * MS;
    for (const n of [36, 40, 43, 48]) st.noteOn(n, 127, base);
    let lowPrev = hands.low, vPrev = { ...hands.voices }, maxDv = 0;
    for (let i = 1; i <= 120; i++) {
      md.step(base + i * MS);
      const v = hands.step(null, null, DT, 1, md.hands);
      maxDv = Math.max(maxDv, Math.abs(v.low - vPrev.low), Math.abs(v.high - vPrev.high));
      vPrev = { ...v };
      // the eased activity never rises faster than the attack EMA allows
      expect(hands.low - lowPrev).toBeLessThanOrEqual((1 - Math.exp(-DT / HANDS_TUNING.ATTACK_SEC)) + 1e-9);
      lowPrev = hands.low;
    }
    expect(maxDv).toBeLessThanOrEqual(HANDS_TUNING.MAX_RATE_PER_SEC * DT + 1e-9);
    base += 120 * MS;
    // all off → release ≥ RELEASE_SEC
    for (const n of [30, 36, 40, 43, 48]) st.noteOff(n, base);
    const before = hands.low;
    for (let i = 1; i <= 30; i++) { md.step(base + i * MS); hands.step(null, null, DT, 1, md.hands); }
    expect(hands.low).toBeGreaterThan(before * Math.exp(-0.5 / HANDS_TUNING.RELEASE_SEC) - 0.05);
  });

  it("trails: pedal slammed down → sustain rides its ≥ 1.8 s EMA and the gain its slew cap", () => {
    const { st, md, run, now } = rig();
    st.noteOn(30, 10, now());
    run(3);
    const sm = new SustainMeter();
    let base = now();
    for (const n of [48, 55, 64, 67]) st.noteOn(n, 127, base);
    st.setPedal(true, base);
    let gPrev = sm.gain, maxDg = 0;
    for (let i = 1; i <= 60; i++) {
      md.step(base + i * MS);
      sm.push(null, DT, md.trails);
      maxDg = Math.max(maxDg, Math.abs(sm.gain - gPrev));
      gPrev = sm.gain;
    }
    expect(sm.sustain).toBeLessThanOrEqual(1 - Math.exp(-1 / TRAILS_LAWS.UP_TAU_SEC) + 1e-6);
    expect(maxDg).toBeLessThanOrEqual(TRAILS_LAWS.MAX_GAIN_RATE * DT + 1e-9);
    // pedal up + all released: the tails shorten over the ≥ 3 s fall, never cut
    base += 60 * MS;
    for (let i = 1; i <= 180; i++) { md.step(base + i * MS); sm.push(null, DT, md.trails); }
    const s0 = sm.sustain;
    st.setPedal(false, base + 181 * MS);
    for (const n of [30, 48, 55, 64, 67]) st.noteOff(n, base + 181 * MS);
    for (let i = 182; i <= 241; i++) { md.step(base + i * MS); sm.push(null, DT, md.trails); }
    expect(sm.sustain).toBeGreaterThanOrEqual(s0 * Math.exp(-1 / TRAILS_LAWS.DOWN_TAU_SEC) - 1e-6);
  });

  it("living score: a 20-note smash spawns ≤ 1 ripple per spacing, each easing in over ATTACK_SEC", () => {
    const { st, md, run, now } = rig();
    st.noteOn(30, 10, now());
    run(3, () => md.scoreOnset(null));
    const score = new LivingScore(7);
    for (let i = 0; i < 120; i++) score.step(DT, null, 1); // gate up
    const base = now();
    for (let n = 0; n < 20; n++) st.noteOn(40 + n * 2, 127, base);
    let prevSpawned = score.spawned, lastSpawnT = -Infinity, t = 0, maxAmpStep = 0;
    const prevAmp = score.slots.map(() => 0);
    for (let i = 1; i <= 90; i++) {
      t += DT;
      md.step(base + i * MS);
      score.step(DT, md.scoreOnset(null), 1);
      if (score.spawned > prevSpawned) {
        expect(t - lastSpawnT).toBeGreaterThanOrEqual(SCORE_TUNING.MIN_SPAWN_GAP_SEC - 1e-9);
        lastSpawnT = t;
        prevSpawned = score.spawned;
      }
      score.slots.forEach((r, k) => {
        const amp = r.live ? r.strength * rippleEnvelope(r.age, r.life) * score.gate : 0;
        maxAmpStep = Math.max(maxAmpStep, amp - prevAmp[k]);
        prevAmp[k] = amp;
      });
    }
    expect(score.spawned).toBeLessThanOrEqual(Math.ceil(D.MAX_WAIT_SEC / SCORE_TUNING.MIN_SPAWN_GAP_SEC) + 1);
    // every ripple eases in on the score's smoothstep attack (max slope 1.5 / ATTACK_SEC) — never a kick
    expect(maxAmpStep).toBeLessThanOrEqual((1.5 * DT) / SCORE_TUNING.ATTACK_SEC + 1e-6);
  });
});
