import { ensureVisibilityTracking, hiddenSince } from "./visibility-epoch";
/**
 * Visual flight recorder (Karel 2026-09-28: "do further scientific
 * analysis... something is off and we're going in circles for months").
 *
 * Always-on, near-zero-cost ring buffer of every discrete visual event
 * in the render stack — layer pushes/evictions, video start/end, shader
 * switches (primary/dual/tertiary), parallax mixes, flashes, overlay
 * clones, journey boundaries — PLUS real dropped-frame detection via
 * rAF gap monitoring. The buffer auto-uploads to the kiosk server every
 * 20s and at every journey change, appending JSONL to
 * docs/glitch-events.jsonl. Reproduce a glitch once, note the rough
 * wall-clock moment, and the log names the culprit.
 */

type GlitchEvent = { t: number; wall: string; type: string; detail?: string };

const BUFFER_MAX = 3000;
const buffer: GlitchEvent[] = [];
let uploaderStarted = false;
let rafMonitorStarted = false;
// Monotonic counts, not buffer indices (2026-10-09): the ring trim used to
// leave an index pinned at BUFFER_MAX, so every session went silent after
// its first ~3000 events — about 50 min into a soak.
let emitted = 0;
let uploaded = 0;
const sessionId = Math.random().toString(36).slice(2, 8);

/** Every event goes through here. REVIEW TAP (2026-10-07, opt-in, zero cost
 *  when off): the journey-review rig (scripts/journey-review/record.mjs)
 *  installs window.__resonanceGlitchTap to receive each event in real time —
 *  the 20 s uploads lose their tail when a review page closes. */
function emit(ev: GlitchEvent): void {
  buffer.push(ev);
  emitted++;
  if (buffer.length > BUFFER_MAX) buffer.splice(0, buffer.length - BUFFER_MAX);
  const tap = (window as unknown as { __resonanceGlitchTap?: (e: GlitchEvent) => void }).__resonanceGlitchTap;
  if (tap) { try { tap(ev); } catch { /* rig-side error never touches the app */ } }
}

export function glitchRecord(type: string, detail?: string): void {
  if (typeof window === "undefined") return;
  emit({
    t: Math.round(performance.now()),
    wall: new Date().toISOString().slice(11, 23),
    type,
    detail,
  });
  startMonitors();
}

async function upload(reason: string): Promise<void> {
  const from = Math.max(uploaded, emitted - buffer.length);
  const pending = buffer.slice(from - (emitted - buffer.length));
  if (pending.length === 0) return;
  uploaded = emitted;
  try {
    const res = await fetch("/api/review/glitch-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: sessionId, reason, events: pending }),
      keepalive: true,
    });
    // 5xx = restarting → retry later; 4xx = not a kiosk (prod) → drop, never accumulate
    if (res.status >= 500) throw new Error(String(res.status));
  } catch {
    // offline / server restarting (2026-10-07: a ~65 s deploy restart erased
    // the very window being debugged) — keep the events for the next flush
    uploaded = Math.min(uploaded, from);
  }
}

/** Journey boundaries are the hotspot — flush immediately. */
export function glitchFlush(reason: string): void {
  if (typeof window === "undefined") return;
  void upload(reason);
}

function startMonitors(): void {
  if (typeof window === "undefined") return;
  if (!uploaderStarted) {
    uploaderStarted = true;
    setInterval(() => void upload("interval"), 20_000);
    // Short sessions must not vanish (a 60s viewing killed by a server
    // restart lost its evidence, 2026-09-28): flush on hide/unload too.
    // fetch keepalive lets the request outlive the page.
    window.addEventListener("pagehide", () => void upload("pagehide"));
    document.addEventListener("visibilitychange", () => {
      // every visibility change is on the record (a hidden kiosk window is not a freeze)
      emit({ t: Math.round(performance.now()), wall: new Date().toISOString().slice(11, 23), type: "visibility", detail: document.visibilityState });
      if (document.visibilityState === "hidden") void upload("hidden");
    });
  }
  if (!rafMonitorStarted) {
    rafMonitorStarted = true;
    // Attribution for the long frames (2026-10-08): a FRAME-GAP says THAT a
    // frame was late, LoAF says whether script (block>0, with the culprit
    // function@file:pos) or the GPU/compositor (block 0, rendering started
    // late) held it — read from inside the real kiosk, where probes differ.
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as PerformanceEntry[] & { blockingDuration?: number; renderStart?: number; scripts?: { duration: number; sourceFunctionName?: string; sourceURL?: string; sourceCharPosition?: number; invoker?: string }[] }[]) {
          if (e.duration < 60) continue; // was 150 — hid every 60-110 ms hitch (2026-10-09)
          const top = (e.scripts ?? []).filter((x) => x.duration >= 20).sort((a, b) => b.duration - a.duration).slice(0, 3)
            .map((x) => `${x.sourceFunctionName || x.invoker || "?"}@${(x.sourceURL || "").split("/").pop()}:${x.sourceCharPosition ?? "?"} ${Math.round(x.duration)}ms`).join(" | ");
          emit({
            t: Math.round(e.startTime + e.duration),
            wall: new Date().toISOString().slice(11, 23),
            type: "loaf",
            detail: `${Math.round(e.duration)}ms block ${Math.round(e.blockingDuration ?? 0)} render+${e.renderStart ? Math.round(e.renderStart - e.startTime) : "?"}${top ? " " + top : ""}`,
          });
        }
      }).observe({ type: "long-animation-frame", buffered: false });
    } catch { /* LoAF unsupported */ }
    ensureVisibilityTracking();
    let last = performance.now();
    const tick = (now: number) => {
      const gap = now - last;
      const wasHidden = hiddenSince(last);
      last = now;
      // >80ms between frames = at least 4 dropped frames at 60Hz —
      // a gap a viewer can see on moving content.
      // >80ms = FRAME-GAP (4+ dropped frames, viewer-visible on motion).
      // 50-80ms = micro-gap: logged for forensics — Karel has spotted
      // flickers in sessions with zero 80ms gaps, so the recorder must
      // see below its old floor.
      if (gap > 50) {
        emit({
          t: Math.round(now),
          wall: new Date().toISOString().slice(11, 23),
          // a gap that spans a hidden window is the browser pausing, not a glitch
          type: wasHidden ? "hidden-gap" : gap > 80 ? "FRAME-GAP" : "microgap",
          detail: `${Math.round(gap)}ms`,
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
