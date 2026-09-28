import { NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Clip review API (Karel 2026-09-28): backs /review/clips — the kiosk
 * page where Karel plays every hero clip / travel morph RAW and marks
 * it good or bad. Verdicts land in docs/clip-review.json, which the
 * regeneration pipeline treats as ground truth (bad clips get re-rolled
 * or replaced; the file is committed as part of the content record).
 *
 * Kiosk/dev only: requires the offline pack (OFFLINE_PACK=1) or a dev
 * server — the Vercel deployments have no pack and no writable disk.
 */

export const dynamic = "force-dynamic";

const ROOT = process.cwd();
const REVIEW_PATH = path.join(ROOT, "docs", "clip-review.json");

function gated(): boolean {
  return process.env.OFFLINE_PACK === "1" || process.env.NODE_ENV === "development";
}

async function readJson<T>(p: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(p, "utf8")) as T; } catch { return fallback; }
}

type ClipEntry = string | { h264: string; hevc?: string };

export async function GET() {
  if (!gated()) return NextResponse.json({ error: "not available" }, { status: 404 });

  const clipsMap = await readJson<Record<string, Record<string, ClipEntry>>>(
    path.join(ROOT, "public/tramokyo-pack/local-clips.json"), {});
  const rows = await readJson<Array<{ id: string; name?: string }>>(
    path.join(ROOT, "public/tramokyo-pack/data/journeys.json"), []);
  const names = new Map(rows.map((r) => [r.id, r.name ?? r.id]));
  const verdicts = await readJson<Record<string, { verdict: string; at: string }>>(REVIEW_PATH, {});

  const journeys = Object.entries(clipsMap).map(([jid, clips]) => ({
    id: jid,
    name: names.get(jid) ?? jid,
    clips: Object.entries(clips)
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([key, entry]) => ({
        key,
        // Always review the H.264 variant — it's what most playback uses.
        url: typeof entry === "string" ? entry : entry.h264,
      })),
  })).sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ journeys, verdicts });
}

export async function POST(req: Request) {
  if (!gated()) return NextResponse.json({ error: "not available" }, { status: 404 });
  const body = await req.json().catch(() => null) as
    { journeyId?: string; clipKey?: string; verdict?: "good" | "bad" | null } | null;
  if (!body?.journeyId || !body?.clipKey || body.verdict === undefined) {
    return NextResponse.json({ error: "journeyId, clipKey, verdict required" }, { status: 400 });
  }
  const verdicts = await readJson<Record<string, { verdict: string; at: string }>>(REVIEW_PATH, {});
  const id = `${body.journeyId}/${body.clipKey}`;
  if (body.verdict === null) delete verdicts[id];
  else verdicts[id] = { verdict: body.verdict, at: new Date().toISOString() };
  await mkdir(path.dirname(REVIEW_PATH), { recursive: true });
  await writeFile(REVIEW_PATH, JSON.stringify(verdicts, null, 1) + "\n");
  return NextResponse.json({ ok: true, count: Object.keys(verdicts).length });
}
