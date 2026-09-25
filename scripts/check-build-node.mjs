#!/usr/bin/env node
// Preflight for `npm run build`. Next.js static generation crashes with a
// cryptic `spawn EBADF` under Node 22 (documented in docs/tramokyo-plan.md).
// Policy (2026-09-25): local macOS builds stay on the known-good Node 20;
// Linux/CI/Vercel run Node 24 (Vercel hard-fails Node 20 deploys after
// 2026-10-01) — Node 21-23 are blocked everywhere.
const major = Number(process.versions.node.split(".")[0]);
const darwin = process.platform === "darwin";
const ok = darwin ? major === 20 : (major === 20 || major >= 24);
if (!ok) {
  console.error(
    `\n✖ Unsupported Node ${process.versions.node} for builds on ${process.platform}.\n` +
      (darwin
        ? `  Local builds require Node 20 (spawn EBADF on 22).\n  Fix:  nvm use 20   (repo has .nvmrc)\n`
        : `  CI/Vercel builds require Node 20 or >=24.\n`) +
      `  Then: npm run build\n`
  );
  process.exit(1);
}
