import { readFile } from "fs/promises";
import path from "path";
import Link from "next/link";
import type { ReactNode } from "react";

export const dynamic = "force-static";

// ─── Tiny markdown renderer (no external deps) ───────────────────────────────

function inlineNodes(text: string, prefix: string): ReactNode {
  type Match = { start: number; end: number; node: ReactNode };
  const parts: ReactNode[] = [];
  let rest = text;
  let n = 0;

  while (rest.length > 0) {
    const boldM = /\*\*(.+?)\*\*/.exec(rest);
    const codeM = /`([^`]+)`/.exec(rest);
    const linkM = /\[([^\]]+)\]\(([^)]+)\)/.exec(rest);

    const matches: Match[] = [];
    if (boldM)
      matches.push({
        start: boldM.index,
        end: boldM.index + boldM[0].length,
        node: (
          <strong key={`${prefix}-b${n++}`} className="text-white font-semibold">
            {boldM[1]}
          </strong>
        ),
      });
    if (codeM)
      matches.push({
        start: codeM.index,
        end: codeM.index + codeM[0].length,
        node: (
          <code
            key={`${prefix}-c${n++}`}
            className="text-white/75 bg-white/[0.08] px-1.5 py-0.5 rounded text-[0.82em] tracking-normal"
          >
            {codeM[1]}
          </code>
        ),
      });
    if (linkM)
      matches.push({
        start: linkM.index,
        end: linkM.index + linkM[0].length,
        node: (
          <a
            key={`${prefix}-l${n++}`}
            href={linkM[2]}
            className="text-violet-300 underline underline-offset-2 hover:text-violet-100 transition-colors"
          >
            {linkM[1]}
          </a>
        ),
      });

    if (matches.length === 0) {
      parts.push(rest);
      break;
    }

    matches.sort((a, b) => a.start - b.start);
    const first = matches[0];
    if (first.start > 0) parts.push(rest.slice(0, first.start));
    parts.push(first.node);
    rest = rest.slice(first.end);
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

function renderMd(md: string): ReactNode[] {
  const lines = md.split("\n");
  const nodes: ReactNode[] = [];
  let idx = 0;

  while (idx < lines.length) {
    const line = lines[idx].trimEnd();

    if (line === "") {
      idx++;
      continue;
    }

    if (line === "---") {
      nodes.push(<hr key={idx} className="border-white/10 my-5" />);
      idx++;
      continue;
    }

    if (line.startsWith("# ")) {
      nodes.push(
        <h1 key={idx} className="text-lg md:text-xl tracking-tight text-white mb-1">
          {inlineNodes(line.slice(2), `h1-${idx}`)}
        </h1>
      );
      idx++;
      continue;
    }

    if (line.startsWith("## ")) {
      nodes.push(
        <h2 key={idx} className="text-[11px] tracking-widest uppercase text-white/40 mt-7 mb-2">
          {inlineNodes(line.slice(3), `h2-${idx}`)}
        </h2>
      );
      idx++;
      continue;
    }

    if (line.startsWith("### ")) {
      nodes.push(
        <h3 key={idx} className="text-sm text-white/70 font-semibold mt-4 mb-1">
          {inlineNodes(line.slice(4), `h3-${idx}`)}
        </h3>
      );
      idx++;
      continue;
    }

    if (line.startsWith("> ")) {
      nodes.push(
        <blockquote
          key={idx}
          className="border-l-2 border-white/15 pl-3 text-xs text-white/38 italic my-3"
        >
          {inlineNodes(line.slice(2), `bq-${idx}`)}
        </blockquote>
      );
      idx++;
      continue;
    }

    // Unordered list — collect consecutive bullets + indented continuations
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const startIdx = idx;
      const items: Array<{ text: string; key: number }> = [];
      while (idx < lines.length) {
        const l = lines[idx].trimEnd();
        if (l.startsWith("- ") || l.startsWith("* ")) {
          items.push({ text: l.slice(2), key: idx });
          idx++;
        } else if ((l.startsWith("  ") || l.startsWith("\t")) && items.length > 0) {
          // continuation of previous bullet
          items[items.length - 1].text += " " + l.trim();
          idx++;
        } else {
          break;
        }
      }
      nodes.push(
        <ul key={`ul-${startIdx}`} className="space-y-2 my-3">
          {items.map((it) => (
            <li key={it.key} className="flex gap-2 text-sm text-white/65 leading-relaxed">
              <span className="text-white/25 flex-shrink-0 select-none mt-0.5">–</span>
              <span>{inlineNodes(it.text, `li-${it.key}`)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const startIdx = idx;
      const items: Array<{ text: string; num: number; key: number }> = [];
      while (idx < lines.length && /^\d+\. /.test(lines[idx])) {
        const m = /^(\d+)\. (.*)/.exec(lines[idx]);
        if (m) items.push({ text: m[2], num: parseInt(m[1], 10), key: idx });
        idx++;
      }
      nodes.push(
        <ol key={`ol-${startIdx}`} className="space-y-2 my-3">
          {items.map((it) => (
            <li key={it.key} className="flex gap-2 text-sm text-white/65 leading-relaxed">
              <span className="text-white/25 flex-shrink-0 font-mono w-4 text-right">{it.num}.</span>
              <span>{inlineNodes(it.text, `oli-${it.key}`)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Plain paragraph
    nodes.push(
      <p key={idx} className="text-sm text-white/60 leading-relaxed my-2">
        {inlineNodes(line, `p-${idx}`)}
      </p>
    );
    idx++;
  }

  return nodes;
}

// ─── STATE.md cycle parser ───────────────────────────────────────────────────

type CycleEntry = {
  label: string;
  when: string;
  decided: string;
};

function parseCycles(md: string): CycleEntry[] {
  const chunks = md.split(/(?=^## Cycle)/m);
  const entries: CycleEntry[] = [];

  for (const chunk of chunks) {
    if (!chunk.startsWith("## Cycle")) continue;

    const lines = chunk.split("\n");
    const label = lines[0].replace(/^## /, "").trim().split(" — ")[0];

    const whenLine = lines.find((l) => l.startsWith("**When**:"));
    const when = whenLine ? whenLine.replace("**When**:", "").trim() : "";

    let decided = "";
    const decidedIdx = lines.findIndex((l) => l.startsWith("**Decided**"));
    const shippedIdx = lines.findIndex((l) => l.startsWith("**Shipped**"));

    if (decidedIdx > -1) {
      const same = lines[decidedIdx].replace("**Decided**:", "").trim();
      if (same) {
        decided = same.split(". ")[0].slice(0, 90);
      } else {
        const next = lines.slice(decidedIdx + 1).find((l) => l.trim().length > 0);
        if (next) decided = next.trim().split(". ")[0].slice(0, 90);
      }
    }
    if (!decided && shippedIdx > -1) {
      const bullet = lines.slice(shippedIdx + 1).find((l) => l.startsWith("- "));
      if (bullet) decided = bullet.slice(2).slice(0, 90);
    }

    entries.push({ label, when, decided });
  }

  return entries.slice(0, 5);
}

// ─── Prototype registry ──────────────────────────────────────────────────────

type PrototypeStatus = "skeleton" | "wip" | "demoable" | "polished";
type Prototype = {
  slug: string;
  title: string;
  status: PrototypeStatus;
  oneLiner: string;
};

const PROTOTYPES: Prototype[] = [
  {
    slug: "1-live",
    title: "Live Mic Viz",
    status: "demoable",
    oneLiner:
      "Mic input → 6-band FFT → radial color fields blooming from center. Low bass deep violet, highs white-hot.",
  },
  {
    slug: "2-ghost-lab",
    title: "Ghost LoRA Lab",
    status: "demoable",
    oneLiner:
      "A/B compare Ghost prompts at different LoRA scales. Vote which scenes feel right. Build intuition.",
  },
  {
    slug: "3-fluid",
    title: "Audio-Driven Fluid",
    status: "demoable",
    oneLiner:
      "Navier-Stokes ink-in-water. Bass = pressure pulses, treble = turbulence, spectral centroid = color.",
  },
  {
    slug: "4-operator",
    title: "Operator Panel",
    status: "demoable",
    oneLiner:
      "Performer view + scene library + MIDI map. What running Resonance live from a booth looks like.",
  },
  {
    slug: "5-arcs",
    title: "Journey Engine v2",
    status: "skeleton",
    oneLiner:
      "Pick an arc shape: EDM build-and-drop, cinematic three-act, ritual, sleep cycle.",
  },
];

const STATUS_STYLE: Record<PrototypeStatus, string> = {
  skeleton: "text-white/30 border-white/20",
  wip: "text-amber-300/80 border-amber-300/30",
  demoable: "text-emerald-300 border-emerald-300/40",
  polished: "text-violet-300 border-violet-300/50",
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function DreamDashboard() {
  const docsDir = path.join(process.cwd(), "docs/dreams");

  const [morningRaw, stateRaw] = await Promise.all([
    readFile(path.join(docsDir, "MORNING.md"), "utf8").catch(() => ""),
    readFile(path.join(docsDir, "STATE.md"), "utf8").catch(() => ""),
  ]);

  const cycles = parseCycles(stateRaw);

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">

      {/* ── Morning digest ───────────────────────────── */}
      <section className="mb-10 pb-10 border-b border-white/10" aria-label="Morning digest">
        {renderMd(morningRaw)}
      </section>

      {/* ── Recent cycle activity ─────────────────────── */}
      {cycles.length > 0 && (
        <section className="mb-10 pb-10 border-b border-white/10">
          <h2 className="text-[11px] tracking-widest uppercase text-white/35 mb-5">
            Recent cycles
          </h2>
          <ol className="space-y-4">
            {cycles.map((c) => (
              <li key={c.label} className="flex gap-3">
                <span className="text-[11px] font-mono text-violet-300/65 w-16 flex-shrink-0 pt-0.5">
                  {c.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/60 leading-snug">
                    {c.decided || "—"}
                  </p>
                  {c.when && (
                    <p className="text-[10px] text-white/25 mt-1">{c.when}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── Prototypes ───────────────────────────────── */}
      <section>
        <h2 className="text-[11px] tracking-widest uppercase text-white/35 mb-4">
          Prototypes
        </h2>
        <ol className="space-y-3">
          {PROTOTYPES.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/dream/${p.slug}`}
                className="block border rounded-md px-4 py-4 transition border-white/10 hover:border-white/30 hover:bg-white/[0.02]"
              >
                <div className="flex items-baseline justify-between mb-1">
                  <h3 className="text-sm text-white">
                    <span className="text-white/35 mr-2">{p.slug.split("-")[0]}.</span>
                    {p.title}
                  </h3>
                  <span
                    className={
                      "text-[10px] uppercase tracking-widest border px-2 py-0.5 rounded ml-3 flex-shrink-0 " +
                      STATUS_STYLE[p.status]
                    }
                  >
                    {p.status}
                  </span>
                </div>
                <p className="text-xs text-white/45 leading-relaxed">{p.oneLiner}</p>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Footer ──────────────────────────────────── */}
      <footer className="mt-14 pt-6 border-t border-white/10 text-[11px] text-white/25 space-y-1 leading-relaxed">
        <p>
          Updated each hour by the Dream Agent ·{" "}
          <code className="text-white/40">dream/sandbox</code> branch
        </p>
        <p>
          Stop the loop at{" "}
          <span className="text-white/38">claude.ai/code/routines</span>
        </p>
      </footer>
    </div>
  );
}
