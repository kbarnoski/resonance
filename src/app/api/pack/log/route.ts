import { appendFile, stat, rename } from "fs/promises";
import { isOfflinePack } from "@/lib/offline/pack";

// ── Kiosk flight recorder (Tramokyo, offline-pack only) ─────────────────
// The loop client posts key lifecycle events (journey start, advance
// reason, stall, wedge reload, statement, errors) and the server appends
// them — timestamped — to a plain-text log that SURVIVES page reloads.
// Overnight failures stop being archaeology: read the file, see the
// night. 404s in production exactly like the /api/pack/remote bus.
const LOG_PATH = "/tmp/tramokyo-events.log";
// Security (2026-09-25 M-2): unbounded appendFile let anyone on the venue
// hotspot fill the kiosk disk. Rotate at 10MB (one .1 generation kept) and
// throttle per-IP to 5 events/sec in memory.
const MAX_LOG_BYTES = 10 * 1024 * 1024;
const ipWindow = new Map<string, { count: number; resetAt: number }>();
function throttled(request: Request): boolean {
  const real = request.headers.get("x-real-ip");
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  const hops = fwd.split(",").map((h) => h.trim()).filter(Boolean);
  const ip = real || hops[hops.length - 1] || "local";
  const now = Date.now();
  const w = ipWindow.get(ip);
  if (!w || now > w.resetAt) {
    ipWindow.set(ip, { count: 1, resetAt: now + 1000 });
    return false;
  }
  w.count++;
  return w.count > 5;
}

export async function POST(request: Request) {
  if (!isOfflinePack()) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  try {
    const { event } = (await request.json()) as { event?: string };
    if (typeof event !== "string" || event.length === 0 || event.length > 500) {
      return Response.json({ error: "bad event" }, { status: 400 });
    }
    if (throttled(request)) {
      return Response.json({ error: "slow down" }, { status: 429 });
    }
    try {
      const st = await stat(LOG_PATH);
      if (st.size > MAX_LOG_BYTES) {
        await rename(LOG_PATH, `${LOG_PATH}.1`); // keep one generation
      }
    } catch { /* no log yet */ }
    const line = `${new Date().toISOString()} ${event}\n`;
    await appendFile(LOG_PATH, line);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "log write failed" }, { status: 500 });
  }
}
