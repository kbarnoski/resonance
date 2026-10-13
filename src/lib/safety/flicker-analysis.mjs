// flicker-analysis.mjs — pure photosensitive-flash analysis core.
//
// Plain ESM (no TS) so BOTH the Node CLI (scripts/flicker-meter.mjs) and
// vitest (flicker-meter.test.ts) import the exact same code — no loader.
//
// Standards implemented (practical approximation of a Harding-style PSE
// analyser — see docs/flicker-safety.md):
//   - WCAG 2.x SC 2.3.1 "general flash and red flash thresholds"
//   - ITU-R BT.1702 / Ofcom Guidance Note on flashing images (same 3/s rule,
//     area = 25 % of the whole screen)
//
// Definitions (WCAG 2.2 glossary):
//   relative luminance  L = 0.2126 R + 0.7152 G + 0.0722 B  (linearised sRGB)
//   transition          a monotonic change in L of >= 0.1 (10 % of max L)
//                       where the darker state is < 0.80
//   flash               a pair of opposing transitions
//   red transition      a change of >= 20 in (R-G-B)*320 where the saturated
//                       state has R/(R+G+B) >= 0.8 (negative values -> 0)
//   area                flashes count only when the concurrently changing
//                       area covers >= 25 % of a 10-degree visual field;
//                       WCAG: a 341x256 rectangle at 1024x768 (= a 1/3 x 1/3
//                       screen window, slid over the frame). Ofcom/ITU:
//                       >= 25 % of the whole screen.
//   FAIL                > 3 general flashes OR > 3 red flashes in any 1 s.
//
// Local flicker (Resonance addition — the particle-shimmer case): regions
// (8 px cells pooled 3x3, CIE L*) that pulse >= 1.5 L* at >= 3 Hz, usually
// far below the general-flash area rule. Scored as the % of the worst 10-degree field
// (and of the whole screen) that is flickering at >= 3 Hz in a 1 s window.
// It is a WARNING metric (below the standards' area threshold), not a FAIL.

/** sRGB 8-bit -> linear lookup. */
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export const DEFAULTS = Object.freeze({
  cellPx: 4, // analysis cell edge in decoded pixels (256 px wide -> 64 cells)
  lumThreshold: 0.1, // transition size, fraction of max relative luminance
  darkLimit: 0.8, // darker state must be below this
  redThreshold: 20, // (R-G-B)*320 transition size
  redRatio: 0.8, // R/(R+G+B) saturation for "saturated red"
  areaFraction: 0.25, // 25 % of the reference field
  fieldFraction: 1 / 3, // WCAG 10-degree field = 341x256 of 1024x768
  maxFlashesPerSecond: 3, // FAIL above this
  concurrencyFrames: 2, // transitions within this many frames are "concurrent"
  localHz: 3, // local-flicker cell rate threshold (flashes/s)
  localCellPx: 8, // local-flicker cell edge in decoded pixels (multiple of cellPx)
  localPool: 1, // neighbourhood pooling radius in local cells (motion vs. flicker)
  localSpace: "lightness", // "lightness" (CIE L*, 0-100) or "linear" (relative luminance)
  localThreshold: 1.5, // transition size in L* units (~1.5 JND: a visible pulse on a dark ground)
  localWarnFieldPct: 10, // WARN when >= this % of any 10-degree field flickers >= 3 Hz (calibrated 2026-10-13)
  localWarnScreenPct: 2, // ... or >= this % of the whole screen
});

/**
 * Per-cell transition detector (Harding-style extremum tracker). A
 * transition is registered when the signal has moved >= `th` away from the
 * last extremum in the opposite direction AND the darker of the two states
 * is < `darkLimit`. Returns +1 / -1 for a transition this frame, else 0.
 */
