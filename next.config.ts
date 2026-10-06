import type { NextConfig } from "next";
import { execSync } from "node:child_process";

// Resolve a short git commit hash at build time so the running app can show
// which build it is. Falls back gracefully when git isn't available (e.g. inside
// a Docker build context that doesn't have the .git directory).
function gitShortSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";
  }
}

const BUILD_COMMIT = gitShortSha();
const BUILD_TIME = new Date().toISOString();

// ─── Dream-lab project split (2026-09-27) ───
// Two Vercel projects build this one repo (see scripts/prune-for-target.mjs):
//   BUILD_TARGET=core  → the real app, dream routes pruned; /dream/* is
//                        transparently proxied to DREAM_ORIGIN so every
//                        public URL keeps working unchanged.
//   BUILD_TARGET=dream → full app on resonance-dream.vercel.app; its
//                        chunks/CSS get an ABSOLUTE assetPrefix so pages
//                        served through the core-domain proxy still load
//                        their static assets from the dream deployment.
// Neither var set (local dev, kiosk, CI tests) → single full app,
// exactly as before.
const DREAM_ORIGIN = process.env.DREAM_ORIGIN; // e.g. https://resonance-dream.vercel.app
const IS_DREAM_TARGET = process.env.BUILD_TARGET === "dream";

// CSP for the app — *enforced*. Kept loose so production traffic
// works while we validate a tighter version in Report-Only mode (see
// CSP_REPORT_ONLY_DIRECTIVES below). Needs 'unsafe-eval' +
// 'wasm-unsafe-eval' because @tensorflow/tfjs + @spotify/basic-pitch
// compile WASM at runtime. Needs 'unsafe-inline' for Next.js runtime
// scripts and Tailwind inline styles.
// Project split: dream pages served through the core-domain /dream proxy
// load their chunks, CSS and next/font woff2 files from DREAM_ORIGIN
// (absolute assetPrefix). Under a 'self'-only policy the browser blocked
// ALL of them — every proxied /dream page rendered unstyled (Times on
// white, no Resonance tokens/fonts) and no client JS ran (2026-09-28 →
// 2026-10-05). The dream origin must be allowed for script/style/font.
const DREAM_ASSET_SRC = DREAM_ORIGIN ? ` ${new URL(DREAM_ORIGIN).origin}` : "";

