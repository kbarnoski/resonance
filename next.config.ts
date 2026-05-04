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

// CSP for the app — *enforced*. Kept loose so production traffic
// works while we validate a tighter version in Report-Only mode (see
// CSP_REPORT_ONLY_DIRECTIVES below). Needs 'unsafe-eval' +
// 'wasm-unsafe-eval' because @tensorflow/tfjs + @spotify/basic-pitch
// compile WASM at runtime. Needs 'unsafe-inline' for Next.js runtime
// scripts and Tailwind inline styles.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:",
  // Google Fonts stylesheets are loaded at runtime by journey/poetry code.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  // data: needed by primeAudioElement (silent WAV used to unlock <audio>
  // on first user gesture so subsequent track plays don't get blocked).
  "media-src 'self' data: blob: https:",
  // Google Fonts ship the actual woff2 files from fonts.gstatic.com.
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https: wss: blob:",
  "worker-src 'self' blob:",
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
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: CSP_DIRECTIVES },
];

const nextConfig: NextConfig = {
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
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  outputFileTracingIncludes: {
    "/api/audio/[id]": ["./node_modules/ffmpeg-static/**/*"],
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