function makeDetector(n, th, darkLimit) {
  const dir = new Int8Array(n); // 0 unknown, +1 rising, -1 falling
  const ext = new Float32Array(n); // running extremum in current direction
  const lo = new Float32Array(n).fill(Infinity);
  const hi = new Float32Array(n).fill(-Infinity);
  return function step(i, v) {
    const d = dir[i];
    if (d === 0) {
      if (v < lo[i]) lo[i] = v;
      if (v > hi[i]) hi[i] = v;
      if (v - lo[i] >= th && lo[i] < darkLimit) { dir[i] = 1; ext[i] = v; return 1; }
      if (hi[i] - v >= th && v < darkLimit) { dir[i] = -1; ext[i] = v; return -1; }
      return 0;
    }
    if (d === 1) {
      if (v > ext[i]) { ext[i] = v; return 0; }
      if (ext[i] - v >= th && v < darkLimit) { dir[i] = -1; ext[i] = v; return -1; }
      return 0;
    }
    if (v < ext[i]) { ext[i] = v; return 0; }
    if (v - ext[i] >= th && ext[i] < darkLimit) { dir[i] = 1; ext[i] = v; return 1; }
    return 0;
  };
}

/** Max count of set cells in any wx*wy window (2-D prefix sum). Returns {count, x, y}. */
function maxWindow(mask, gx, gy, wx, wy, ps) {
  // ps: Int32Array((gx+1)*(gy+1)) scratch
  const W = gx + 1;
  for (let y = 0; y <= gy; y++) ps[y * W] = 0;
  for (let x = 0; x <= gx; x++) ps[x] = 0;
  for (let y = 1; y <= gy; y++) {
    let row = 0;
    for (let x = 1; x <= gx; x++) {
      row += mask[(y - 1) * gx + (x - 1)];
      ps[y * W + x] = ps[(y - 1) * W + x] + row;
    }
  }
  let best = 0, bx = 0, by = 0;
  for (let y = 0; y + wy <= gy; y++) {
    for (let x = 0; x + wx <= gx; x++) {
      const s = ps[(y + wy) * W + (x + wx)] - ps[y * W + (x + wx)] - ps[(y + wy) * W + x] + ps[y * W + x];
      if (s > best) { best = s; bx = x; by = y; }
    }
  }
  return { count: best, x: bx, y: by };
}

/** Collapse consecutive same-direction events and return max events in any `win`-frame window. */
function maxEventsInWindow(events, win) {
  let best = 0, bestStart = 0;
  let j = 0;
  for (let i = 0; i < events.length; i++) {
    while (events[i].frame - events[j].frame >= win) j++;
    const n = i - j + 1;
    if (n > best) { best = n; bestStart = events[j].frame; }
  }
  return { count: best, startFrame: bestStart };
}

/**
 * Incremental analyser. Push rgb24 frames (Uint8Array/Buffer, width*height*3)
 * in order, then call finish().
 * @param {{width:number,height:number,fps:number}} geom
 * @param {Partial<typeof DEFAULTS>} [opts]
 */
