import { describe, it, expect } from "vitest";
import { createMediaState, mediaPlay, mediaPause, mediaSeek, mediaLoad, mediaAdvance } from "./virtual-media.mjs";

describe("virtual media model", () => {
  it("play → play, playing; advances exactly dt per frame; timeupdate every 250 ms", () => {
    const s = createMediaState();
    expect(mediaPlay(s, 100)).toEqual(["play", "playing"]);
    expect(mediaPlay(s, 100)).toEqual([]); // already playing
    let tu = 0;
    for (let i = 0; i < 60; i++) tu += mediaAdvance(s, 1 / 60, { duration: 100 }).filter((e) => e === "timeupdate").length;
    expect(s.t).toBeCloseTo(1, 12);
    expect(tu).toBe(4);
  });

  it("stays on the 1/fps grid over a long render", () => {
    const s = createMediaState();
    mediaPlay(s, 1e9);
    for (let i = 0; i < 18000; i++) mediaAdvance(s, 1 / 60, { duration: 1e9 });
    expect(Math.abs(s.t - 300)).toBeLessThan(1e-9);
  });

  it("does not advance while paused", () => {
    const s = createMediaState();
    expect(mediaAdvance(s, 1, { duration: 10 })).toEqual([]);
    expect(s.t).toBe(0);
    mediaPlay(s, 10);
    mediaAdvance(s, 1, { duration: 10 });
    expect(mediaPause(s)).toEqual(["timeupdate", "pause"]);
    mediaAdvance(s, 1, { duration: 10 });
    expect(s.t).toBe(1);
    expect(mediaPause(s)).toEqual([]);
  });

  it("ends at duration: timeupdate, pause, ended; play again restarts from 0", () => {
    const s = createMediaState();
    mediaPlay(s, 1);
    expect(mediaAdvance(s, 0.6, { duration: 1 })).toEqual(["timeupdate"]);
    expect(mediaAdvance(s, 0.6, { duration: 1 })).toEqual(["timeupdate", "pause", "ended"]);
    expect(s).toMatchObject({ t: 1, playing: false, ended: true });
    expect(mediaPlay(s, 1)).toEqual(["seeking", "timeupdate", "seeked", "play", "playing"]);
    expect(s.t).toBe(0);
  });

  it("loop wraps instead of ending", () => {
    const s = createMediaState();
    mediaPlay(s, 1);
    expect(mediaAdvance(s, 1.25, { duration: 1, loop: true })).toEqual(["seeking", "timeupdate", "seeked"]);
    expect(s.t).toBeCloseTo(0.25, 12);
    expect(s.playing).toBe(true);
  });

  it("honours playbackRate", () => {
    const s = createMediaState();
    mediaPlay(s, 10);
    mediaAdvance(s, 1, { duration: 10, rate: 0.5 });
    expect(s.t).toBe(0.5);
  });

  it("seek clamps to [0, duration] and clears ended", () => {
    const s = createMediaState();
    s.ended = true;
    expect(mediaSeek(s, 50, 10)).toEqual(["seeking", "timeupdate", "seeked"]);
    expect(s.t).toBe(10);
    expect(s.ended).toBe(false);
    mediaSeek(s, -3, 10);
    expect(s.t).toBe(0);
    mediaSeek(s, 3, NaN); // duration unknown — no upper clamp
    expect(s.t).toBe(3);
  });

  it("load resets position + paused flag and bumps the generation", () => {
    const s = createMediaState();
    mediaPlay(s, 10);
    mediaAdvance(s, 2, { duration: 10 });
    s.autoplayed = true;
    mediaLoad(s);
    expect(s).toMatchObject({ t: 0, playing: false, ended: false, autoplayed: false, generation: 1 });
  });
});
