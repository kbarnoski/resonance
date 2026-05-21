/**
 * POST /api/dream/vote
 *
 * Admin-only. Records or clears Karel's vote on a dream-lab prototype.
 *
 * Body: { slug: string, vote: -1 | 0 | 1 }
 *   1  → loved (heart)
 *  -1  → downvoted (thumbs-down)
 *   0  → cleared (neutral — row stays but with vote=0)
 *
 * Auth: requireAdmin() — returns 401 if no session, 403 if signed-in
 * user isn't ADMIN_EMAIL. Writes via the service-role client so the
 * dream_votes RLS (which only allows public SELECT) doesn't block the
 * upsert.
 */
import { NextRequest } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/require-admin";

const SLUG_RE = /^\d+-[\w-]+$/;
const VALID_VOTES = new Set([-1, 0, 1]);

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as { slug?: unknown; vote?: unknown };
  if (typeof b.slug !== "string" || !SLUG_RE.test(b.slug)) {
    return Response.json({ error: "Invalid or missing slug" }, { status: 400 });
  }
  if (typeof b.vote !== "number" || !VALID_VOTES.has(b.vote)) {
    return Response.json(
      { error: "vote must be -1, 0, or 1" },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return Response.json(
      { error: "Server not configured for admin writes" },
      { status: 500 }
    );
  }

  const svc = createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await svc
    .from("dream_votes")
    .upsert(
      { slug: b.slug, vote: b.vote, updated_at: new Date().toISOString() },
      { onConflict: "slug" }
    );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, slug: b.slug, vote: b.vote });
}