const CSP_DIRECTIVES = [
  "default-src 'self'",
  // cdn.jsdelivr.net: dream prototypes import ESM modules at runtime (MediaPipe
  // FaceLandmarker, three.js addons, etc.) via dynamic import(), which is
  // governed by script-src — without this the CDN module load is blocked and
  // camera/face-tracking prototypes silently fall back to their self-demo.
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net${DREAM_ASSET_SRC}`,
  // Google Fonts stylesheets are loaded at runtime by journey/poetry code.
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com${DREAM_ASSET_SRC}`,
  "img-src 'self' data: blob: https:",
  // data: needed by primeAudioElement (silent WAV used to unlock <audio>
  // on first user gesture so subsequent track plays don't get blocked).
  "media-src 'self' data: blob: https:",
  // Google Fonts ship the actual woff2 files from fonts.gstatic.com.
  `font-src 'self' data: https://fonts.gstatic.com${DREAM_ASSET_SRC}`,
  "connect-src 'self' https: wss: blob:",
  `worker-src 'self' blob:${DREAM_ASSET_SRC}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  // Capture violations from the enforced policy too — anything we're
  // currently allowing-but-uncomfortable-with shows up here.
  "report-uri /api/csp-report",
].join("; ");

// The tighter Report-Only CSP moved to middleware.ts so it can include
// a per-request nonce. Next.js only propagates nonces to its own
// runtime inline scripts when the CSP header is set in middleware
// (not in next.config.ts headers()). The enforced CSP above stays
// here because it doesn't need a nonce and benefits from being
// applied at the Vercel edge before CDN cache.

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: CSP_DIRECTIVES },
];

const nextConfig: NextConfig = {
  // Local previews MUST NOT share .next with the kiosk's production server
  // (2026-10-05: a `next dev` preview overwrote the build the kiosk serves).
  // NEXT_DIST_DIR=.next-preview npx next dev -p 3100
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Dream project only: absolute asset URLs so chunks/CSS resolve when the
  // page HTML is served through the core domain's /dream proxy.
  ...(IS_DREAM_TARGET && DREAM_ORIGIN ? { assetPrefix: DREAM_ORIGIN } : {}),
  env: {
    NEXT_PUBLIC_BUILD_COMMIT: BUILD_COMMIT,
    NEXT_PUBLIC_BUILD_TIME: BUILD_TIME,
  },
  async headers() {
    return [
      {
        // All routes — Next.js applies these at the Vercel edge before the
        // CDN cache, which middleware can't reach for prerendered pages.
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
  async redirects() {
    return [
      { source: "/visualizer", destination: "/room", permanent: true },
      { source: "/visualizer/installation", destination: "/room/installation", permanent: true },
    ];
  },
  async rewrites() {
    return [
      // Three shareable URLs for the installation experience:
      //   /demo          — plays through ONCE then ends (the
      //                    review/share version)
      //   /snowflake     — same as /demo, branded as the EP name.
      //                    Use this when sharing the EP itself
      //                    (Snowflake, Realized, Ghost) as a link.
      //   /installation  — loops forever (the real gallery kiosk;
      //                    same as the canonical /room/installation?loop=1)
      // All are internal rewrites — the address bar stays clean.
      { source: "/demo", destination: "/room/installation?loop=1&once=1" },
      { source: "/snowflake", destination: "/room/installation?loop=1&once=1" },
      { source: "/installation", destination: "/room/installation?loop=1" },
      // Project split: on the pruned core build, /dream/* proxies to the
      // dream project. The address bar stays on the core domain, proto
      // API routes (/dream/*/api/*) pass through with all methods, and
      // relative fetches from proto code (/api/ai-image, /api/audio)
      // land on the core origin, which serves both.
      // CORE ONLY: the dream build also has DREAM_ORIGIN (for its
      // assetPrefix) — with the rewrite active there, any 404 fell
      // through to a proxy pointed at ITSELF (508 loop, 2026-09-28).
      ...(DREAM_ORIGIN && !IS_DREAM_TARGET
        ? [
            { source: "/dream", destination: `${DREAM_ORIGIN}/dream` },
            { source: "/dream/:path*", destination: `${DREAM_ORIGIN}/dream/:path*` },
          ]
        : []),
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // Cap build workers: with NODE_OPTIONS max-old-space-size (needed to
    // compile the 1,160-proto dream lab), a per-CPU worker fleet each
    // reserving that heap can make macOS refuse the spawns entirely
    // (`spawn EBADF` at "Generating static pages" — seen 2026-08-30).
    // 110 static pages need nowhere near a full fleet.
    cpus: 4,
  },
  outputFileTracingIncludes: {
    "/api/audio/[id]": ["./node_modules/ffmpeg-static/**/*"],
    // The dynamic per-path OG card reads the satori TTFs with fs at
    // request time, but Vercel strips public/ from lambda bundles
    // (CDN-served) — verified 2026-08-26: ENOENT in prod. Force-trace.
    "/path/[token]/opengraph-image": ["./public/fonts/*.ttf"],
    // The /dream index renders in a lambda (the dream layout's
    // force-dynamic wins over its force-static) and reads the digest
    // markdowns at request time — trace them in. The proto catalog
    // itself is bundled JSON (see scripts/generate-dream-catalog.mjs).
    "/dream": ["./docs/dreams/MORNING.md", "./docs/dreams/STATE.md"],
  },
  // The 12GB offline Tramokyo pack lives in public/ on the kiosk laptop
  // only (gitignored). CI deploys never see it, but a LOCAL `vercel
  // deploy` does — and /api/audio's fs reads made Next trace the whole
  // pack into the lambda (11.6GB function, hard deploy failure,
  // 2026-09-27). Excluded from tracing everywhere; prod behavior is
  // unchanged since the pack is never uploaded.
  outputFileTracingExcludes: {
    "*": ["./public/tramokyo-pack/**"],
  },
  webpack: (config, { isServer }) => {
    // Exclude TensorFlow.js and Basic Pitch from server-side bundling
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push("@tensorflow/tfjs", "@spotify/basic-pitch", "ffmpeg-static");
    }
    return config;
  },
};

export default nextConfig;
