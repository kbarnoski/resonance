import { readFile, readdir } from "fs/promises";
import path from "path";
import Link from "next/link";

export const dynamic = "force-static";

type Prototype = {
  slug: string;
  cycle: number;
  name: string;
  status: string;
  description: string;
};

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
        readme = await readFile(path.join(dreamDir, slug, "README.md"), "utf-8");
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
      const description = cleanProse(para.join(" ")).slice(0, 240);

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

function extractNewSection(morning: string): string | null {
  const m = morning.match(/##\s+New since yesterday\s*\n([\s\S]+?)(?=\n##\s|$)/);
  return m ? m[1].trim() : null;
}

export default async function DreamPage() {
  const [prototypes, morning] = await Promise.all([loadPrototypes(), loadMorning()]);
  const newSection = extractNewSection(morning);
  const lastUpdated = morning.match(/last updated ([^\n]+)/)?.[1] ?? "";
  const latestCycle = morning.match(/Cycle\s+(\d+)/)?.[1] ?? "";

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="mb-3 text-xs uppercase tracking-[0.3em] text-violet-300/70">
            Resonance · Dream Lab
          </div>
          <h1 className="mb-4 font-serif text-4xl tracking-tight md:text-6xl">
            What the dream agent has been building
          </h1>
          <p className="max-w-2xl text-base text-white/60 md:text-lg">
            An autonomous agent runs in Anthropic&apos;s cloud every hour, day
            and night, shipping audio-visual prototypes into this sandbox.
            <span className="ml-1 text-white/80">
              {prototypes.length} prototypes
              {latestCycle ? ` · last cycle ${latestCycle}` : ""}
              {lastUpdated ? ` · updated ${lastUpdated}` : ""}
            </span>
            .
          </p>

          <div className="mt-8 flex flex-wrap gap-2 text-sm">
            <Link
              href="/dream/history"
              className="rounded-full border border-violet-400/30 bg-violet-500/15 px-4 py-2 text-violet-100 transition-colors hover:bg-violet-500/25"
            >
              ↻ Cycle history
            </Link>
            <a
              href="https://github.com/kbarnoski/resonance/blob/dream/sandbox/docs/dreams/MORNING.md"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 transition-colors hover:bg-white/10"
            >
              Morning digest
            </a>
            <a
              href="https://github.com/kbarnoski/resonance/blob/dream/sandbox/docs/dreams/IDEAS.md"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 transition-colors hover:bg-white/10"
            >
              Idea queue
            </a>
            <a
              href="https://github.com/kbarnoski/resonance/blob/dream/sandbox/docs/dreams/RESEARCH.md"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 transition-colors hover:bg-white/10"
            >
              Research log
            </a>
            <a
              href="https://github.com/kbarnoski/resonance/commits/dream/sandbox"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 transition-colors hover:bg-white/10"
            >
              All cycles
            </a>
            <a
              href="https://claude.ai/code/routines/trig_018Bk8HoEkQnFqxgxK8rdD9h"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-violet-400/30 bg-violet-500/20 px-4 py-2 text-violet-100 transition-colors hover:bg-violet-500/30"
            >
              Agent run logs →
            </a>
          </div>
        </div>
      </section>

      {newSection && (
        <section className="border-b border-white/10 bg-violet-500/5 px-6 py-10">
          <div className="mx-auto max-w-5xl">
            <div className="mb-3 text-xs uppercase tracking-[0.3em] text-violet-300/70">
              ⭐ Fresh from the agent
            </div>
            <h2 className="mb-4 font-serif text-2xl">New since yesterday</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/75">
              {cleanProse(newSection).replace(/→/g, "\n→").trim()}
            </p>
          </div>
        </section>
      )}

      <section className="px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 text-xs uppercase tracking-[0.3em] text-white/50">
            All prototypes — {prototypes.length} total · newest first
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {prototypes.map((p) => (
              <Link
                key={p.slug}
                href={`/dream/${p.slug}`}
                className="group block rounded-2xl border border-white/10 bg-white/[0.04] p-6 transition-all hover:border-violet-400/30 hover:bg-white/[0.08]"
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="font-mono text-xs text-white/40">
                    cycle {p.cycle}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      STATUS_STYLES[p.status] ?? STATUS_STYLES.demoable
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
                <h3 className="mb-2 font-serif text-xl transition-colors group-hover:text-violet-200">
                  {p.name}
                </h3>
                <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-white/55">
                  {p.description || "—"}
                </p>
                <div className="inline-flex items-center gap-1 text-sm text-violet-300 transition-colors group-hover:text-violet-100">
                  Launch{" "}
                  <span className="inline-block transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-8 text-center text-sm text-white/40">
        Sandboxed to{" "}
        <code className="text-white/60">dream/sandbox</code> branch · built by
        an ambient agent running 24/7 in Anthropic&apos;s cloud.
      </footer>
    </main>
  );
}
