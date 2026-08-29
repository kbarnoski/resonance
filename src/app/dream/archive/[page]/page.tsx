import Link from "next/link";
import { notFound } from "next/navigation";
import { VoteIndicator, VoteButtons } from "../../_shared/vote-buttons";
import {
  loadPrototypes,
  archivePageCount,
  ARCHIVE_PAGE_SIZE,
  STATUS_STYLES,
  CATEGORY_STYLES,
  CATEGORY_LABELS,
} from "../_scan";

// The archive is fully static: every page is prerendered at build from the
// shared scan (see ../_scan.ts), overriding the dream layout's
// force-dynamic default. ~60 protos per page keeps each HTML small while
// the index at /dream stays lean.
export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  const prototypes = await loadPrototypes();
  const totalPages = archivePageCount(prototypes.length);
  const params: { page: string }[] = [];
  for (let p = 1; p <= totalPages; p++) params.push({ page: String(p) });
  return params;
}

function Pager({ page, totalPages }: { page: number; totalPages: number }) {
  if (totalPages <= 1) return null;
  const btn =
    "rounded-full border border-border bg-muted px-4 py-2 text-xs transition-colors hover:bg-accent hover:text-foreground";
  return (
    <nav className="mt-8 flex items-center justify-between gap-4 text-muted-foreground">
      {page > 1 ? (
        <Link href={`/dream/archive/${page - 1}`} className={btn}>
          ← Newer
        </Link>
      ) : (
        <span />
      )}
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
        Page {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={`/dream/archive/${page + 1}`} className={btn}>
          Older →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export default async function DreamArchivePage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page: pageParam } = await params;
  const page = Number(pageParam);
  const prototypes = await loadPrototypes();
  const totalPages = archivePageCount(prototypes.length);

  if (!Number.isInteger(page) || page < 1 || page > totalPages) notFound();

  const start = (page - 1) * ARCHIVE_PAGE_SIZE;
  const slice = prototypes.slice(start, start + ARCHIVE_PAGE_SIZE);
  const rangeEnd = start + slice.length;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border px-6 py-5">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/dream"
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-primary"
          >
            ← Dream Lab
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Archive
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Every prototype the agent has built, newest first ·{" "}
            {start + 1}–{rangeEnd} of {prototypes.length}
          </p>
        </div>
      </section>

      <section className="px-6 pt-4 pb-10">
        <div className="mx-auto max-w-3xl">
          <ol className="divide-y divide-border/60">
            {slice.map((p) => (
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
                  {p.status !== "demoable" && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                        STATUS_STYLES[p.status] ?? STATUS_STYLES.demoable
                      }`}
                    >
                      {p.status}
                    </span>
                  )}
                  <span
                    className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] tracking-wide sm:inline ${CATEGORY_STYLES[p.category]}`}
                  >
                    {CATEGORY_LABELS[p.category]}
                  </span>
                  <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground md:block">
                    {p.description}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <VoteIndicator slug={p.slug} />
                    <VoteButtons slug={p.slug} compact stopPropagation />
                    <span className="text-sm text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      →
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>

          <Pager page={page} totalPages={totalPages} />
        </div>
      </section>

      <footer className="border-t border-border px-6 py-6 text-center text-xs text-muted-foreground/70">
        The freshest work lives on the{" "}
        <Link
          href="/dream"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          Dream Lab index
        </Link>
        .
      </footer>
    </main>
  );
}