export function createFlickerAnalyzer({ width, height, fps }, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const cell = o.cellPx;
  const gx = Math.max(1, Math.floor(width / cell));
  const gy = Math.max(1, Math.floor(height / cell));
  const n = gx * gy;
  const fwx = Math.max(1, Math.round(gx * o.fieldFraction));
  const fwy = Math.max(1, Math.round(gy * o.fieldFraction));
  const fieldCells = fwx * fwy;
  const win = Math.max(1, Math.round(fps)); // frames per 1-s window

  const lumDet = makeDetector(n, o.lumThreshold, o.darkLimit);
  const redDet = makeDetector(n, o.redThreshold, Infinity);

  const lum = new Float32Array(n);
  const red = new Float32Array(n);
  const sumR = new Float32Array(n), sumG = new Float32Array(n), sumB = new Float32Array(n);
  const ps = new Int32Array((gx + 1) * (gy + 1));

  // concurrency ring of per-direction masks: [frameSlot][dir up/down][cell]
  const C = Math.max(1, o.concurrencyFrames);
  const ringLum = Array.from({ length: C }, () => [new Uint8Array(n), new Uint8Array(n)]);
  const ringRed = Array.from({ length: C }, () => [new Uint8Array(n), new Uint8Array(n)]);
  const unionMask = new Uint8Array(n);

  // local flicker: its own (coarser) grid, perceptual lightness space,
  // per-cell transition count in the trailing 1-s window
  const k = Math.max(1, Math.round(o.localCellPx / cell));
  const lgx = Math.max(1, Math.floor(gx / k));
  const lgy = Math.max(1, Math.floor(gy / k));
  const ln = lgx * lgy;
  const lfwx = Math.max(1, Math.round(lgx * o.fieldFraction));
  const lfwy = Math.max(1, Math.round(lgy * o.fieldFraction));
  const lFieldCells = lfwx * lfwy;
  const lps = new Int32Array((lgx + 1) * (lgy + 1));
  const lVal = new Float32Array(ln);
  const localDet = makeDetector(ln, o.localThreshold, Infinity);
  const cellCount = new Uint16Array(ln);
  const history = []; // per frame: Int32Array of local cells that transitioned
  const localMask = new Uint8Array(ln);
  const localMinTransitions = Math.max(2, Math.ceil(o.localHz * 2)); // 3 Hz -> 6 transitions/s

  const genEvents = []; const genEventsScreen = []; const redEvents = [];
  const lastDir = { gen: 0, scr: 0, red: 0 };
  const perFrame = []; // { fieldPct, screenPct, localFieldPct, localScreenPct, lx, ly }

  let frame = 0;

  function areaFor(ring, slotDir) {
    unionMask.fill(0);
    for (let k = 0; k < C; k++) {
      const m = ring[k][slotDir];
      for (let i = 0; i < n; i++) if (m[i]) unionMask[i] = 1;
    }
    let screen = 0;
    for (let i = 0; i < n; i++) screen += unionMask[i];
    const field = maxWindow(unionMask, gx, gy, fwx, fwy, ps);
    return { field: field.count / fieldCells, screen: screen / n };
  }

  function pushEvent(list, key, dirv, f, area) {
    if (lastDir[key] === dirv) return; // collapse same-direction continuation
    lastDir[key] = dirv;
    list.push({ frame: f, dir: dirv, area });
  }

  function push(rgb) {
    // 1. per-cell linear means
    sumR.fill(0); sumG.fill(0); sumB.fill(0);
    for (let y = 0; y < gy * cell; y++) {
      const cy = (y / cell) | 0;
      const rowOff = y * width * 3;
      for (let x = 0; x < gx * cell; x++) {
        const c = cy * gx + ((x / cell) | 0);
        const p = rowOff + x * 3;
        sumR[c] += LIN[rgb[p]]; sumG[c] += LIN[rgb[p + 1]]; sumB[c] += LIN[rgb[p + 2]];
      }
    }
    const inv = 1 / (cell * cell);
    const slot = frame % C;
    const [lu, ld] = ringLum[slot]; const [ru, rd] = ringRed[slot];
    lu.fill(0); ld.fill(0); ru.fill(0); rd.fill(0);
    const changed = [];
    for (let i = 0; i < n; i++) {
      const R = sumR[i] * inv, G = sumG[i] * inv, B = sumB[i] * inv;
      lum[i] = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      const s = R + G + B;
      red[i] = s > 0 && R / s >= o.redRatio ? Math.max(0, (R - G - B) * 320) : 0;
      const t = lumDet(i, lum[i]);
      if (t === 1) lu[i] = 1; else if (t === -1) ld[i] = 1;
      if (t !== 0) changed.push(i);
      const r = redDet(i, red[i]);
      if (r === 1) ru[i] = 1; else if (r === -1) rd[i] = 1;
    }

    // 2. general + red flash events (area rule, concurrency union)
    let fieldPct = 0, screenPct = 0;
    if (changed.length) {
      for (const dirv of [1, -1]) {
        const a = areaFor(ringLum, dirv === 1 ? 0 : 1);
        fieldPct = Math.max(fieldPct, a.field); screenPct = Math.max(screenPct, a.screen);
        if (a.field >= o.areaFraction) pushEvent(genEvents, "gen", dirv, frame, a.field);
        if (a.screen >= o.areaFraction) pushEvent(genEventsScreen, "scr", dirv, frame, a.screen);
      }
    }
    for (const dirv of [1, -1]) {
      const m = ringRed[slot][dirv === 1 ? 0 : 1];
      let any = false; for (let i = 0; i < n; i++) if (m[i]) { any = true; break; }
      if (!any) continue;
      const a = areaFor(ringRed, dirv === 1 ? 0 : 1);
      if (a.field >= o.areaFraction) pushEvent(redEvents, "red", dirv, frame, a.field);
    }

    // 3. local flicker: per-cell >= localHz within trailing 1 s
    //    Local cells pool k x k analysis cells (linear mean), then map to
    //    perceptual lightness (CIE L*, 0-100) so a glow pulsing on a dark
    //    background registers the way the eye sees it.
    lVal.fill(0);
    for (let y = 0; y < lgy * k; y++) {
      const ly = (y / k) | 0;
      for (let x = 0; x < lgx * k; x++) lVal[ly * lgx + ((x / k) | 0)] += lum[y * gx + x];
    }
    //    Neighbourhood pooling (box of radius localPool cells, linear light):
    //    a feature that merely MOVES (a particle drifting, a ray sweeping)
    //    conserves the pooled light, so it does not oscillate; a glow that
    //    PULSES in brightness does. This is what separates shimmer from motion.
    const lch = [];
    const kk = 1 / (k * k);
    const R = o.localPool;
    for (let i = 0; i < ln; i++) {
      let y;
      if (R > 0) {
        const cx = i % lgx, cy = (i / lgx) | 0;
        let s = 0, c = 0;
        for (let yy = Math.max(0, cy - R); yy <= Math.min(lgy - 1, cy + R); yy++) {
          for (let xx = Math.max(0, cx - R); xx <= Math.min(lgx - 1, cx + R); xx++) { s += lVal[yy * lgx + xx]; c++; }
        }
        y = (s / c) * kk;
      } else y = lVal[i] * kk;
      const v = o.localSpace === "linear" ? y : y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
      if (localDet(i, v) !== 0) lch.push(i);
    }
    const ch = Int32Array.from(lch);
    history.push(ch);
    for (const i of ch) cellCount[i]++;
    if (history.length > win) { for (const i of history[history.length - win - 1]) cellCount[i]--; history[history.length - win - 1] = null; }
    let localN = 0;
    for (let i = 0; i < ln; i++) { const on = cellCount[i] >= localMinTransitions ? 1 : 0; localMask[i] = on; localN += on; }
    let lf = { count: 0, x: 0, y: 0 };
    if (localN) lf = maxWindow(localMask, lgx, lgy, lfwx, lfwy, lps);
    perFrame.push({
      fieldPct: fieldPct * 100, screenPct: screenPct * 100,
      localFieldPct: (lf.count / lFieldCells) * 100, localScreenPct: (localN / ln) * 100,
      lx: lf.x / lgx, ly: lf.y / lgy,
    });
    frame++;
  }

  function finish() {
    const frames = frame;
    const gen = maxEventsInWindow(genEvents, win);
    const scr = maxEventsInWindow(genEventsScreen, win);
    const rd = maxEventsInWindow(redEvents, win);
    const flashes = (k) => k / 2;
    const genMax = flashes(gen.count), scrMax = flashes(scr.count), redMax = flashes(rd.count);

    // local flicker summary
    let peak = { localFieldPct: 0, localScreenPct: 0, frame: 0, lx: 0, ly: 0 };
    let sumScreen = 0;
    for (let f = 0; f < perFrame.length; f++) {
      const p = perFrame[f];
      sumScreen += p.localScreenPct;
      if (p.localFieldPct > peak.localFieldPct || (p.localFieldPct === peak.localFieldPct && p.localScreenPct > peak.localScreenPct)) {
        peak = { ...p, frame: f };
      }
    }
    let peakScreen = 0;
    for (const p of perFrame) peakScreen = Math.max(peakScreen, p.localScreenPct);

    // per-second timeline
    const secs = Math.ceil(frames / fps);
    const timeline = [];
    for (let s = 0; s < secs; s++) {
      const a = Math.floor(s * fps), b = Math.min(frames, Math.floor((s + 1) * fps));
      let lfF = 0, lfS = 0, area = 0;
      for (let f = a; f < b; f++) { const p = perFrame[f]; lfF = Math.max(lfF, p.localFieldPct); lfS = Math.max(lfS, p.localScreenPct); area = Math.max(area, p.fieldPct); }
      const inSec = (ev) => ev.filter((e) => e.frame >= a && e.frame < b).length;
      timeline.push({
        t: s,
        generalTransitions: inSec(genEvents), redTransitions: inSec(redEvents),
        maxChangingFieldPct: round(area), localFieldPct: round(lfF), localScreenPct: round(lfS),
      });
    }
    let secondsOverWarn = 0;
    for (const t of timeline) if (t.localFieldPct >= o.localWarnFieldPct || t.localScreenPct >= o.localWarnScreenPct) secondsOverWarn++;

    const generalFail = genMax > o.maxFlashesPerSecond;
    const redFail = redMax > o.maxFlashesPerSecond;
    const ofcomFail = scrMax > o.maxFlashesPerSecond;
    const localWarn = peak.localFieldPct >= o.localWarnFieldPct || peakScreen >= o.localWarnScreenPct;
    const verdict = generalFail || redFail ? "FAIL" : localWarn ? "WARN" : "PASS";

    const t = (f) => round(f / fps);
    return {
      verdict,
      standard: "WCAG 2.x SC 2.3.1 general+red flash (10-degree field = 1/3x1/3 screen window, 25% area); ITU-R BT.1702/Ofcom whole-screen 25% reported alongside",
      frames, fps, durationSec: t(frames), grid: { cols: gx, rows: gy, cellPx: cell, fieldCells: [fwx, fwy] },
      general: {
        fail: generalFail, maxFlashesPerSec: genMax, worstSecondStartSec: t(gen.startFrame),
        transitions: genEvents.length, flashes: Math.floor(genEvents.length / 2),
      },
      red: { fail: redFail, maxFlashesPerSec: redMax, worstSecondStartSec: t(rd.startFrame), transitions: redEvents.length },
      ofcomWholeScreen: { fail: ofcomFail, maxFlashesPerSec: scrMax, worstSecondStartSec: t(scr.startFrame), transitions: genEventsScreen.length },
      local: {
        warn: localWarn,
        thresholdHz: o.localHz,
        warnAt: { fieldPct: o.localWarnFieldPct, screenPct: o.localWarnScreenPct },
        peakFieldPct: round(peak.localFieldPct), peakScreenPct: round(peakScreen),
        meanScreenPct: round(perFrame.length ? sumScreen / perFrame.length : 0),
        secondsOverWarn,
        worstTimeSec: t(peak.frame),
        // worst 10-degree field, as fractions of the frame (x, y, w, h)
        worstRegion: {
          x: round(peak.lx, 3), y: round(peak.ly, 3), w: round(lfwx / lgx, 3), h: round(lfwy / lgy, 3),
          label: regionLabel(peak.lx + lfwx / lgx / 2, peak.ly + lfwy / lgy / 2),
        },
        grid: { cols: lgx, rows: lgy, cellPx: k * cell, space: o.localSpace, threshold: o.localThreshold },
      },
      timeline,
    };
  }

  return { push, finish, grid: { gx, gy } };
}

