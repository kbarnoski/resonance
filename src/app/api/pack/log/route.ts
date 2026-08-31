import { appendFile } from "fs/promises";
import { isOfflinePack } from "@/lib/offline/pack";

// ── Kiosk flight recorder (Tramokyo, offline-pack only) ─────────────────
// The loop client posts key lifecycle events (journey start, advance
// reason, stall, wedge reload, statement, errors) and the server appends
// them — timestamped — to a plain-text log that SURVIVES page reloads.
// Overnight failures stop being archaeology: read the file, see the
// night. 404s in production exactly like the /api/pack/remote bus.
const LOG_PATH = "/tmp/tramokyo-events.log";

export async function POST(request: Request) {
  if (!isOfflinePack()) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  try {
    const { event } = (await request.json()) as { event?: string };
    if (typeof event !== "string" || event.length === 0 || event.length > 500) {
      return Response.json({ error: "bad event" }, { status: 400 });
    }
    const line = `${new Date().toISOString()} ${event}\n`;
    await appendFile(LOG_PATH, line);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "log write failed" }, { status: 500 });
  }
}
