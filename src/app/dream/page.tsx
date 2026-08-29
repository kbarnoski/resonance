import { readFile } from "fs/promises";
import path from "path";
import Link from "next/link";
import { VoteIndicator, VoteButtons } from "./_shared/vote-buttons";
import type { ReactNode } from "react";
import {
  loadPrototypes,
  RECENT_COUNT,
  STATUS_STYLES,
  CATEGORY_STYLES,
  CATEGORY_LABELS,
  type Prototype,
} from "./archive/_scan";

// Prerendered at build (overrides the dream layout's force-dynamic default).
// The catalog scan lives in ./archive/_scan — one shared build-time sweep
// feeds this index, the paginated archive, and the nav manifest.
export const dynamic = "force-static";

// ── Types ──────────────────────────────────────────────────────────────────

type RecentCycle = {
  number: number;
  title: string;
  date: string;
  decision: string;
};

// ── Featured shelf (curated 2026-08-25 — the Tramokyo / portfolio set) ──────
const FEATURED_SLUGS = [
  "16032-headnave",
  "16000-morphonate",
  "15824-canon",
  "15536-antiphon",
  "15440-spheres",
  "13904-unmixer",
  "13840-hallofsongs",
  "14784-nave",
  "700-welcome-home",
  "703-harmonic-bloom",
  "11680-corridor",
  "1081-singularity-fall",
] as const;

// ── Markdown renderer ─────────────────────────────────────────────────────
// Supports: ## headings, - bullets (with indented continuation), 1. ordered
// lists, ```code blocks, **bold**, `code`, [link](url), paragraphs.

type InlineHit = { start: number; end: number; node: ReactNode };

