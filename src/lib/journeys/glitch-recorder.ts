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
let lastUploadIdx = 0;
const sessionId = Math.random().toString(36).slice(2, 8);

export function glitchRecord(type: string, detail?: string): void {
  if (typeof window === "undefined") return;
  buffer.push({
    t: Math.round(performance.now()),
    wall: new Date().toISOString().slice(11, 23),
    type,
    detail,
  });
  if (buffer.length > BUFFER_MAX) buffer.splice(0, buffer.length - BUFFER_MAX);
  startMonitors();
}

async function upload(reason: string): Promise<void> {
  const pending = buffer.slice(lastUploadIdx);
  if (pending.length === 0) return;
  lastUploadIdx = buffer.length;
  try {
    await fetch("/api/review/glitch-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: sessionId, reason, events: pending }),
      keepalive: true,
    });
  } catch { /* offline or non-kiosk — recorder stays silent */ }
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
      if (document.visibilityState === "hidden") void upload("hidden");
    });
  }
  if (!rafMonitorStarted) {
    rafMonitorStarted = true;
    let last = performance.now();
    const tick = (now: number) => {
      const gap = now - last;
      last = now;
      // >80ms between frames = at least 4 dropped frames at 60Hz —
      // a gap a viewer can see on moving content.
      // >80ms = FRAME-GAP (4+ dropped frames, viewer-visible on motion).
      // 50-80ms = micro-gap: logged for forensics — Karel has spotted
      // flickers in sessions with zero 80ms gaps, so the recorder must
      // see below its old floor.
      if (gap > 50) {
        buffer.push({
          t: Math.round(now),
          wall: new Date().toISOString().slice(11, 23),
          type: gap > 80 ? "FRAME-GAP" : "microgap",
          detail: `${Math.round(gap)}ms`,
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
