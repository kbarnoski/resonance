/**
 * Admin-gating helper for API routes.
 *
 * Centralizes the "is the caller an admin" check that was previously
 * duplicated across several routes (with subtly different
 * implementations — some compared against `NEXT_PUBLIC_ADMIN_EMAIL`,
 * some against a server-only `ADMIN_EMAIL`, one didn't normalize case).
 *
 * The single source of truth is the server-only `ADMIN_EMAIL` env var.
 * Returning `null` means "allowed to proceed"; a Response means
 * "stop and return this".
 */
import { createClient } from "@/lib/supabase/server";

export interface AdminGateResult {
  user: { id: string; email: string | null };
}

export type AdminGateOutcome =
  | { ok: true; result: AdminGateResult }
  | { ok: false; response: Response };

export async function requireAdmin(): Promise<AdminGateOutcome> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) {
    // No admin configured — fail closed. Better than silently
    // letting any signed-in user run admin operations.
    return {
      ok: false,
      response: Response.json({ error: "Admin not configured" }, { status: 503 }),
    };
  }

  const userEmail = user.email?.trim().toLowerCase() ?? null;
  if (userEmail !== adminEmail) {
    return {
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    result: { user: { id: user.id, email: userEmail } },
  };
}

/**
 * Same as requireAdmin but returns a boolean — for routes that want to
 * branch on admin status (e.g. to allow extra parameters) rather than
 * fail outright on non-admin.
 */
export async function isAdmin(): Promise<boolean> {
  const result = await requireAdmin();
  return result.ok;
}
