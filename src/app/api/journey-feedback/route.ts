import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logger } from "@/lib/logger";

// Legacy .jsonl file kept for GET so historical entries aren't lost.
// All new writes go to the journey_feedback Supabase table.
const LEGACY_FEEDBACK_FILE = path.join(process.cwd(), "journey-feedback.jsonl");

type FeedbackEntry = Record<string, unknown> & { journeyId?: string | null };

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const entries: FeedbackEntry[] = Array.isArray(body) ? body : [body];

    if (entries.length === 0 || entries.length > 100) {
      return NextResponse.json({ error: "Invalid batch size" }, { status: 400 });
    }

    const rows = entries
      .filter((e) => e && typeof e === "object")
      .map((entry) => ({
        user_id: user.id,
        journey_id: typeof entry.journeyId === "string" ? entry.journeyId : null,
        payload: entry,
      }));

    const { error } = await supabase.from("journey_feedback").insert(rows);
    if (error) {
      logger.error("journey-feedback", "DB insert failed:", error.message);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (err) {
    logger.error("journey-feedback", "Write error:", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

export async function GET() {
  // Centralized admin gate (see src/lib/auth/require-admin.ts).
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const supabase = await createClient();
  const { data: dbRows } = await supabase
    .from("journey_feedback")
    .select("payload, created_at, journey_id")
    .order("created_at", { ascending: true });

  let legacy: unknown[] = [];
  try {
    const raw = await fs.readFile(LEGACY_FEEDBACK_FILE, "utf-8");
    legacy = raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    // No legacy file — fine.
  }

  const fromDb = (dbRows ?? []).map((r) => r.payload);
  return NextResponse.json([...legacy, ...fromDb]);
}
