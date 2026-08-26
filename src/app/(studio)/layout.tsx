import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isOfflinePack } from "@/lib/offline/pack";
import { Sidebar } from "@/components/nav/sidebar";
import { StudioTracker } from "./studio-tracker";
import { ProfilePrompt } from "@/components/ui/profile-prompt";
import { NowPlayingBar } from "@/components/audio/now-playing-bar";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  // Offline kiosk (Tramokyo): no Supabase, trusted operator — skip auth.
  if (!isOfflinePack()) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar />
      <StudioTracker />
      <ProfilePrompt />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto overflow-x-hidden pt-14 md:pt-0">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
        </main>
        <NowPlayingBar />
      </div>
    </div>
  );
}