function round(v, d = 2) { const k = 10 ** d; return Math.round(v * k) / k; }
function regionLabel(cx, cy) {
  const v = cy < 0.34 ? "top" : cy > 0.66 ? "bottom" : "middle";
  const h = cx < 0.34 ? "left" : cx > 0.66 ? "right" : "center";
  return v === "middle" && h === "center" ? "center" : `${v}-${h}`;
}

/** Convenience: analyse an in-memory array of rgb24 frames. */
export function analyzeFrames(frames, geom, opts) {
  const a = createFlickerAnalyzer(geom, opts);
  for (const f of frames) a.push(f);
  return a.finish();
}

/** One-line human summary of a result. */
export function summarize(name, r) {
  const L = r.local;
  return [
    `${r.verdict.padEnd(4)} ${name}`,
    `  general flashes: max ${r.general.maxFlashesPerSec}/s (worst second @ ${r.general.worstSecondStartSec}s, limit 3)  red: max ${r.red.maxFlashesPerSec}/s  ofcom whole-screen: max ${r.ofcomWholeScreen.maxFlashesPerSec}/s`,
    `  local flicker >=${L.thresholdHz}Hz: peak ${L.peakFieldPct}% of a 10-deg field (warn ${L.warnAt.fieldPct}%), ${L.peakScreenPct}% of screen (warn ${L.warnAt.screenPct}%), mean ${L.meanScreenPct}%, ${L.secondsOverWarn}s over warn; worst @ ${L.worstTimeSec}s ${L.worstRegion.label}`,
  ].join("\n");
}
