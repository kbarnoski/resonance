/**
 * 320 · Kids Light Loom — Multi-touch Bow Gesture Tracker
 *
 * Subsystem 2: tracks per-pointer position and computes bow SPEED each frame.
 * Bow speed = pointer velocity projected along the string axis (vertical).
 * Detects which string each pointer is on and reports normalized bow speed 0..1.
 *
 * For vertical strings: bow motion is mostly vertical drag.
 * Speed is smoothed with a short EMA to avoid jitter.
 */

export interface PointerState {
  id: number;
  x: number;           // current CSS pixel x
  y: number;           // current CSS pixel y
  prevX: number;
  prevY: number;
  prevTime: number;    // ms
  speed: number;       // smoothed speed (CSS px/ms), 0..1 normalized
  stringIdx: number;   // which string this pointer is on (-1 = none)
  bowY: number;        // 0..1 where along the string (vertical) the bow is
}

export interface BowTracker {
  pointers: Map<number, PointerState>;
  onPointerDown: (e: PointerEvent, rect: DOMRect, stringXs: number[], bandPx: number) => void;
  onPointerMove: (e: PointerEvent, rect: DOMRect, stringXs: number[], bandPx: number) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerCancel: (e: PointerEvent) => void;
  /** Returns per-string bow state: { energy 0..1, bowY 0..1 } */
  getStringState: (idx: number) => { energy: number; bowY: number; active: boolean };
  dispose: () => void;
}

// EMA smoothing constant (smaller = slower response = more smooth)
const SPEED_SMOOTH = 0.25;
// Speed in px/ms that maps to energy = 1.0
const MAX_SPEED_PX_MS = 1.8;
// Min speed to consider active bowing (avoids stuck notes from resting finger)
const MIN_SPEED_ACTIVE = 0.03;
// How long (ms) to keep a string ringing after the pointer lifts or slows
const RELEASE_LAG_MS = 80;

function findStringIdx(cssX: number, rect: DOMRect, stringXs: number[], bandPx: number): number {
  // stringXs are in CSS pixel space (relative to rect.left)
  for (let i = 0; i < stringXs.length; i++) {
    if (Math.abs(cssX - stringXs[i]) < bandPx / 2) return i;
  }
  return -1;
}

export function buildBowTracker(): BowTracker {
  const pointers = new Map<number, PointerState>();
  const releaseTimers = new Map<number, number>(); // stringIdx -> timestamp when became inactive

  function onPointerDown(e: PointerEvent, rect: DOMRect, stringXs: number[], bandPx: number) {
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const sIdx = findStringIdx(cssX, rect, stringXs, bandPx);

    pointers.set(e.pointerId, {
      id: e.pointerId,
      x: cssX,
      y: cssY,
      prevX: cssX,
      prevY: cssY,
      prevTime: e.timeStamp,
      speed: 0,
      stringIdx: sIdx,
      bowY: Math.max(0, Math.min(1, cssY / rect.height)),
    });
  }

  function onPointerMove(e: PointerEvent, rect: DOMRect, stringXs: number[], bandPx: number) {
    const p = pointers.get(e.pointerId);
    if (!p) return;

    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const dt = Math.max(1, e.timeStamp - p.prevTime);

    const dx = cssX - p.prevX;
    const dy = cssY - p.prevY;
    // Bow speed = magnitude of velocity in px/ms
    const rawSpeed = Math.sqrt(dx * dx + dy * dy) / dt;

    // EMA smooth
    const smoothed = p.speed * (1 - SPEED_SMOOTH) + rawSpeed * SPEED_SMOOTH;

    // Re-detect string (allow sliding to adjacent string)
    const sIdx = findStringIdx(cssX, rect, stringXs, bandPx);

    p.prevX = p.x;
    p.prevY = p.y;
    p.prevTime = e.timeStamp;
    p.x = cssX;
    p.y = cssY;
    p.speed = smoothed;
    p.stringIdx = sIdx;
    p.bowY = Math.max(0, Math.min(1, cssY / rect.height));
  }

  function onPointerUp(e: PointerEvent) {
    const p = pointers.get(e.pointerId);
    if (p && p.stringIdx >= 0) {
      releaseTimers.set(p.stringIdx, Date.now());
    }
    pointers.delete(e.pointerId);
  }

  function onPointerCancel(e: PointerEvent) {
    onPointerUp(e);
  }

  function getStringState(idx: number): { energy: number; bowY: number; active: boolean } {
    let maxEnergy = 0;
    let bowY = 0.5;
    let hasActive = false;

    for (const p of pointers.values()) {
      if (p.stringIdx !== idx) continue;
      const speed = p.speed;
      const energy = Math.min(1, speed / MAX_SPEED_PX_MS);
      if (energy > maxEnergy) {
        maxEnergy = energy;
        bowY = p.bowY;
      }
      if (speed > MIN_SPEED_ACTIVE) hasActive = true;
    }

    // Release lag: keep active for a short window after the pointer stops/leaves
    if (!hasActive && maxEnergy < MIN_SPEED_ACTIVE) {
      const releaseAt = releaseTimers.get(idx);
      if (releaseAt && Date.now() - releaseAt < RELEASE_LAG_MS) {
        // String is in release window — let audio engine handle fade
        return { energy: 0, bowY, active: true };
      }
      return { energy: 0, bowY, active: false };
    }

    return { energy: maxEnergy, bowY, active: hasActive };
  }

  function dispose() {
    pointers.clear();
    releaseTimers.clear();
  }

  return {
    pointers,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    getStringState,
    dispose,
  };
}
