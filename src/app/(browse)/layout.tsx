import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PillarNav } from "@/components/nav/pillar-nav";
import { ProfilePrompt } from "@/components/ui/profile-prompt";

// Browse-mode shell — used for the non-studio pillar destinations
// (/journeys, /vizes, /paths). Hosts the pillar nav at top (desktop) /
// bottom tab bar (mobile) but not the studio sidebar — these surfaces are
// peers of Studio, not children.
export default async function BrowseLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-black">
      <PillarNav />
      <ProfilePrompt />
      <main
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ paddingBottom: "calc(64px + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 md:pb-8">{children}</div>
      </main>
    </div>
  );
}
