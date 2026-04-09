import { NextResponse } from "next/server";
import { writeFileSync, readFileSync } from "fs";

const SYNC_PATH = "/tmp/shader-prefs.json";

export async function POST(req: Request) {
  const data = await req.json();
  writeFileSync(SYNC_PATH, JSON.stringify(data, null, 2));
  return NextResponse.json({ ok: true });
}

export async function GET() {
  try {
    const raw = readFileSync(SYNC_PATH, "utf-8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ blocked: [], loved: [], deleted: [] });
  }
}
