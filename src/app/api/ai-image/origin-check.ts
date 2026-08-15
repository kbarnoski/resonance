/**
 * Origin / Referer allowlist for the ai-image routes.
 *
 * Mirrors the allowlist logic in src/app/dream/_shared/api-guard.ts
 * (the reference implementation) — deliberately copied rather than
 * imported so API routes outside /dream don't depend on dream-tree
 * internals. Keep the two pattern lists in sync.
 *
 * These routes stay ANONYMOUS by design (the /installation kiosk and
 * /demo run without a session). The allowlist only rejects requests
 * that don't originate from a known Resonance origin — same-origin
 * pages (/installation, /dream, /demo) always pass.
 */

const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  // Production custom domain — getresonance.vercel.app.
  /^https:\/\/getresonance\.vercel\.app$/,
  // Vercel-assigned preview & production URLs in this team scope:
  //   https://resonance-...-kbarnoski-5224s-projects.vercel.app
  //   https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app
  /^https:\/\/resonance(-[\w-]+)?-kbarnoski-5224s-projects\.vercel\.app$/,
  /^https:\/\/resonance\.vercel\.app$/,
  // Local dev.
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
];

function originOrReferer(req: Request): string {
  const origin = req.headers.get("origin");
  if (origin) return origin;
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // bad referer — fall through
    }
  }
  return "";
}

/**
 * Returns a 403 Response when the request doesn't originate from an
 * allowed Resonance origin, or null to pass. Never demands auth.
 */
export function checkOrigin(req: Request): Response | null {
  const origin = originOrReferer(req);
  if (!origin || !ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}
