import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Root middleware — DEFAULT-ALLOW.
 *
 * History: a previous version of this file lived at the repo root and
 * therefore NEVER EXECUTED (Next 15 only scans `src/` when the app
 * lives in `src/app`). That dead file was written default-deny with a
 * public-route allowlist; naively reviving it would have broken anon
 * Welcome Home playback, the dream lab, and the Tramokyo kiosk.
 *
 * This rewrite inverts the model deliberately (owner decision,
 * 2026-08-25 audit P1-2):
 *
 *   1. Refresh the Supabase session cookie on every request — the
 *      standard @supabase/ssr pattern. Server components create their
 *      clients via src/lib/supabase/server.ts, which cannot always
 *      write cookies; middleware is the one place refresh reliably
 *      sticks.
 *   2. Attach security headers + the nonce-based Report-Only CSP.
 *      The *enforced* CSP and the same static headers also live in
 *      next.config.ts headers() (they survive CDN-cached prerenders
 *      there); setting them here too is belt-and-suspenders. The
 *      Report-Only CSP MUST be set here: Next.js only propagates
 *      nonces to its own inline scripts when the CSP header comes
 *      from middleware.
 *   3. Redirect unauthenticated users ONLY on known-private path
 *      prefixes (the (studio) routes below). Everything else —
 *      including ALL /api/*, /room, /path, /journey, /share, /dream,
 *      /remote, /installation — passes through untouched. Every API
 *      route already self-protects (auth, origin checks, rate
 *      limits, RLS), so the worst case here is redundancy, never
 *      breakage. The dream lab and share links stay login-free BY
 *      DESIGN — do not add them to the private list.
 */

/** Route prefixes that require a signed-in user — the (studio) group.
 *  These are ALSO protected by src/app/(studio)/layout.tsx; this
 *  redirect is defense-in-depth, not the primary gate. */
const PRIVATE_PREFIXES = [
  "/library",
  "/upload",
  "/recording",
  "/compare",
  "/collections",
  "/insights",
  "/paths",
  "/create",
  "/edit",
  "/settings",
  "/batch-analyze",
];

function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Build the Report-Only CSP for this request.
 *
 * Tighter than the enforced policy in next.config.ts: specific upstream
 * allowlists in place of `https:`/`wss:` wildcards, and a per-request
 * nonce on script-src in place of `'unsafe-inline'`. `'strict-dynamic'`
 * lets nonced scripts load further scripts of their own without us
 * having to enumerate every possible loader.
 *
 * Shipped in Report-Only mode so we can collect violation reports for
 * a release cycle before promoting to enforcement.
 */
function buildReportOnlyCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' 'wasm-unsafe-eval' blob:`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://*.supabase.co https://*.fal.media https://fal.media https://v3.fal.media",
    "media-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.fal.run https://fal.run https://*.fal.ai https://*.fal.media https://fal.media https://api.openai.com https://api.anthropic.com wss://*.fal.run wss://*.fal.ai blob:",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "report-uri /api/csp-report",
  ].join("; ");
}

function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // base64-encode without depending on Buffer (works in edge runtime)
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Static security headers, mirrored from next.config.ts headers()
 *  (belt-and-suspenders — see file header). Keep the two in sync. */
function applySecurityHeaders(response: NextResponse, nonce: string) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(self), geolocation=()",
  );
  response.headers.set(
    "Content-Security-Policy-Report-Only",
    buildReportOnlyCsp(nonce),
  );
  // Mirror the nonce on the response so server components that emit
  // inline scripts can read it via `headers().get('x-csp-nonce')`.
  response.headers.set("x-csp-nonce", nonce);
}

export async function middleware(request: NextRequest) {
  // Generate the nonce per-request. Used for the Report-Only CSP.
  const cspNonce = generateCspNonce();

  // Forward the nonce to the page render via a custom header so any
  // server component that needs to emit `<script nonce={nonce}>` can
  // read it via `headers().get('x-csp-nonce')`. Next.js itself reads
  // the CSP header set below to nonce its automatic inline scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-csp-nonce", cspNonce);

  // Tramokyo offline mode: local kiosk laptop, trusted operator, no
  // Supabase reachable. Skip auth entirely (no login redirects, no
  // session refresh) — every page reads from the local content pack.
  // Mirrors the isOfflinePack() skip in (studio)/layout.tsx. Never set
  // OFFLINE_PACK on Vercel.
  if (process.env.OFFLINE_PACK === "1") {
    const offlineResponse = NextResponse.next({
      request: { headers: requestHeaders },
    });
    applySecurityHeaders(offlineResponse, cspNonce);
    return offlineResponse;
  }

  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session on every request (the whole point of running
  // Supabase in middleware). getUser() validates against the auth
  // server and rotates the cookie when needed; with no auth cookies
  // present it short-circuits locally, so anonymous traffic (dream
  // lab, share links, kiosk) pays nothing here.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Auth being unreachable must NEVER take down public pages —
    // default-allow means we fail open. Private routes still have the
    // (studio) layout + per-route auth behind this.
    user = null;
  }

  const pathname = request.nextUrl.pathname;
  const isAuthPage =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname === "/update-password" ||
    pathname.startsWith("/auth/callback");

  // Redirect unauthenticated users ONLY on known-private prefixes.
  if (!user && isPrivatePath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("redirectTo", pathname);
    const redirect = NextResponse.redirect(url);
    applySecurityHeaders(redirect, cspNonce);
    return redirect;
  }

  // Signed-in users hitting auth pages go to the library
  // (update-password legitimately runs with a session).
  if (user && isAuthPage && pathname !== "/update-password") {
    const url = request.nextUrl.clone();
    url.pathname = "/library";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    applySecurityHeaders(redirect, cspNonce);
    return redirect;
  }

  applySecurityHeaders(response, cspNonce);
  return response;
}

export const config = {
  matcher: [
    // Everything except Next static assets, image optimizer output,
    // the favicon, and public files with common static extensions.
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|json|mp3|m4a|wav|woff2?|ttf)$).*)",
  ],
};
