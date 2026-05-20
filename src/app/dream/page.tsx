import { readFile, readdir } from "fs/promises";
import path from "path";
import Link from "next/link";
import type { ReactNode } from "react";

export const dynamic = "force-static";

// ── Types ──────────────────────────────────────────────────────────────────

type Prototype = {
  slug: string;
  cycle: number;
  name: string;
  status: string;
  description: string;
};

type RecentCycle = {
  number: number;
  title: string;
  date: string;
  decision: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  skeleton: "bg-white/10 text-white/60",
  wip: "bg-amber-500/15 text-amber-300",
  demoable: "bg-violet-500/15 text-violet-200",
  polished: "bg-emerald-500/15 text-emerald-300",
};

function cleanProse(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

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
          <strong key={`${key}-b${n++}`} className="font-semibold text-white">
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
            className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[0.85em] text-violet-200"
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
            className="text-violet-300 underline underline-offset-2 hover:text-violet-100"
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
          className="my-3 overflow-x-auto rounded-md bg-white/[0.04] p-3 font-mono text-[0.78rem] leading-relaxed text-white/65"
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
          className="mt-5 mb-2 text-xs font-bold uppercase tracking-[0.2em] text-violet-300/70"
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
            <li key={idx} className="leading-relaxed text-white/75">
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
          className="my-2 ml-5 list-decimal space-y-1 text-sm text-white/75"
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
        className="my-2 text-sm leading-relaxed text-white/75"
      >
        {renderInline(para.join(" "), `${baseKey}-pin${k}`)}
      </p>
    );
  }

  return out;
}

// ── Data loading ──────────────────────────────────────────────────────────

