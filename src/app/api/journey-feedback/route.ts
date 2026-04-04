import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const FEEDBACK_FILE = path.join(process.cwd(), "journey-feedback.jsonl");

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Support both single entry and batch array
    const entries = Array.isArray(body) ? body : [body];
    const lines = entries.map((e) => JSON.stringify(e) + "\n").join("");
    await fs.appendFile(FEEDBACK_FILE, lines, "utf-8");
    return NextResponse.json({ ok: true, count: entries.length });
  } catch (err) {
    console.error("[Journey Feedback] Write error:", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const raw = await fs.readFile(FEEDBACK_FILE, "utf-8");
    const entries = raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return NextResponse.json(entries);
  } catch {
    // File doesn't exist yet — return empty
    return NextResponse.json([]);
  }
}
