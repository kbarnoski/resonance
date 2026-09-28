#!/usr/bin/env node
/**
 * prune-for-target.mjs — dream-lab project split (2026-09-27).
 *
 * The repo deploys to TWO Vercel projects from the same codebase:
 *   - `resonance`       (BUILD_TARGET=core)  — the real app. This script
 *     removes the ~1,200 dream-lab route directories from the BUILD
 *     WORKSPACE so the core build compiles ~60 routes in ~1 minute
 *     instead of 1,200+ in ~5. `/dream/*` is proxied to the dream
 *     project via next.config rewrites (DREAM_ORIGIN), so public URLs
 *     never change.
 *   - `resonance-dream` (BUILD_TARGET=dream) — the full, unpruned app
 *     serving the dream lab (and setting an absolute assetPrefix so its
 *     chunks load through the core-domain proxy). Nothing is pruned.
 *
 * `src/app/dream/_shared/` is KEPT in the core build — it exports
 * welcomeHome helpers that installation-machine.ts imports, and it
 * contains no routes.
 *
 * SAFETY: this deletes files, so it refuses to run outside a disposable
 * workspace — Vercel's build clone (VERCEL=1) or an explicit PRUNE_OK=1
 * (used by the local verification build in a throwaway copy). It can
 * never eat the working tree, and the dream agent's workflow is
 * untouched (same repo, same paths).
 */
import { readdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";

const target = process.env.BUILD_TARGET;
if (target !== "core") {
  if (target && target !== "dream") console.warn(`prune-for-target: unknown BUILD_TARGET "${target}" — nothing pruned`);
  process.exit(0);
}
if (!process.env.VERCEL && process.env.PRUNE_OK !== "1") {
  console.log("prune-for-target: BUILD_TARGET=core but not a disposable workspace (no VERCEL/PRUNE_OK) — refusing to prune the working tree.");
  process.exit(0);
}

const dreamDir = path.join(process.cwd(), "src/app/dream");
if (!existsSync(dreamDir)) { console.log("prune-for-target: dream dir already absent"); process.exit(0); }

let removed = 0;
for (const entry of readdirSync(dreamDir, { withFileTypes: true })) {
  if (entry.name === "_shared") continue; // core imports welcomeHome from here
  rmSync(path.join(dreamDir, entry.name), { recursive: true, force: true });
  removed++;
}
console.log(`prune-for-target: core build — removed ${removed} dream-lab entries (kept _shared)`);
