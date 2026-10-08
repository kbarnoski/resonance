/**
 * FORM REMOVALS (Karel 2026-10-08: "put all of the forms the particle system
 * makes … in which i can remove ones i dont want — like when we did the morph
 * videos"). Karel marks forms at /review/forms (verdicts → docs/form-review.json);
 * scripts/apply-form-removals.mjs turns the "remove" verdicts into
 * src/lib/particles/form-removals.json (souls + moments, applied here at cast
 * time) and prunes the pack's local-emblems.json / motif-forms.json.
 *
 * THE SINGLE FILTER POINT for procedural forms: buildParticleLeads()
 * (particle-lead.ts) runs every cast through applySoulRemovals(). A removed
 * soul is replaced by another allowed shape soul — same family where
 * possible — and no form list is ever left empty. With an empty list every
 * cast is returned UNCHANGED (same object), so nothing moves until Karel
 * marks something (mastered-lock proves it).
 */
import raw from "@/lib/particles/form-removals.json";
import { SOULS, SHAPE_SOULS, type SoulId } from "@/lib/particles/souls";
import { BANNED_SOULS } from "./particle-motifs";

export interface FormRemovals {
  souls: readonly string[];
  emblems: readonly string[];
  motifs: readonly string[];
  moments: readonly string[];
}

const list = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : []);
export function normalizeRemovals(x: unknown): FormRemovals {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  return { souls: list(o.souls), emblems: list(o.emblems), motifs: list(o.motifs), moments: list(o.moments) };
}

export const EMPTY_REMOVALS: FormRemovals = { souls: [], emblems: [], motifs: [], moments: [] };
/** The committed removal list (empty = today's behaviour). */
export const FORM_REMOVALS: FormRemovals = normalizeRemovals(raw);

function hash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

const familyOf = (id: SoulId) => SOULS.find((s) => s.id === id)?.traits.family;

/**
 * Replacement candidates for a removed soul, best first: allowed shape souls
 * of the same family, then the other allowed shape souls (deterministic
 * per seed). If Karel removed EVERY shape soul, any non-banned soul still
 * allowed; if literally nothing is left, empty (callers keep the original).
 */
export function replacementCandidates(id: SoulId, removed: ReadonlySet<string>, seed: string): SoulId[] {
  const ok = (s: SoulId) => s !== id && !removed.has(s) && !BANNED_SOULS.includes(s);
  const fam = familyOf(id);
  const order = (xs: SoulId[]) => xs.sort((a, b) => hash01(`${seed}:${id}:${a}`) - hash01(`${seed}:${id}:${b}`));
  const shapes = SHAPE_SOULS.filter(ok);
  const same = order(shapes.filter((s) => familyOf(s) === fam));
  const other = order(shapes.filter((s) => familyOf(s) !== fam));
  if (same.length || other.length) return [...same, ...other];
  return order(SOULS.map((s) => s.id).filter(ok));
}

function replace(id: SoulId, removed: ReadonlySet<string>, seed: string, avoid: ReadonlySet<SoulId> = new Set()): SoulId {
  if (!removed.has(id)) return id;
  const c = replacementCandidates(id, removed, seed);
  return c.find((s) => !avoid.has(s)) ?? c[0] ?? id;
}

/** A form list without removed souls: replacements avoid what the list
 *  already holds, duplicates collapse, never empty (unless it was). */
function filterList(xs: readonly SoulId[], removed: ReadonlySet<string>, seed: string): SoulId[] {
  if (!xs.some((s) => removed.has(s))) return xs as SoulId[];
  const out: SoulId[] = [];
  for (const s of xs) {
    const keep = new Set<SoulId>([...xs.filter((x) => !removed.has(x)), ...out]);
    const r = replace(s, removed, seed, keep);
    if (!out.includes(r)) out.push(r);
  }
  return out;
}

/** Everything that names a soul in a particle cast. */
export interface SoulCastLike {
  souls: Record<string, SoulId>;
  windows: { soul: SoulId }[];
  breaks: { soul: SoulId }[];
  morphSouls: SoulId[];
  formCycle: SoulId[];
  phaseChars?: { forms: SoulId[] }[];
}

export function castSoulsOf(c: SoulCastLike): SoulId[] {
  return [
    ...Object.values(c.souls), ...c.windows.map((w) => w.soul), ...c.breaks.map((w) => w.soul),
    ...c.morphSouls, ...c.formCycle, ...(c.phaseChars ?? []).flatMap((p) => p.forms),
  ];
}

/** The cast with every removed soul replaced. Identity when nothing applies. */
export function applySoulRemovals<T extends SoulCastLike>(cast: T, removedSouls: readonly string[], seed: string): T {
  if (!removedSouls.length) return cast;
  const removed = new Set(removedSouls);
  if (!castSoulsOf(cast).some((s) => removed.has(s))) return cast;
  const souls = {} as Record<string, SoulId>;
  const taken = new Set<SoulId>(Object.values(cast.souls).filter((s) => !removed.has(s)));
  for (const [k, s] of Object.entries(cast.souls)) {
    const r = replace(s, removed, `${seed}:${k}`, taken);
    souls[k] = r;
    taken.add(r);
  }
  const win = <W extends { soul: SoulId }>(w: W): W => (removed.has(w.soul) ? { ...w, soul: replace(w.soul, removed, seed) } : w);
  // successive morphs never land on the same form twice running
  const morphSouls: SoulId[] = [];
  cast.morphSouls.forEach((s, i) => {
    const prev = morphSouls[i - 1];
    const next = cast.morphSouls[i + 1];
    const avoid = new Set<SoulId>([prev, next].filter((x): x is SoulId => !!x && !removed.has(x)));
    morphSouls.push(replace(s, removed, `${seed}:m${i}`, avoid));
  });
  const formCycle = filterList(cast.formCycle, removed, seed);
  const phaseChars = cast.phaseChars?.map((p, i) => {
    const forms = filterList(p.forms, removed, `${seed}:p${i}`);
    return forms === p.forms ? p : { ...p, forms };
  });
  return {
    ...cast,
    souls,
    windows: cast.windows.map(win),
    breaks: cast.breaks.map(win),
    morphSouls,
    formCycle: formCycle.length ? formCycle : cast.formCycle,
    ...(phaseChars ? { phaseChars } : {}),
  };
}

/** Timed image moments without removed images; a moment left with no image is dropped. */
export function momentsWithout<M extends { images: readonly string[] }>(moments: readonly M[] | undefined, removed: readonly string[]): readonly M[] | undefined {
  if (!moments || !removed.length) return moments;
  if (!moments.some((m) => m.images.some((u) => removed.includes(u)))) return moments;
  return moments
    .map((m) => ({ ...m, images: m.images.filter((u) => !removed.includes(u)) }))
    .filter((m) => m.images.length > 0);
}
