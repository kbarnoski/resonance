import catalog from "./catalog.generated.json";

// ── Shared build-time prototype scan ───────────────────────────────────────
//
// Single source of truth for the dream-lab catalog. The scan itself runs
// BEFORE the build (scripts/generate-dream-catalog.mjs, wired into
// package.json "prebuild") and lands in catalog.generated.json, which this
// module imports — so the bundler ships the data with every consumer and
// no route ever touches the filesystem at render time. Feeds:
//   · /dream                    (index — hero, featured shelf, recent grid)
//   · /dream/archive/[page]     (full paginated archive, static)
//   · /dream/archive/manifest   (static slug manifest for the prev/next nav)
//
// Works in ANY render mode: because the dream layout is force-dynamic
// (protos render on demand) and a parent layout's force-dynamic overrides
// a child page's force-static, the index/archive may render inside a
// lambda where src/app/dream does not exist — the bundled JSON is what
// makes that safe.

export type Prototype = {
  slug: string;
  cycle: number;
  name: string;
  status: string;
  description: string;
  /** Validation category — auto-derived from code: pure-local vs depends on FAL_KEY. */
  category: "local" | "fal-required";
};

/** Protos shown on the /dream index before the archive takes over. */
export const RECENT_COUNT = 60;

/** Protos per static archive page. */
export const ARCHIVE_PAGE_SIZE = 60;

export const STATUS_STYLES: Record<string, string> = {
  skeleton: "bg-muted text-muted-foreground",
  wip: "bg-primary/10 text-primary/90 border border-primary/20",
  demoable: "bg-primary/15 text-primary",
  polished: "bg-primary/20 text-primary border border-primary/30",
};

export const CATEGORY_STYLES: Record<Prototype["category"], string> = {
  local: "bg-primary/10 text-primary/90 border border-primary/20",
  "fal-required": "bg-muted text-muted-foreground border border-border",
};

export const CATEGORY_LABELS: Record<Prototype["category"], string> = {
  local: "✓ local",
  "fal-required": "🔑 FAL_KEY",
};

// The prebuild step guarantees freshness; the async signature is kept so
// consumers don't care where the catalog comes from.
export function loadPrototypes(): Promise<Prototype[]> {
  return Promise.resolve(catalog as Prototype[]);
}

export function archivePageCount(total: number): number {
  return Math.max(1, Math.ceil(total / ARCHIVE_PAGE_SIZE));
}
