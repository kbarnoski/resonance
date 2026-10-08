import { NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { SOULS, SHAPE_SOULS } from "@/lib/particles/souls";
import { BANNED_SOULS } from "@/lib/journeys/particle-motifs";
import { buildParticleLeads, JOURNEY_SIGNATURES } from "@/lib/journeys/particle-lead";
import { castSoulsOf, EMPTY_REMOVALS, normalizeRemovals } from "@/lib/journeys/form-removals";

/**
 * Particle FORM review API (Karel 2026-10-08: "put all of the forms the
 * particle system makes for emblems but also for all other instances in which
 * i can remove ones i dont want. its like when we did the morph videos").
 * Backs /review/forms — modelled on /api/review/clips.
 *
 * GET  → the inventory (procedural shapes, emblems, motif designs, Ghost's
 *        blossom moments) + verdicts + what is already applied.
 * POST → { id, verdict: "keep" | "remove" | null } → docs/form-review.json
 *        ({ [formId]: { verdict, at } }).
 * Verdicts change nothing on their own: scripts/apply-form-removals.mjs turns
 * the "remove" verdicts into src/lib/particles/form-removals.json + prunes the
 * pack's local-emblems.json / motif-forms.json.
 *
 * Kiosk/dev only: requires the offline pack (OFFLINE_PACK=1) or a dev server.
 */

export const dynamic = "force-dynamic";

const ROOT = process.cwd();
const REVIEW_PATH = path.join(ROOT, "docs", "form-review.json");
const PACK = path.join(ROOT, "public/tramokyo-pack");

function gated(): boolean {
  return process.env.OFFLINE_PACK === "1" || process.env.NODE_ENV === "development";
}

async function readJson<T>(p: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(p, "utf8")) as T; } catch { return fallback; }
}

type Verdicts = Record<string, { verdict: string; at: string }>;

/** Journey display names — the same resolution as the clip review station. */
async function journeyNames(): Promise<Map<string, string>> {
  const rows = await readJson<Array<{ id: string; name?: string }>>(path.join(PACK, "data/journeys.json"), []);
  const names = new Map(rows.map((r) => [r.id, r.name ?? r.id]));
  const BUILTIN_NAMES: Record<string, string> = {
    "first-snow": "Snowflake",
    "inferno": "Realized",
    "ghost": "Ghost",
    "cosmic-drift": "Cosmic Drift",
    "mycelium-dream": "Mycelium Dream",
    "the-ascension": "The Ascension",
    "the-ascent": "The Ascent",
    "the-bloom": "The Bloom",
  };
  for (const [slug, nm] of Object.entries(BUILTIN_NAMES)) {
    for (const [id, existing] of names) if (existing === nm) names.set(id, `${nm} (unused variant)`);
    names.set(slug, nm);
  }
  const pathRows = await readJson<Array<{ name?: string; journey_ids?: string[] }>>(path.join(PACK, "data/journey_paths.json"), []);
  const pathOf = new Map<string, string>();
  for (const pr of pathRows) for (const jid of pr.journey_ids ?? []) if (pr.name) pathOf.set(jid, pr.name);
  const nameCounts = new Map<string, number>();
  for (const n of names.values()) nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
  for (const [id, n] of names) {
    if ((nameCounts.get(n) ?? 0) > 1 && pathOf.has(id)) names.set(id, `${n} — ${pathOf.get(id)}`);
  }
  return names;
}

interface FormItem {
  id: string;
  kind: "shape" | "emblem" | "motif" | "moment";
  label: string;
  /** image URL or "@angel" / "@angel-outline" (images) · SoulId (shapes) */
  src: string;
  detail: string;
  owners: { id: string; name: string }[];
  /** shapes: cast in journeys today (false = lab-only / banned form) */
  live: boolean;
  /** removal already applied (form-removals.json / pruned from the pack) */
  applied: boolean;
}

