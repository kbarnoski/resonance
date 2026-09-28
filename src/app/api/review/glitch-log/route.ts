import { NextResponse } from "next/server";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

/** Sink for the visual flight recorder (glitch-recorder.ts). Kiosk/dev
 *  only — appends JSONL to docs/glitch-events.jsonl for forensic
 *  correlation against Karel's observed glitch moments. */

export const dynamic = "force-dynamic";
const LOG = path.join(process.cwd(), "docs", "glitch-events.jsonl");

export async function POST(req: Request) {
  if (!(process.env.OFFLINE_PACK === "1" || process.env.NODE_ENV === "development")) {
    return NextResponse.json({ error: "not available" }, { status: 404 });
  }
  const body = await req.json().catch(() => null) as
    { session?: string; reason?: string; events?: Array<Record<string, unknown>> } | null;
  if (!body?.events?.length) return NextResponse.json({ ok: true, appended: 0 });
  const lines = body.events
    .map((e) => JSON.stringify({ session: body.session, ...e }))
    .join("\n") + "\n";
  await mkdir(path.dirname(LOG), { recursive: true });
  await appendFile(LOG, lines);
  return NextResponse.json({ ok: true, appended: body.events.length });
}
