#!/usr/bin/env node
// Generates src/app/dream/archive/catalog.generated.json — the dream-lab
// catalog consumed by /dream, /dream/archive/[page], and the nav manifest
// via src/app/dream/archive/_scan.ts.
//
// WHY A PREBUILD STEP: the dream layout renders protos on demand
// (force-dynamic), and in Next a parent layout's force-dynamic wins over a
// child page's force-static — so the index/archive may render inside a
// lambda where the source tree (1,150+ proto folders) does not exist.
// Scanning at render time is therefore impossible in production; instead
// this script runs before every build (see package.json "prebuild") and
// the routes import the JSON, which the bundler ships with them.
//
// Parsing rules mirror what the old build-time scanner did — if the dream
// agent changes README conventions (H1 format, **Status** line), update
// BOTH this file and docs/dreams/AGENT.md's deployment-model section.
import { readFile, readdir, writeFile } from "fs/promises";
import path from "path";

const dreamDir = path.join(process.cwd(), "src/app/dream");
const outPath = path.join(dreamDir, "archive", "catalog.generated.json");

function cleanProse(s) {
  return s
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

async function scanOne(slug) {
  const cycle = parseInt(slug.split("-")[0], 10);
  let readme = "";
  try {
    readme = await readFile(path.join(dreamDir, slug, "README.md"), "utf-8");
  } catch {
    readme = "";
  }

  // The agent's READMEs use 3 different H1 patterns inconsistently:
  //   "# /dream/1-live — Real Name"  → drop slug, keep "Real Name"
  //   "# Real Name — design notes"   → drop "design notes", keep "Real Name"
  //   "# Real Name"                  → use as-is
  const slugTitle = slug
    .split("-")
    .slice(1)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

  let name = slugTitle;
  const h1 = readme.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
  if (h1) {
    const parts = h1.split(/\s+[—-]\s+/).map((s) => s.trim());
    const isSluglike = (s) => /^(\/?dream\/?|\d+)([\s/_-]|$)/i.test(s);
    const isGeneric = (s) => /^design\s*notes?$/i.test(s);
    const good = parts.find((p) => !isSluglike(p) && !isGeneric(p));
    name = good ?? parts.find((p) => !isSluglike(p)) ?? slugTitle;
  }

  const statusMatch = readme.match(/\*\*Status\*\*:\s*(\w+)/i);
  const status = statusMatch ? statusMatch[1].toLowerCase() : "demoable";

  const lines = readme.split("\n");
  const para = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("#")) {
      if (para.length) break;
      continue;
    }
    if (line === "---") {
      if (para.length) break;
      continue;
    }
    if (/^\*\*(Status|Route|Question|Cycle)/i.test(line)) continue;
    if (line === "") {
      if (para.length) break;
      continue;
    }
    para.push(line);
  }
  const description = cleanProse(para.join(" ")).slice(0, 180);

  // Validation category — pure-local vs depends on FAL_KEY, derived from
  // the proto's own api route or its page fetching /api/ai-image/*.
  let category = "local";
  try {
    const apiSource = await readFile(
      path.join(dreamDir, slug, "api", "route.ts"),
      "utf-8"
    );
    if (apiSource.includes("@fal-ai/client")) category = "fal-required";
  } catch {
    // no api/route.ts for this prototype
  }
  if (category === "local") {
    try {
      const pageSource = await readFile(
        path.join(dreamDir, slug, "page.tsx"),
        "utf-8"
      );
      if (/fetch\(['"`]\/api\/ai-image/.test(pageSource)) {
        category = "fal-required";
      }
    } catch {
      // no page.tsx — leave as local
    }
  }

  return { slug, cycle, name, status, description, category };
}

const entries = await readdir(dreamDir, { withFileTypes: true });
const dirs = entries
  .filter((e) => e.isDirectory() && /^\d+-/.test(e.name))
  .map((e) => e.name);

const protos = await Promise.all(dirs.map(scanOne));
protos.sort((a, b) => b.cycle - a.cycle);

await writeFile(outPath, JSON.stringify(protos, null, 1) + "\n");
console.log(
  `[dream-catalog] wrote ${protos.length} prototypes → ${path.relative(process.cwd(), outPath)}`
);
