#!/usr/bin/env node
// apply-form-removals.mjs — turn Karel's /review/forms verdicts into reality
// (Karel 2026-10-08: "put all of the forms the particle system makes … in
// which i can remove ones i dont want").
//
// Reads docs/form-review.json ({ "<kind>:<src>": { verdict: "keep"|"remove", at } })
// and:
//   souls   → src/lib/particles/form-removals.json "souls" (bundled; applied at
//             cast time by src/lib/journeys/form-removals.ts — needs a kiosk
//             rebuild/deploy to take effect)
//   moments → form-removals.json "moments" (same: cast time, rebuild)
//   emblems → pruned from public/tramokyo-pack/local-emblems.json (live on the
//             kiosk's next page load) — a journey is NEVER left with zero
//             emblems: that journey keeps its list and the conflict is reported
//   motifs  → pruned from public/tramokyo-pack/motif-forms.json (a family may
//             empty out — its phases then simply use procedural forms; reported)
//
// Reversible: the first run keeps a pristine copy beside each pack file
// (*.pre-form-review.json); an emblem/motif whose "remove" verdict was undone
// is restored from it on the next run. Every run backs up the files it touches
// to ~/Documents/Resonance/form-removals-backup-<date>[-n]/.
//
// Usage: node scripts/apply-form-removals.mjs [--dry-run]
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, renameSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const DRY = process.argv.includes("--dry-run");
const ROOT = process.cwd();
const REVIEW = path.join(ROOT, "docs/form-review.json");
const REMOVALS = path.join(ROOT, "src/lib/particles/form-removals.json");
const SOULS_TS = path.join(ROOT, "src/lib/particles/souls.ts");
const PACK = path.join(ROOT, "public/tramokyo-pack");
const EMBLEMS = path.join(PACK, "local-emblems.json");
const MOTIFS = path.join(PACK, "motif-forms.json");
const EMBLEMS_PRISTINE = path.join(PACK, "local-emblems.pre-form-review.json");
const MOTIFS_PRISTINE = path.join(PACK, "motif-forms.pre-form-review.json");