async function loadPrototypes(): Promise<Prototype[]> {
  const dreamDir = path.join(process.cwd(), "src/app/dream");
  const entries = await readdir(dreamDir, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory() && /^\d+-/.test(e.name))
    .map((e) => e.name);

  const results: Prototype[] = await Promise.all(
    dirs.map(async (slug) => {
      const cycle = parseInt(slug.split("-")[0], 10);
      let readme = "";
      try {
        readme = await readFile(
          path.join(dreamDir, slug, "README.md"),
          "utf-8"
        );
      } catch {
        readme = "";
      }

      const headingMatch = readme.match(/^#\s+\S+\s+[—-]\s+(.+)$/m);
      const slugTitle = slug
        .split("-")
        .slice(1)
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(" ");
      const name = headingMatch ? headingMatch[1].trim() : slugTitle;

      const statusMatch = readme.match(/\*\*Status\*\*:\s*(\w+)/i);
      const status = statusMatch ? statusMatch[1].toLowerCase() : "demoable";

      const lines = readme.split("\n");
      const para: string[] = [];
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

      return { slug, cycle, name, status, description };
    })
  );

  return results.sort((a, b) => b.cycle - a.cycle);
}

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

  // Strip the H1 title line from MORNING.md — page already shows cycle info
  const morningContentLines = morningMd.split("\n").slice(1);

  return (
    <main className="min-h-screen bg-black text-white">
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="border-b border-white/10 px-6 py-12">
        <div className="mx-auto max-w-3xl">
          <div className="mb-2 text-xs uppercase tracking-[0.3em] text-violet-300/70">
            Resonance · Dream Lab
            {cycleNum ? ` · cycle ${cycleNum}` : ""}
          </div>
          <h1 className="mb-3 font-serif text-3xl tracking-tight sm:text-5xl">
            What the dream agent built
          </h1>
          <p className="mb-6 text-sm text-white/50">
            {prototypes.length} prototypes · autonomous hourly cycles
            {lastUpdated ? ` · ${lastUpdated}` : ""}
          </p>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link
              href="/dream/history"
              className="rounded-full border border-violet-400/30 bg-violet-500/15 px-4 py-1.5 text-violet-100 transition-colors hover:bg-violet-500/25"
            >
              ↻{" "}
              {recentCycles.length > 0
                ? `${recentCycles[0].number} cycles`
                : "Cycle history"}
            </Link>
            <a
              href="https://github.com/kbarnoski/resonance/blob/dream/sandbox/docs/dreams/IDEAS.md"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 transition-colors hover:bg-white/10"
            >
              Idea queue
            </a>
            <a
              href="https://github.com/kbarnoski/resonance/blob/dream/sandbox/docs/dreams/RESEARCH.md"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 transition-colors hover:bg-white/10"
            >
              Research log
            </a>
            <a
              href="https://claude.ai/code/routines/trig_018Bk8HoEkQnFqxgxK8rdD9h"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-violet-400/30 bg-violet-500/20 px-4 py-1.5 text-violet-100 transition-colors hover:bg-violet-500/30"
            >
              Agent logs →
            </a>
          </div>
        </div>
      </section>

      {/* ── Morning digest ────────────────────────────────────────── */}
      {morningMd && (
        <section className="border-b border-white/10 bg-violet-500/[0.04] px-6 py-8">
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 text-xs uppercase tracking-[0.3em] text-violet-300/70">
              ⭐ Morning digest
            </div>
            {renderMdSection(morningContentLines, "morning")}
          </div>
        </section>
      )}

      {/* ── Recent activity ───────────────────────────────────────── */}
      {recentCycles.length > 0 && (
        <section className="border-b border-white/10 px-6 py-8">
          <div className="mx-auto max-w-3xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.3em] text-white/50">
                Recent cycles
              </div>
              <Link
                href="/dream/history"
                className="text-xs text-violet-300 transition-colors hover:text-violet-100"
              >
                All {recentCycles[0].number} cycles →
              </Link>
            </div>
            <div className="space-y-3">
              {recentCycles.map((c, i) => (
                <div
                  key={c.number}
                  className={`rounded-xl border p-4 ${
                    i === 0
                      ? "border-violet-400/20 bg-violet-500/[0.06]"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <div className="mb-1 flex flex-wrap items-baseline gap-3">
                    <span className="font-mono text-xs text-white/40">
                      cycle {c.number}
                    </span>
                    <span className="text-sm text-white/85">{c.title}</span>
                  </div>
                  {c.date && (
                    <div className="mb-1.5 text-xs text-white/35">{c.date}</div>
                  )}
                  {c.decision && (
                    <p className="text-xs leading-relaxed text-white/50 line-clamp-2">
                      {c.decision.slice(0, 200)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Prototype grid ────────────────────────────────────────── */}
      <section className="px-6 py-10">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 text-xs uppercase tracking-[0.3em] text-white/50">
            All prototypes — {prototypes.length} total · newest first
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {prototypes.map((p) => (
              <Link
                key={p.slug}
                href={`/dream/${p.slug}`}
                className="group block rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-all hover:border-violet-400/30 hover:bg-white/[0.08]"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-mono text-xs text-white/40">
                    c{p.cycle}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      STATUS_STYLES[p.status] ?? STATUS_STYLES.demoable
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
                <h3 className="mb-1.5 font-serif text-lg transition-colors group-hover:text-violet-200">
                  {p.name}
                </h3>
                <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-white/50">
                  {p.description || "—"}
                </p>
                <span className="inline-flex items-center gap-1 text-sm text-violet-300 transition-colors group-hover:text-violet-100">
                  Launch{" "}
                  <span className="inline-block transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-6 text-center text-xs text-white/35">
        Sandboxed to{" "}
        <code className="text-white/55">dream/sandbox</code> · built by an
        ambient agent running 24/7 in Anthropic&apos;s cloud.{" "}
        <a
          href="https://github.com/kbarnoski/resonance/commits/dream/sandbox"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/50 transition-colors hover:text-white/70"
        >
          Git log
        </a>{" "}
        ·{" "}
        <a
          href="https://github.com/kbarnoski/resonance/blob/dream/sandbox/docs/dreams/AGENT.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/50 transition-colors hover:text-white/70"
        >
          Agent manual
        </a>
      </footer>
    </main>
  );
}
