import { NextResponse } from "next/server";
import { writeFileSync, readFileSync } from "fs";
import { requireAdmin } from "@/lib/auth/require-admin";

// Persistence: Upstash KV when provisioned (same env vars the rate
// limiter uses), falling back to /tmp otherwise. /tmp is ephemeral on
// serverless — prefs silently reset on cold starts — so KV is the real
// store in production; /tmp remains fine for local dev.
const SYNC_PATH = "/tmp/shader-prefs.json";
const KV_KEY = "shader-prefs";
const EMPTY_PREFS = { blocked: [], loved: [], deleted: [] };

function kvConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function kvCommand(cmd: string[]): Promise<unknown> {
  const cfg = kvConfig();
  if (!cfg) throw new Error("KV not configured");
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`KV REST returned ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error(`KV error: ${json.error}`);
  return json.result;
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const data = await req.json();
  const serialized = JSON.stringify(data);
  if (kvConfig()) {
    await kvCommand(["SET", KV_KEY, serialized]);
  } else {
    writeFileSync(SYNC_PATH, serialized);
  }
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    if (kvConfig()) {
      const raw = await kvCommand(["GET", KV_KEY]);
      if (typeof raw !== "string") return NextResponse.json(EMPTY_PREFS);
      return NextResponse.json(JSON.parse(raw));
    }
    const raw = readFileSync(SYNC_PATH, "utf-8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json(EMPTY_PREFS);
  }
}
