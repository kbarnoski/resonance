import { readFile } from "fs/promises";
import path from "path";
import Link from "next/link";
import type { ReactNode } from "react";

// Cycles per static page. Each cycle's full body is inlined into the HTML,
// so the whole archive on one page eventually exceeds Vercel's ~19 MB
// pre-render cap (FALLBACK_BODY_TOO_LARGE). Paginating keeps each static
// page small (~1.5-2 MB) while preserving every cycle, fully expandable.
export const PAGE_SIZE = 50;

export type Cycle = {
  number: number;
  title: string;
  date: string;
  body: string;
};

export async function loadCycles(): Promise<Cycle[]> {
  let md = "";
  try {
    md = await readFile(
      path.join(process.cwd(), "docs/dreams/STATE.md"),
      "utf-8"
    );
  } catch {
    return [];
  }

  const cycles: Cycle[] = [];
  const re = /##\s+Cycle\s+([\d.]+)\s+[—-]\s+([^\n]+)\n([\s\S]+?)(?=\n##\s+Cycle\s+[\d.]+\s+[—-]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const number = parseFloat(m[1]);
    const title = m[2].trim();
    const body = m[3].trim();
    const whenMatch = body.match(/\*\*When\*\*:\s*([^\n]+)/);
    const date = whenMatch ? whenMatch[1].trim() : "";
    cycles.push({ number, title, date, body });
  }

  return cycles.sort((a, b) => b.number - a.number);
}

function renderInline(text: string, baseKey: string): ReactNode {
  type Hit = { start: number; end: number; node: ReactNode };
  const parts: ReactNode[] = [];
  let rest = text;
  let n = 0;

  while (rest.length > 0) {
    const boldM = /\*\*([^*]+?)\*\*/.exec(rest);
    const codeM = /`([^`]+)`/.exec(rest);
    const linkM = /\[([^\]]+)\]\(([^)]+)\)/.exec(rest);

    const hits: Hit[] = [];
    if (boldM)
      hits.push({
        start: boldM.index,
        end: boldM.index + boldM[0].length,
        node: (
          <strong key={`${baseKey}-b${n++}`} className="font-semibold text-white">
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
            key={`${baseKey}-c${n++}`}
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
            key={`${baseKey}-l${n++}`}
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

function renderBody(body: string, baseKey: string): ReactNode[] {
  const lines = body.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];

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

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      out.push(
        <ul
          key={`${baseKey}-ul${k++}`}
          className="my-2 ml-5 list-disc space-y-1 text-sm text-white/75"
        >
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `${baseKey}-uli${k}-${idx}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

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
            <li key={idx}>{renderInline(it, `${baseKey}-oli${k}-${idx}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (line.trim() === "" || line.trim() === "---") {
      i++;
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !lines[i].startsWith("```") &&
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

function firstLine(body: string, label: string): string {
  const m = body.match(new RegExp(`\\*\\*${label}\\*\\*:\\s*([^\\n]+)`));
  return m ? m[1].trim().replace(/\*\*/g, "") : "";
}

function hrefForPage(p: number): string {
  return p <= 1 ? "/dream/history" : `/dream/history/${p}`;
}

function Pager({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}): ReactNode {
  if (totalPages <= 1) return null;
  return (
    <nav className="mx-auto mt-8 flex max-w-4xl items-center justify-between gap-4 text-sm">
      {page > 1 ? (
        <Link
          href={hrefForPage(page - 1)}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 transition-colors hover:bg-white/10"
        >
          ← Newer
        </Link>
      ) : (
        <span />
      )}
      <span className="text-white/40">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link
          href={hrefForPage(page + 1)}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 transition-colors hover:bg-white/10"
        >
          Older →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function HistoryView({
  cycles,
  page,
  totalPages,
  totalCycles,
}: {
  cycles: Cycle[];
  page: number;
  totalPages: number;
  totalCycles: number;
}): ReactNode {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10 px-6 py-12">
        <div className="mx-auto max-w-4xl">
          <Link
            href="/dream"
            className="text-xs uppercase tracking-[0.3em] text-violet-300/70 transition-colors hover:text-violet-200"
          >
            ← Back to dashboard
          </Link>
          <h1 className="mt-4 mb-3 font-serif text-4xl tracking-tight md:text-5xl">
            Cycle history
          </h1>
          <p className="max-w-2xl text-base text-white/60 md:text-lg">
            Every cycle the agent has run, preserved forever. {totalCycles}{" "}
            cycles · decisions, shipped work, observations, and what was queued
            next. Click any cycle to expand.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-sm">
            <a
              href="https://github.com/kbarnoski/resonance/blob/dream/sandbox/docs/dreams/STATE.md"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 transition-colors hover:bg-white/10"
            >
              STATE.md (source)
            </a>
            <a
              href="https://github.com/kbarnoski/resonance/commits/dream/sandbox"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 transition-colors hover:bg-white/10"
            >
              Git commits
            </a>
          </div>
        </div>
      </section>

      <section className="px-6 py-10">
        <div className="mx-auto max-w-4xl space-y-3">
          {cycles.length === 0 ? (
            <p className="text-white/50">No cycle history found in STATE.md.</p>
          ) : (
            cycles.map((c, idx) => {
              const decided = firstLine(c.body, "Decided");
              return (
                <details
                  key={c.number}
                  open={page === 1 && idx < 2}
                  className="group rounded-xl border border-white/10 bg-white/[0.03] transition-colors open:bg-white/[0.05]"
                >
                  <summary className="cursor-pointer list-none p-5 transition-colors hover:bg-white/[0.05]">
                    <div className="flex flex-wrap items-baseline gap-3">
                      <span className="font-mono text-xs text-white/40">
                        cycle {c.number}
                      </span>
                      <span className="font-serif text-lg text-white group-open:text-violet-200">
                        {c.title}
                      </span>
                    </div>
                    {c.date && (
                      <div className="mt-1 text-xs text-white/40">{c.date}</div>
                    )}
                    {decided && (
                      <p className="mt-3 text-sm leading-relaxed text-white/55 line-clamp-2 group-open:hidden">
                        {decided.slice(0, 220)}
                      </p>
                    )}
                  </summary>
                  <div className="border-t border-white/10 px-5 pb-5 pt-4">
                    {renderBody(c.body, `c${c.number}`)}
                  </div>
                </details>
              );
            })
          )}
        </div>

        <Pager page={page} totalPages={totalPages} />
      </section>

      <footer className="border-t border-white/10 px-6 py-8 text-center text-sm text-white/40">
        Source: STATE.md on{" "}
        <code className="text-white/60">dream/sandbox</code> · written each
        cycle by the agent itself.
      </footer>
    </main>
  );
}
