import { HistoryView, PAGE_SIZE, loadCycles } from "./_lib";

export const dynamic = "force-static";

export default async function CycleHistoryPage() {
  const cycles = await loadCycles();
  const totalPages = Math.max(1, Math.ceil(cycles.length / PAGE_SIZE));

  return (
    <HistoryView
      cycles={cycles.slice(0, PAGE_SIZE)}
      page={1}
      totalPages={totalPages}
      totalCycles={cycles.length}
    />
  );
}
