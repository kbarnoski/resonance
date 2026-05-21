/**
 * GET /api/dream/me
 *
 * Tiny endpoint the dream-lab client uses to decide whether to render
 * the vote buttons. Returns { isAdmin: boolean } based on the
 * server-only ADMIN_EMAIL env var compared against the current
 * Supabase session email. Public visitors with no session get
 * { isAdmin: false }.
 *
 * The vote-write endpoint (POST /api/dream/vote) does its own
 * requireAdmin() check — this endpoint is purely for the UI to know
 * whether to *show* the buttons. Hiding them when not admin is a UX
 * nicety, not a security control.
 */
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return Response.json({ isAdmin: false });
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const isAdmin =
    !!adminEmail && user.email.trim().toLowerCase() === adminEmail;

  return Response.json({ isAdmin });
}
