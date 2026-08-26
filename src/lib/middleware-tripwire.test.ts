import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";

/**
 * Middleware location tripwire.
 *
 * Next 15 (with the app under `src/app`) ONLY scans `src/` for a
 * middleware file. A `middleware.ts` at the repo root silently never
 * executes — which is exactly what happened for months: the security
 * headers, CSP, and auth allowlist it described were fiction
 * (2026-08-25 audit, "Protection that never existed").
 *
 * These tests fail the build if that regression ever reappears.
 */

const REPO_ROOT = path.resolve(__dirname, "../..");

describe("middleware location tripwire", () => {
  it("middleware must live at src/middleware.(ts|js), never at the repo root", () => {
    const rootCandidates = ["middleware.ts", "middleware.js", "middleware.mjs"];
    const strays = rootCandidates.filter((f) =>
      existsSync(path.join(REPO_ROOT, f)),
    );
    expect(
      strays,
      `Found ${strays.join(", ")} at the repo root — Next 15 will NEVER run it there. ` +
        "Move it to src/middleware.ts (and merge with the existing one).",
    ).toEqual([]);
  });

  it("if any middleware file exists, one must be at src/middleware.(ts|js)", () => {
    // Find middleware.* anywhere in the repo (excluding node_modules,
    // .next, and src-tauri build output).
    const found: string[] = [];
    const skip = new Set(["node_modules", ".next", ".git", "src-tauri", "ios", "assets", "public"]);
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (!skip.has(entry.name)) walk(path.join(dir, entry.name));
        } else if (/^middleware\.(ts|js|mjs)$/.test(entry.name)) {
          found.push(path.join(dir, entry.name));
        }
      }
    };
    walk(REPO_ROOT);

    if (found.length === 0) return; // no middleware anywhere — legal (protection lives in layouts + routes + RLS)

    const canonical = [
      path.join(REPO_ROOT, "src", "middleware.ts"),
      path.join(REPO_ROOT, "src", "middleware.js"),
    ];
    expect(
      found.some((f) => canonical.includes(f)),
      `Middleware file(s) found at ${found.join(", ")} but none at src/middleware.(ts|js) — Next will not execute them.`,
    ).toBe(true);
  });

  it("built middleware-manifest.json (when present) must actually register the middleware", () => {
    // Only meaningful after `next build`. Skip gracefully when there is
    // no build output (the common case for `vitest run` locally/CI
    // before the build step).
    const manifestPath = path.join(
      REPO_ROOT,
      ".next",
      "server",
      "middleware-manifest.json",
    );
    if (!existsSync(manifestPath)) return;

    const hasMiddlewareSource =
      existsSync(path.join(REPO_ROOT, "src", "middleware.ts")) ||
      existsSync(path.join(REPO_ROOT, "src", "middleware.js"));
    if (!hasMiddlewareSource) return; // nothing to register

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      middleware?: Record<string, unknown>;
    };
    expect(
      Object.keys(manifest.middleware ?? {}).length,
      "src/middleware.ts exists but the build produced an EMPTY middleware-manifest — " +
        "the middleware is not executing. This is the exact failure mode of the old root-level middleware.ts.",
    ).toBeGreaterThan(0);
  });
});
