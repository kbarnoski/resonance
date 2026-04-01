import { Sidebar } from "@/components/nav/sidebar";
import { StudioTracker } from "./studio-tracker";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-black">
      <Sidebar />
      <StudioTracker />
      <main className="flex-1 overflow-y-auto overflow-x-hidden pt-14 md:pt-0">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      </main>
    </div>
  );
}