function renderInline(text: string, key: string): ReactNode {
  const parts: ReactNode[] = [];
  let rest = text;
  let n = 0;

  while (rest.length > 0) {
    const boldM = /\*\*([^*]+?)\*\*/.exec(rest);
    const codeM = /`([^`]+)`/.exec(rest);
    const linkM = /\[([^\]]+)\]\(([^)]+)\)/.exec(rest);

    const hits: InlineHit[] = [];
    if (boldM)
      hits.push({
        start: boldM.index,
        end: boldM.index + boldM[0].length,
        node: (
          <strong key={`${key}-b${n++}`} className="font-semibold text-foreground">
            {boldM[1]}
          </strong>
        ),
      });
    if (codeM)
      hits.push({
        start: codeM.index,
        end: codeM.index + codeM[0].length,
        node: (
          <code
            key={`${key}-c${n++}`}
            className="rounded bg-muted px-1.5 py-0.5 text-[0.85em] text-primary"
          >
            {codeM[1]}
          </code>
        ),
      });
    if (linkM)
      hits.push({
        start: linkM.index,
        end: linkM.index + linkM[0].length,
        node: (
          <a
            key={`${key}-l${n++}`}
            href={linkM[2]}
            target={linkM[2].startsWith("http") ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {linkM[1]}
          </a>
        ),
      });

    if (hits.length === 0) {
      parts.push(rest);
      break;
    }
    hits.sort((a, b) => a.start - b.start);
    const first = hits[0];
    if (first.start > 0) parts.push(rest.slice(0, first.start));
    parts.push(first.node);
    rest = rest.slice(first.end);
  }
  return <>{parts}</>;
}

function renderMdSection(lines: string[], baseKey: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith("```")) {
      const start = i + 1;
      let end = start;
      while (end < lines.length && !lines[end].startsWith("```")) end++;
      const code = lines.slice(start, end).join("\n");
      out.push(
        <pre
          key={`${baseKey}-pre${k++}`}
          className="my-3 overflow-x-auto rounded-md bg-muted p-3 font-mono text-[0.78rem] leading-relaxed text-muted-foreground"
        >
          {code}
        </pre>
      );
      i = end + 1;
      continue;
    }

    // ## Section heading
    if (/^##\s+/.test(line)) {
      const text = line.replace(/^##\s+/, "");
      out.push(
        <h3
          key={`${baseKey}-h${k++}`}
          className="mt-5 mb-2 text-xs font-bold uppercase tracking-[0.2em] text-primary/80"
        >
          {text}
        </h3>
      );
      i++;
      continue;
    }

    // Bullet list (with indented continuation lines)
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
        while (i < lines.length && /^\s{2,}/.test(lines[i])) {
          items[items.length - 1] += " " + lines[i].trim();
          i++;
        }
      }
      out.push(
        <ul
          key={`${baseKey}-ul${k++}`}
          className="my-2 ml-4 space-y-2 text-sm"
        >
          {items.map((it, idx) => (
            <li key={idx} className="leading-relaxed text-muted-foreground">
              {renderInline(it, `${baseKey}-uli${k}-${idx}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      out.push(
        <ol
          key={`${baseKey}-ol${k++}`}
          className="my-2 ml-5 list-decimal space-y-1 text-sm text-muted-foreground"
        >
          {items.map((it, idx) => (
            <li key={idx}>
              {renderInline(it, `${baseKey}-oli${k}-${idx}`)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Blank lines and horizontal rules
    if (line.trim() === "" || line.trim() === "---") {
      i++;
      continue;
    }

    // Paragraph
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !lines[i].startsWith("```") &&
      !/^##\s+/.test(lines[i]) &&
      lines[i].trim() !== "---"
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(
      <p
        key={`${baseKey}-p${k++}`}
        className="my-2 text-sm leading-relaxed text-muted-foreground"
      >
        {renderInline(para.join(" "), `${baseKey}-pin${k}`)}
      </p>
    );
  }

  return out;
}

// ── Data loading ──────────────────────────────────────────────────────────

async function loadMorning(): Promise<string> {
  try {
    return await readFile(
      path.join(process.cwd(), "docs/dreams/MORNING.md"),
      "utf-8"
    );
  } catch {
    return "";
  }
}

async function loadRecentCycles(n: number): Promise<RecentCycle[]> {
  let md = "";
  try {
    md = await readFile(
      path.join(process.cwd(), "docs/dreams/STATE.md"),
      "utf-8"
    );
  } catch {
    return [];
  }

  const cycles: RecentCycle[] = [];
  const re =
    /##\s+Cycle\s+([\d.]+)\s+[—-]\s+([^\n]+)\n([\s\S]+?)(?=\n##\s+Cycle\s+[\d.]+\s+[—-]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const number = parseFloat(m[1]);
    const title = m[2].trim();
    const body = m[3].trim();
    const whenMatch = body.match(/\*\*When\*\*:\s*([^\n]+)/);
    const date = whenMatch ? whenMatch[1].trim() : "";
    const decidedMatch = body.match(/\*\*Decided\*\*:\s*([^\n]+)/);
    const decision = decidedMatch
      ? decidedMatch[1].trim().replace(/\*\*/g, "").replace(/`/g, "")
      : "";
    cycles.push({ number, title, date, decision });
  }

  return cycles.sort((a, b) => b.number - a.number).slice(0, n);
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function DreamPage() {
  const [prototypes, morningMd, recentCycles] = await Promise.all([
    loadPrototypes(),
    loadMorning(),
    loadRecentCycles(3),
  ]);

  const cycleNum =
    recentCycles.length > 0 ? String(recentCycles[0].number) : "";
  const lastUpdated = morningMd.match(/last updated ([^\n]+)/)?.[1] ?? "";

  const bySlug = new Map(prototypes.map((p) => [p.slug, p]));
  const featured = FEATURED_SLUGS.map((s) => bySlug.get(s)).filter(
    (p): p is Prototype => p !== undefined
  );

  // The index ships lean: featured + the newest RECENT_COUNT. Everything
  // older lives in the static paginated archive (/dream/archive/1..N).
  const recent = prototypes.slice(0, RECENT_COUNT);
  const archivedCount = prototypes.length - recent.length;

  // Strip the H1 title line from MORNING.md — page already shows cycle info
  const morningContentLines = morningMd.split("\n").slice(1);

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* ── Hero (compact — keeps prototypes above the fold) ─────── */}
      <section className="border-b border-border px-6 py-5">
        <div className="mx-auto flex max-w-3xl flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
              Resonance · Dream Lab
              {cycleNum ? ` · cycle ${cycleNum}` : ""}
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              What the dream agent built
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {prototypes.length} prototypes · autonomous twice-daily cycles
              {lastUpdated ? ` · ${lastUpdated}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Link
              href="/dream/history"
              className="rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-primary transition-colors hover:bg-primary/25"
            >
              ↻{" "}
              {recentCycles.length > 0
                ? `${recentCycles[0].number} cycles`
                : "History"}
            </Link>
            <a
              href="https://github.com/kbarnoski/resonance/blob/main/docs/dreams/IDEAS.md"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border bg-muted px-3 py-1 transition-colors hover:bg-accent"
            >
              Ideas
            </a>
            <a
              href="https://github.com/kbarnoski/resonance/blob/main/docs/dreams/RESEARCH.md"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border bg-muted px-3 py-1 transition-colors hover:bg-accent"
            >
              Research
            </a>
            <a
              href="https://claude.ai/code/routines/trig_018Bk8HoEkQnFqxgxK8rdD9h"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-primary/30 bg-primary/20 px-3 py-1 text-primary transition-colors hover:bg-primary/30"
            >
              Logs →
            </a>
          </div>
        </div>
      </section>

      {/* ── Featured shelf (curated portfolio — quiet, gallery-grade) ── */}
      {featured.length > 0 && (
        <section className="border-b border-border px-6 py-6">
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Featured · start here
            </div>
            <ol className="divide-y divide-border/60">
              {featured.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/dream/${p.slug}`}
                    prefetch={false}
                    className="group flex items-baseline gap-3 py-2.5"
                  >
                    <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground/70">
                      c{p.cycle}
                    </span>
                    <span className="shrink-0 text-base font-medium tracking-tight text-foreground transition-colors group-hover:text-primary">
                      {p.name}
                    </span>
                    <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:block">
                      {p.description}
                    </span>
                    <span className="ml-auto shrink-0 text-sm text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* ── Prototype grid ────────────────────────────────────────── */}
      <section className="px-6 pt-6 pb-10">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              latest {recent.length} of {prototypes.length} · newest first
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <span>
                <span className="text-primary">✓ local</span>{" "}
                {prototypes.filter((p) => p.category === "local").length}
              </span>
              <span>
                <span className="text-muted-foreground">🔑 FAL_KEY</span>{" "}
                {prototypes.filter((p) => p.category === "fal-required").length}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {recent.map((p) => (
              <Link
                key={p.slug}
                href={`/dream/${p.slug}`}
                prefetch={false}
                className="group block rounded-xl border border-border bg-card p-5 transition-colors duration-instant hover:border-primary/30 hover:bg-accent"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground/70">
                    c{p.cycle}
                  </span>
                  {p.status !== "demoable" && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        STATUS_STYLES[p.status] ?? STATUS_STYLES.demoable
                      }`}
                    >
                      {p.status}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] tracking-wide ${CATEGORY_STYLES[p.category]}`}
                    title={
                      p.category === "fal-required"
                        ? "This prototype calls a FAL.ai API and requires the FAL_KEY env var. Configured on Vercel for Production + Preview + Development."
                        : "Pure local — no external APIs, no keys needed. Runs entirely in the browser."
                    }
                  >
                    {CATEGORY_LABELS[p.category]}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <VoteIndicator slug={p.slug} />
                    <VoteButtons slug={p.slug} compact stopPropagation />
                  </span>
                </div>
                <h3 className="mb-1.5 text-lg font-semibold tracking-tight transition-colors group-hover:text-primary">
                  {p.name}
                </h3>
                <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {p.description || "—"}
                </p>
                <span className="inline-flex items-center gap-1 text-sm text-primary transition-colors group-hover:text-primary/80">
                  Launch{" "}
                  <span className="inline-block transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </span>
              </Link>
            ))}
          </div>

          {/* Doorway to the full archive — everything older than the
              recent grid, ~60 per static page. */}
          {archivedCount > 0 && (
            <div className="mt-8 text-center">
              <Link
                href="/dream/archive/1"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-5 py-2.5 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors duration-fast hover:border-primary/30 hover:text-primary"
              >
                Browse the archive · {archivedCount} more →
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ── Recent cycles + Morning digest (collapsed by default) ──── */}
      {(recentCycles.length > 0 || morningMd) && (
        <section className="border-t border-border px-6 py-8">
          <div className="mx-auto max-w-3xl space-y-3">
            {recentCycles.length > 0 && (
              <details className="group rounded-xl border border-border bg-card open:bg-accent">
                <summary className="flex cursor-pointer list-none items-center justify-between p-4 transition-colors hover:bg-accent">
                  <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Recent cycles ({recentCycles[0].number} total)
                  </div>
                  <span className="text-xs text-muted-foreground/70 transition-transform group-open:rotate-180">
                    ▾
                  </span>
                </summary>
                <div className="border-t border-border p-4">
                  <div className="mb-3 flex justify-end">
                    <Link
                      href="/dream/history"
                      className="text-xs text-primary transition-colors hover:text-primary/80"
                    >
                      Full history →
                    </Link>
                  </div>
                  <div className="space-y-3">
                    {recentCycles.map((c, i) => (
                      <div
                        key={c.number}
                        className={`rounded-xl border p-4 ${
                          i === 0
                            ? "border-primary/20 bg-primary/[0.06]"
                            : "border-border bg-card"
                        }`}
                      >
                        <div className="mb-1 flex flex-wrap items-baseline gap-3">
                          <span className="font-mono text-xs text-muted-foreground/70">
                            cycle {c.number}
                          </span>
                          <span className="text-sm text-foreground">
                            {c.title}
                          </span>
                        </div>
                        {c.date && (
                          <div className="mb-1.5 text-xs text-muted-foreground/70">
                            {c.date}
                          </div>
                        )}
                        {c.decision && (
                          <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
                            {c.decision.slice(0, 200)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            )}

            {morningMd && (
              <details className="group rounded-xl border border-border bg-primary/[0.04] open:bg-primary/[0.06]">
                <summary className="flex cursor-pointer list-none items-center justify-between p-4 transition-colors hover:bg-primary/[0.08]">
                  <div className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                    ⭐ Morning digest
                  </div>
                  <span className="text-xs text-muted-foreground/70 transition-transform group-open:rotate-180">
                    ▾
                  </span>
                </summary>
                <div className="border-t border-border p-4">
                  {renderMdSection(morningContentLines, "morning")}
                </div>
              </details>
            )}
          </div>
        </section>
      )}

      <footer className="border-t border-border px-6 py-6 text-center text-xs text-muted-foreground/70">
        Built on{" "}
        <code className="font-mono text-muted-foreground">main</code> by an
        autonomous agent dreaming twice daily in Anthropic&apos;s cloud.{" "}
        <a
          href="https://github.com/kbarnoski/resonance/commits/main"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          Git log
        </a>{" "}
        ·{" "}
        <a
          href="https://github.com/kbarnoski/resonance/blob/main/docs/dreams/AGENT.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          Agent manual
        </a>
      </footer>
    </main>
  );
}
