// ─────────────────────────────────────────────────────────────────────────────
// telemetry.ts — the ONLY input: the machine's live self-portrait.
//
// No mic, no camera, no file. We sample the browser's own vital signs:
//   • frame timing / jank  (requestAnimationFrame delta → fps + jitter variance)
//   • memory pressure      (performance.memory usedJSHeapSize / jsHeapSizeLimit)
//   • network weather      (navigator.connection effectiveType / downlink / rtt)
//   • battery              (navigator.getBattery → level + charging)
//   • pointer restlessness (accumulated pointer speed + direction-change rate)
//   • static context       (hardwareConcurrency, devicePixelRatio, viewport)
//
// Everything degrades gracefully: a missing source becomes `null` and the rest
// of the portrait keeps singing. All window/navigator/performance access happens
// only after create() is called from inside an effect — never at module top.
// ─────────────────────────────────────────────────────────────────────────────

export interface NetInfo {
  effectiveType: string;
  downlink: number; // Mbps
  rtt: number; // ms
}

export interface BatteryInfo {
  level: number; // 0..1
  charging: boolean;
}

export interface MemInfo {
  used: number; // bytes
  limit: number; // bytes
  ratio: number; // 0..1
}

export interface Sample {
  fps: number; // smoothed instantaneous frames-per-second
  frameMs: number; // last frame delta, ms
  jank: number; // 0..1 normalized frame-time jitter (rising = strain)
  mem: MemInfo | null;
  net: NetInfo | null;
  battery: BatteryInfo | null;
  restlessness: number; // 0..1 pointer entropy
  load: number; // 0..1 aggregate machine strain
  cores: number;
  dpr: number;
  visible: boolean;
  vw: number;
  vh: number;
}

