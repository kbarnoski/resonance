import { notFound } from "next/navigation";
import { HistoryView, PAGE_SIZE, loadCycles } from "../_lib";

export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  const cycles = await loadCycles();
  const totalPages = Math.max(1, Math.ceil(cycles.length / PAGE_SIZE));
  // Page 1 is served by /dream/history; generate 2..totalPages here.
  const params: { page: string }[] = [];
  for (let p = 2; p <= totalPages; p++) params.push({ page: String(p) });
  return params;
}

export default async function CycleHistoryPagedPage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page: pageParam } = await params;
  const page = Number(pageParam);
  const cycles = await loadCycles();
  const totalPages = Math.max(1, Math.ceil(cycles.length / PAGE_SIZE));

  if (!Number.isInteger(page) || page < 2 || page > totalPages) notFound();

  const start = (page - 1) * PAGE_SIZE;
  return (
    <HistoryView
      cycles={cycles.slice(start, start + PAGE_SIZE)}
      page={page}
      totalPages={totalPages}
      totalCycles={cycles.length}
    />
  );
}