export async function GET() {
  if (!gated()) return NextResponse.json({ error: "not available" }, { status: 404 });
  const names = await journeyNames();
  const nameOf = (id: string) => names.get(id) ?? id;
  const removals = normalizeRemovals(await readJson(path.join(ROOT, "src/lib/particles/form-removals.json"), {}));

  // ── shapes: every soul, with the journeys that cast it (before removals) ──
  const leads = buildParticleLeads(EMPTY_REMOVALS);
  const usedBy = new Map<string, string[]>();
  for (const [jid, c] of Object.entries(leads)) for (const s of new Set(castSoulsOf(c))) usedBy.set(s, [...(usedBy.get(s) ?? []), jid]);
  const shapes: FormItem[] = SOULS.map((s) => {
    const owners = (usedBy.get(s.id) ?? []).map((id) => ({ id, name: nameOf(id) }));
    const status = BANNED_SOULS.includes(s.id) ? "banned in journeys (lab only)" : SHAPE_SOULS.includes(s.id) ? `cast in ${owners.length} journeys` : "volume soul (lab only)";
    return {
      id: `soul:${s.id}`, kind: "shape" as const, label: s.title, src: s.id,
      detail: `${s.id} · ${s.traits.family} · ${status} — ${s.line}`,
      owners, live: owners.length > 0, applied: removals.souls.includes(s.id),
    };
  }).sort((a, b) => Number(b.live) - Number(a.live) || b.owners.length - a.owners.length);

  // ── emblems: the live pack map + the pre-review original (pruned ones stay reviewable) ──
  type EmblemMap = Record<string, string | string[]>;
  const live = await readJson<EmblemMap>(path.join(PACK, "local-emblems.json"), {});
  const pristine = await readJson<EmblemMap>(path.join(PACK, "local-emblems.pre-form-review.json"), {});
  const emblemOwners = new Map<string, Set<string>>();
  const liveSrcs = new Set<string>();
  for (const [map, isLive] of [[live, true], [pristine, false]] as const) {
    for (const [jid, v] of Object.entries(map)) for (const u of Array.isArray(v) ? v : [v]) {
      if (!emblemOwners.has(u)) emblemOwners.set(u, new Set());
      emblemOwners.get(u)!.add(jid);
      if (isLive) liveSrcs.add(u);
    }
  }
  const emblems: FormItem[] = [...emblemOwners.entries()].map(([u, own]) => {
    const owners = [...own].map((id) => ({ id, name: nameOf(id) })).sort((a, b) => a.name.localeCompare(b.name));
    const label = u === "@angel" ? "Ghost angel" : u === "@angel-outline" ? "Ghost angel (outline)" : u.split("/").pop()!.replace(/\.(jpe?g|png|webp)$/i, "");
    return {
      id: `emblem:${u}`, kind: "emblem" as const, label, src: u,
      detail: `${u.startsWith("@") ? "token" : u.split("/").slice(-2, -1)[0]} · ${owners.length} journey${owners.length === 1 ? "" : "s"}`,
      owners, live: liveSrcs.has(u), applied: removals.emblems.includes(u) || !liveSrcs.has(u),
    };
  }).sort((a, b) => (a.owners[0]?.name ?? "").localeCompare(b.owners[0]?.name ?? "") || a.label.localeCompare(b.label));

  // ── motif designs (imagery families) ──
  type MotifMap = Record<string, string[]>;
  const motifLive = await readJson<MotifMap>(path.join(PACK, "motif-forms.json"), {});
  const motifPristine = await readJson<MotifMap>(path.join(PACK, "motif-forms.pre-form-review.json"), {});
  const motifFam = new Map<string, string>();
  const motifLiveSet = new Set<string>();
  for (const [map, isLive] of [[motifLive, true], [motifPristine, false]] as const) {
    for (const [fam, list] of Object.entries(map)) for (const u of list ?? []) {
      if (!motifFam.has(u)) motifFam.set(u, fam);
      if (isLive) motifLiveSet.add(u);
    }
  }
  const motifs: FormItem[] = [...motifFam.entries()].map(([u, fam]) => ({
    id: `motif:${u}`, kind: "motif" as const, label: u.split("/").pop()!.replace(/\.(jpe?g|png|webp)$/i, ""), src: u,
    detail: `${fam} family · tinted with the journey palette`,
    owners: [], live: motifLiveSet.has(u), applied: removals.motifs.includes(u) || !motifLiveSet.has(u),
  })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

  // ── timed moments (Ghost's blossom cloud) — straight from the signatures ──
  const moments: FormItem[] = [];
  for (const [jid, sig] of Object.entries(JOURNEY_SIGNATURES)) for (const m of sig.moments ?? []) for (const u of m.images) {
    moments.push({
      id: `moment:${u}`, kind: "moment", label: u.split("/").pop()!.replace(/\.(jpe?g|png|webp)$/i, ""), src: u,
      detail: `phase ${m.phase + 1} moment · ${m.dur}s blossom cloud`,
      owners: [{ id: jid, name: nameOf(jid) }], live: true, applied: removals.moments.includes(u),
    });
  }

  const verdicts = await readJson<Verdicts>(REVIEW_PATH, {});
  return NextResponse.json({
    items: [...shapes, ...emblems, ...motifs, ...moments],
    verdicts,
    journeyNames: Object.fromEntries(names),
  });
}

export async function POST(req: Request) {
  if (!gated()) return NextResponse.json({ error: "not available" }, { status: 404 });
  const body = await req.json().catch(() => null) as { id?: string; verdict?: "keep" | "remove" | null } | null;
  if (!body?.id || !/^(soul|emblem|motif|moment):./.test(body.id) || !(body.verdict === null || body.verdict === "keep" || body.verdict === "remove")) {
    return NextResponse.json({ error: "id (soul:|emblem:|motif:|moment:…) and verdict (keep|remove|null) required" }, { status: 400 });
  }
  const verdicts = await readJson<Verdicts>(REVIEW_PATH, {});
  if (body.verdict === null) delete verdicts[body.id];
  else verdicts[body.id] = { verdict: body.verdict, at: new Date().toISOString() };
  await mkdir(path.dirname(REVIEW_PATH), { recursive: true });
  await writeFile(REVIEW_PATH, JSON.stringify(verdicts, null, 1) + "\n");
  return NextResponse.json({ ok: true, count: Object.keys(verdicts).length });
}
