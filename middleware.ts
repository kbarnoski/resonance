import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
 * a release cycle before promoting to enforcement. Inline scripts that
 * Next.js generates automatically (runtime bootstrap, hydration) get
 * the nonce attached when the CSP header is set in middleware — that's
 * why this lives here rather than in next.config.ts.
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

export async function middleware(request: NextRequest) {
  // Generate the nonce per-request. Used for the Report-Only CSP.
  const cspNonce = generateCspNonce();

  // Forward the nonce to the page render via a custom header so any
  // server component that needs to emit `<script nonce={nonce}>` can
  // read it via `headers().get('x-csp-nonce')`. Next.js itself reads
  // the CSP header below to nonce its automatic inline scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-csp-nonce", cspNonce);

  let supabaseResponse = NextResponse.next({
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
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users to login (except for auth and public pages)
  const pathname = request.nextUrl.pathname;
  const isAuthPage = pathname === "/login" || pathname === "/signup" || pathname === "/forgot-password" || pathname === "/update-password" || pathname.startsWith("/auth/callback");

  const isPublicRoute =
    pathname.startsWith("/share/") ||
    pathname.startsWith("/journey/") ||
    pathname.startsWith("/path/") ||
    // Browsers POST CSP violation reports without credentials. Without
    // an allowlist entry, the middleware would redirect those POSTs
    // to /login and we'd never see violations.
    pathname === "/api/csp-report" ||
    (pathname.startsWith("/room/") &&
      pathname !== "/room/installation" &&
      pathname.split("/").length === 3);

  if (!user && !isAuthPage && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages (except update-password which requires auth)
  if (user && isAuthPage && pathname !== "/update-password") {
    const url = request.nextUrl.clone();
    url.pathname = "/library";
    return NextResponse.redirect(url);
  }

  // Static security headers (X-Frame-Options, etc.) and the *enforced*
  // CSP live in next.config.ts `headers()` — applied at the Vercel
  // edge before CDN caching, so they survive on prerendered pages
  // served from cache.
  //
  // The Report-Only CSP (with per-request nonce) is set here in
  // middleware because Next.js only auto-propagates nonces to its own
  // inline scripts when the CSP comes from a middleware-set header.
  supabaseResponse.headers.set(
    "Content-Security-Policy-Report-Only",
    buildReportOnlyCsp(cspNonce),
  );
  // Mirror the nonce on the response too so server components that
  // emit inline scripts can read it via `headers().get('x-csp-nonce')`.
  supabaseResponse.headers.set("x-csp-nonce", cspNonce);

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
