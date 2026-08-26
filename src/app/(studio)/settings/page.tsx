import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SettingsClient } from "./settings-client";

export const metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  return (
    <SettingsClient
      userId={user.id}
      email={user.email ?? ""}
      displayName={profile?.display_name ?? ""}
    />
  );
}