const readJson = (p, fallback) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fallback; } };
const writeJson = (p, v, indent = 2) => {
  if (DRY) return;
  const tmp = `${p}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(v, null, indent) + "\n");
  renameSync(tmp, p);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const asList = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

if (!existsSync(path.join(ROOT, "package.json")) || !existsSync(SOULS_TS)) {
  console.error("run from the repo root (my-app)");
  process.exit(1);
}

// ── verdicts ────────────────────────────────────────────────────────────────
const verdicts = readJson(REVIEW, {});
const removed = { souls: [], emblems: [], motifs: [], moments: [] };
const KIND = { soul: "souls", emblem: "emblems", motif: "motifs", moment: "moments" };
for (const [id, v] of Object.entries(verdicts)) {
  if (v?.verdict !== "remove") continue;
  const i = id.indexOf(":");
  const k = KIND[id.slice(0, i)];
  if (k) removed[k].push(id.slice(i + 1));
}
for (const k of Object.keys(removed)) removed[k].sort();

// validate soul ids against the language
const soulBlock = /export const SOUL_IDS = \[([\s\S]*?)\] as const/.exec(readFileSync(SOULS_TS, "utf8"))?.[1] ?? "";
const SOUL_IDS = new Set([...soulBlock.replace(/\/\/.*$/gm, "").matchAll(/"([a-z-]+)"/g)].map((m) => m[1]));
const unknown = removed.souls.filter((s) => !SOUL_IDS.has(s));
if (unknown.length) { console.error(`unknown soul ids in verdicts: ${unknown.join(", ")}`); process.exit(1); }

const prev = { souls: [], emblems: [], motifs: [], moments: [], ...readJson(REMOVALS, {}) };
const report = [];

// ── backup ──────────────────────────────────────────────────────────────────
const date = new Date().toISOString().slice(0, 10);
let backupDir = path.join(os.homedir(), "Documents/Resonance", `form-removals-backup-${date}`);
for (let n = 2; existsSync(backupDir); n++) backupDir = path.join(os.homedir(), "Documents/Resonance", `form-removals-backup-${date}-${n}`);
if (!DRY) {
  mkdirSync(backupDir, { recursive: true });
  for (const f of [EMBLEMS, MOTIFS, REMOVALS, REVIEW]) if (existsSync(f)) copyFileSync(f, path.join(backupDir, path.basename(f)));
}
// pristine copies (first run only) — the source for undoing a removal later
if (!DRY) {
  if (existsSync(EMBLEMS) && !existsSync(EMBLEMS_PRISTINE)) copyFileSync(EMBLEMS, EMBLEMS_PRISTINE);
  if (existsSync(MOTIFS) && !existsSync(MOTIFS_PRISTINE)) copyFileSync(MOTIFS, MOTIFS_PRISTINE);
}

/** Rebuild one list: restore undone removals (pristine order), drop removals. */
function rebuild(current, pristine, restore, drop) {
  const cur = asList(current);
  const pri = asList(pristine);
  const back = pri.filter((u) => restore.has(u) && !cur.includes(u));
  let merged = cur;
  if (back.length) {
    // keep pristine order for everything pristine knows, then current-only items
    const all = new Set([...cur, ...back]);
    merged = [...pri.filter((u) => all.has(u)), ...cur.filter((u) => !pri.includes(u))];
  }
  return { merged, kept: merged.filter((u) => !drop.has(u)) };
}

// ── emblems ─────────────────────────────────────────────────────────────────
const applied = { emblems: new Set(), motifs: new Set() };
if (existsSync(EMBLEMS)) {
  const emblems = readJson(EMBLEMS, {});
  const pristine = readJson(EMBLEMS_PRISTINE, emblems);
  const drop = new Set(removed.emblems);
  const restore = new Set(prev.emblems.filter((u) => !drop.has(u)));
  const out = {};
  const blocked = new Map(); // emblem list → journeys that would be left with none
  let pruned = 0, restored = 0;
  for (const [jid, val] of Object.entries(emblems)) {
    const { merged, kept } = rebuild(val, pristine[jid], restore, drop);
    restored += merged.length - asList(val).length;
    let next = kept;
    if (!kept.length && merged.length) {
      const key = merged.join(" + ");
      blocked.set(key, [...(blocked.get(key) ?? []), jid]);
      next = merged;
    } else {
      for (const u of merged) if (drop.has(u)) applied.emblems.add(u);
    }
    pruned += merged.length - next.length;
    out[jid] = next.length === 1 && !Array.isArray(val) ? next[0] : next;
  }
  const missing = removed.emblems.filter((u) => !applied.emblems.has(u) && !Object.values(out).some((v) => asList(v).includes(u)));
  for (const u of missing) applied.emblems.add(u); // already absent from the pack
  for (const [list, jids] of blocked) report.push(`emblems: NOT pruned for ${jids.length} journey(s) whose only emblem(s) are marked remove — they keep ${list} (${jids.join(", ")}). Keep one, or give them a new emblem.`);
  if (!same(out, emblems)) { writeJson(EMBLEMS, out); }
  console.log(`emblems: ${pruned} journey slot(s) pruned, ${restored} restored`);
} else console.log("emblems: no pack here (public/tramokyo-pack/local-emblems.json missing) — skipped");

// ── motifs ──────────────────────────────────────────────────────────────────
if (existsSync(MOTIFS)) {
  const motifs = readJson(MOTIFS, {});
  const pristine = readJson(MOTIFS_PRISTINE, motifs);
  const drop = new Set(removed.motifs);
  const restore = new Set(prev.motifs.filter((u) => !drop.has(u)));
  const out = {};
  let pruned = 0, restored = 0;
  for (const [fam, list] of Object.entries(motifs)) {
    const { merged, kept } = rebuild(list, pristine[fam], restore, drop);
    restored += merged.length - asList(list).length;
    pruned += merged.length - kept.length;
    for (const u of merged) if (drop.has(u)) applied.motifs.add(u);
    if (!kept.length && merged.length) report.push(`motifs: family "${fam}" now has NO designs — its phases fall back to procedural forms.`);
    out[fam] = kept;
  }
  for (const u of removed.motifs) applied.motifs.add(u);
  if (!same(out, motifs)) writeJson(MOTIFS, out);
  console.log(`motifs: ${pruned} design(s) pruned, ${restored} restored`);
} else console.log("motifs: no pack here (public/tramokyo-pack/motif-forms.json missing) — skipped");

// ── souls + moments (cast-time, bundled) ────────────────────────────────────
const SHAPES = ["ribbons", "murmuration", "vortex", "tendrils", "wisp", "girih", "medallion", "mandala", "kaleido", "blossom", "caustic"];
const liveRemoved = removed.souls.filter((s) => SHAPES.includes(s));
if (liveRemoved.length === SHAPES.length) report.push("souls: EVERY journey shape is marked remove — casting falls back to non-shape souls; check this was intended.");
if (liveRemoved.length) report.push(`souls: ${liveRemoved.join(", ")} re-cast in every journey that used them (same-family replacement). If Snowflake/Ghost/Realized used one, src/lib/journeys/mastered-lock.test.ts will flag it — that is Karel's deliberate change: re-snapshot with UPDATE_MASTERED_LOCK=1 npx vitest run mastered-lock.`);
const labOnly = removed.souls.filter((s) => !SHAPES.includes(s));
if (labOnly.length) report.push(`souls: ${labOnly.join(", ")} are not cast in journeys today — recorded so they never will be.`);
if (removed.moments.length) report.push(`moments: ${removed.moments.length} image(s) dropped from Ghost's blossom moment (a moment with no images left is dropped).`);

const nextRemovals = {
  souls: removed.souls,
  emblems: [...applied.emblems].sort(),
  motifs: [...applied.motifs].sort(),
  moments: removed.moments,
};
const bundledChanged = !same(prev.souls ?? [], nextRemovals.souls) || !same(prev.moments ?? [], nextRemovals.moments);
if (!same({ souls: prev.souls, emblems: prev.emblems, motifs: prev.motifs, moments: prev.moments }, nextRemovals)) writeJson(REMOVALS, nextRemovals);

console.log(`souls removed: ${nextRemovals.souls.length} · moments removed: ${nextRemovals.moments.length}`);
for (const r of report) console.log(`• ${r}`);
if (bundledChanged) console.log("→ souls/moments changed: run `npx vitest run src/lib/journeys`, then rebuild/deploy the kiosk for them to take effect.");
console.log(DRY ? "(dry run — nothing written)" : `backup: ${backupDir}`);
