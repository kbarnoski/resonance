#!/usr/bin/env node
// Preflight for `npm run build`. Next.js static generation crashes with a
// cryptic `spawn EBADF` under Node 22 (documented in docs/tramokyo-plan.md);
// builds must run on Node 20. Fail fast with instructions instead of three
// minutes into "Generating static pages".
const major = Number(process.versions.node.split(".")[0]);
if (major !== 20) {
  console.error(
    `\n✖ Builds require Node 20 (found ${process.versions.node}).\n` +
      `  Node 22 fails static generation with \`spawn EBADF\`.\n\n` +
      `  Fix:  nvm use 20   (repo has .nvmrc)\n` +
      `  Then: npm run build\n`
  );
  process.exit(1);
}