interface PerfMemory {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface NavConnection {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  addEventListener?: (t: string, cb: () => void) => void;
  removeEventListener?: (t: string, cb: () => void) => void;
}

interface BatteryManager {
  level: number;
  charging: boolean;
  addEventListener: (t: string, cb: () => void) => void;
  removeEventListener: (t: string, cb: () => void) => void;
}

export interface TelemetrySource {
  /** Feed the current rAF timestamp each frame to update frame-timing metrics. */
  tick(now: number): void;
  /** Read the latest coherent snapshot. */
  read(): Sample;
  dispose(): void;
}

const FRAME_WINDOW = 48; // frames retained for the jitter estimate
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function createTelemetry(): TelemetrySource {
  // ── frame timing ──────────────────────────────────────────────────────────
  const deltas = new Float32Array(FRAME_WINDOW);
  let dIdx = 0;
  let dCount = 0;
  let lastNow = -1;
  let fps = 60;
  let frameMs = 16.7;
  let jankSmoothed = 0;

  // ── pointer restlessness ────────────────────────────────────────────────────
  let lastPx = 0;
  let lastPy = 0;
  let lastPt = 0;
  let lastAngle = 0;
  let havePointer = false;
  let restAccum = 0; // decaying energy
  let restlessness = 0;

  // ── battery (async, may never resolve) ──────────────────────────────────────
  let battery: BatteryInfo | null = null;
  let batteryMgr: BatteryManager | null = null;
  const onBatteryChange = () => {
    if (batteryMgr) {
      battery = { level: batteryMgr.level, charging: batteryMgr.charging };
    }
  };

  // ── network ─────────────────────────────────────────────────────────────────
  const conn = (
    navigator as unknown as { connection?: NavConnection }
  ).connection;

  // ── pointer listeners ────────────────────────────────────────────────────────
  const onPointerMove = (e: PointerEvent) => {
    const t = performance.now();
    if (havePointer) {
      const dt = Math.max(1, t - lastPt);
      const dx = e.clientX - lastPx;
      const dy = e.clientY - lastPy;
      const dist = Math.hypot(dx, dy);
      const speed = dist / dt; // px per ms
      const angle = Math.atan2(dy, dx);
      let dAng = Math.abs(angle - lastAngle);
      if (dAng > Math.PI) dAng = 2 * Math.PI - dAng;
      // restlessness = fast movement + frequent direction change
      restAccum += speed * (0.6 + dAng / Math.PI) * 0.5;
      lastAngle = angle;
    }
    lastPx = e.clientX;
    lastPy = e.clientY;
    lastPt = t;
    havePointer = true;
  };

  window.addEventListener("pointermove", onPointerMove, { passive: true });

  // getBattery is a Promise on some engines; guard it thoroughly.
  const getBattery = (
    navigator as unknown as {
      getBattery?: () => Promise<BatteryManager>;
    }
  ).getBattery;
  if (typeof getBattery === "function") {
    try {
      getBattery
        .call(navigator)
        .then((mgr) => {
          batteryMgr = mgr;
          battery = { level: mgr.level, charging: mgr.charging };
          mgr.addEventListener("levelchange", onBatteryChange);
          mgr.addEventListener("chargingchange", onBatteryChange);
        })
        .catch(() => {
          /* unsupported — stays null */
        });
    } catch {
      /* ignore */
    }
  }

  function tick(now: number): void {
    if (lastNow >= 0) {
      const d = now - lastNow;
      if (d > 0 && d < 1000) {
        deltas[dIdx] = d;
        dIdx = (dIdx + 1) % FRAME_WINDOW;
        if (dCount < FRAME_WINDOW) dCount++;
        frameMs = frameMs + (d - frameMs) * 0.25;
        const instFps = 1000 / d;
        fps = fps + (instFps - fps) * 0.1;
      }
    }
    lastNow = now;

    // pointer energy decays continuously toward calm
    restAccum *= 0.92;
    const restTarget = clamp01(restAccum * 0.12);
    restlessness = restlessness + (restTarget - restlessness) * 0.15;
  }

  function readMem(): MemInfo | null {
    const m = (performance as unknown as { memory?: PerfMemory }).memory;
    if (!m || !m.jsHeapSizeLimit) return null;
    return {
      used: m.usedJSHeapSize,
      limit: m.jsHeapSizeLimit,
      ratio: clamp01(m.usedJSHeapSize / m.jsHeapSizeLimit),
    };
  }

  function readNet(): NetInfo | null {
    if (!conn) return null;
    return {
      effectiveType: conn.effectiveType ?? "unknown",
      downlink: typeof conn.downlink === "number" ? conn.downlink : 0,
      rtt: typeof conn.rtt === "number" ? conn.rtt : 0,
    };
  }

  function computeJank(): number {
    if (dCount < 4) return 0;
    // mean + variance of retained frame deltas
    let mean = 0;
    for (let i = 0; i < dCount; i++) mean += deltas[i];
    mean /= dCount;
    let varSum = 0;
    for (let i = 0; i < dCount; i++) {
      const e = deltas[i] - mean;
      varSum += e * e;
    }
    const std = Math.sqrt(varSum / dCount);
    // normalize: ~4ms std is smooth, ~24ms is badly janky
    const raw = clamp01((std - 3) / 21);
    jankSmoothed = jankSmoothed + (raw - jankSmoothed) * 0.08;
    return jankSmoothed;
  }

  function read(): Sample {
    const jank = computeJank();
    const mem = readMem();
    const net = readNet();
    const memPressure = mem ? mem.ratio : 0.3;
    // aggregate strain: jank dominates, memory + restlessness contribute
    const load = clamp01(jank * 0.6 + memPressure * 0.28 + restlessness * 0.22);
    return {
      fps,
      frameMs,
      jank,
      mem,
      net,
      battery,
      restlessness,
      load,
      cores: navigator.hardwareConcurrency || 0,
      dpr: window.devicePixelRatio || 1,
      visible: document.visibilityState === "visible",
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  }

  function dispose(): void {
    window.removeEventListener("pointermove", onPointerMove);
    if (batteryMgr) {
      batteryMgr.removeEventListener("levelchange", onBatteryChange);
      batteryMgr.removeEventListener("chargingchange", onBatteryChange);
      batteryMgr = null;
    }
  }

  return { tick, read, dispose };
}
