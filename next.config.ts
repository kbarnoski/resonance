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

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_COMMIT: BUILD_COMMIT,
    NEXT_PUBLIC_BUILD_TIME: BUILD_TIME,
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
