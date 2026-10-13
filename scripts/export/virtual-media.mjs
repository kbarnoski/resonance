// Virtual media-element playback model (offline export, docs/export-4k.md).
//
// The page's <audio>/<video> elements never play natively during an
// export: play()/pause()/currentTime/paused/ended are answered from this
// model and the position advances only when the exporter steps a frame
// (exactly 1/fps × playbackRate). Each transition returns the media
// events a browser would fire, in browser order; the page runtime
// dispatches them (synthetic, isTrusted=false — the trusted native ones
// are swallowed).
//
// CONSTRAINT: concatenated into the page init script — no imports,
// top-level `export function` only.

/** timeupdate cadence while playing (Chromium fires every ~250 ms). */
export const TIMEUPDATE_EVERY_S = 0.25;

export function createMediaState() {
  return { t: 0, playing: false, ended: false, lastTimeupdate: 0, autoplayed: false, generation: 0 };
}

function clampTime(t, duration) {
  let v = Number(t);
  if (!Number.isFinite(v) || v < 0) v = 0;
  if (Number.isFinite(duration) && duration > 0 && v > duration) v = duration;
  return v;
}

/** HTMLMediaElement.play(). */
export function mediaPlay(s, duration) {
  const ev = [];
  if (s.ended || (Number.isFinite(duration) && duration > 0 && s.t >= duration)) {
    // playing an ended element seeks back to the start
    s.t = 0;
    s.ended = false;
    s.lastTimeupdate = 0;
    ev.push("seeking", "timeupdate", "seeked");
  }
  if (!s.playing) {
    s.playing = true;
    ev.push("play", "playing");
  }
  return ev;
}

/** HTMLMediaElement.pause(). */
export function mediaPause(s) {
  if (!s.playing) return [];
  s.playing = false;
  return ["timeupdate", "pause"];
}

/** currentTime = t. */
export function mediaSeek(s, t, duration) {
  s.t = clampTime(t, duration);
  s.ended = false;
  s.lastTimeupdate = s.t;
  return ["seeking", "timeupdate", "seeked"];
}

/** src change / load(): the load algorithm resets position and the paused flag. */
export function mediaLoad(s) {
  s.t = 0;
  s.playing = false;
  s.ended = false;
  s.lastTimeupdate = 0;
  s.autoplayed = false;
  s.generation += 1;
  return [];
}

/** One frame of playback: dt seconds of wall time. */
export function mediaAdvance(s, dt, o) {
  if (!s.playing) return [];
  const duration = o && o.duration;
  const rate = o && Number.isFinite(o.rate) ? o.rate : 1;
  let t = s.t + dt * rate;
  if (t < 0) t = 0;
  if (Number.isFinite(duration) && duration > 0 && t >= duration) {
    if (o && o.loop) {
      s.t = t % duration;
      s.lastTimeupdate = s.t;
      return ["seeking", "timeupdate", "seeked"];
    }
    s.t = duration;
    s.playing = false;
    s.ended = true;
    return ["timeupdate", "pause", "ended"];
  }
  s.t = t;
  if (s.t - s.lastTimeupdate >= TIMEUPDATE_EVERY_S - 1e-9 || s.t < s.lastTimeupdate) {
    s.lastTimeupdate = s.t;
    return ["timeupdate"];
  }
  return [];
}
