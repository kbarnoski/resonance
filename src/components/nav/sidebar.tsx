"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Library,
  Upload,
  FolderOpen,
  BarChart3,
  LogOut,
  GitCompareArrows,
  Disc3,
  Menu,
  X,
} from "lucide-react";

const navItems = [
  { href: "/library", label: "Library", icon: Library },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/compare", label: "Compare", icon: GitCompareArrows },
  { href: "/collections", label: "Collections", icon: FolderOpen },
  { href: "/insights", label: "Insights", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const logo = (
    <div className="flex items-center gap-2.5">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-6 w-6 text-white/70"
        strokeWidth="1.5"
        stroke="currentColor"
      >
        <path
          d="M12 3C12 3 12 8 12 12C12 16 12 21 12 21"
          strokeLinecap="round"
        />
        <path
          d="M12 7C14.5 7 16.5 5.5 16.5 3.5"
          strokeLinecap="round"
        />
        <path
          d="M12 12C9 12 6.5 10 6.5 7.5"
          strokeLinecap="round"
        />
        <path
          d="M12 17C15 17 17.5 15 17.5 12.5"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-base font-light tracking-tight text-white/90">Resonance</span>
    </div>
  );

  const navContent = (
    <>
      <nav className="flex-1 space-y-1 px-2 py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-white/[0.08] text-white/90"
                  : "text-white/40 hover:text-white/70 hover:bg-white/[0.05]"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-2">
        <Link
          href="/room"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-all
            bg-white/[0.05] border border-white/10 text-white/60 hover:text-white
            hover:bg-white/10 hover:border-white/15"
        >
          <Disc3 className="h-4 w-4" />
          Enter The Room
        </Link>
      </div>

      <div className="border-t border-white/[0.06] px-2 py-2">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2.5 text-white/30 hover:text-white/60 hover:bg-white/[0.05] text-sm h-9"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-white/[0.06] bg-black px-4 md:hidden">
        {logo}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-white/40 hover:text-white/70"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile slide-over sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-white/[0.06] bg-black pt-14 transition-transform duration-200 ease-in-out md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {navContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden h-full w-56 flex-col border-r border-white/[0.06] md:flex">
        <div className="px-5 py-4">
          {logo}
        </div>
        {navContent}
      </aside>
    </>
  );
}
