import { NextResponse } from "next/server";
import { writeFileSync, readFileSync } from "fs";
import { requireAdmin } from "@/lib/auth/require-admin";

const SYNC_PATH = "/tmp/shader-prefs.json";

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const data = await req.json();
  writeFileSync(SYNC_PATH, JSON.stringify(data, null, 2));
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const raw = readFileSync(SYNC_PATH, "utf-8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ blocked: [], loved: [], deleted: [] });
  }
}
