"use client";

import { useState } from "react";
import { Monitor, ExternalLink, User, Mail, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const DESKTOP_DOWNLOAD_URL =
  "https://github.com/kbarnoski/resonance/releases/latest/download/Resonance_0.1.0_aarch64.dmg";

interface SettingsClientProps {
  userId: string;
  email: string;
  displayName: string;
}

export function SettingsClient({
  userId,
  email,
  displayName,
}: SettingsClientProps) {
  const [name, setName] = useState(displayName);
  const [newEmail, setNewEmail] = useState(email);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  async function handleSaveName() {
    setSavingName(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: name.trim() })
        .eq("id", userId);
      if (error) throw error;
      toast.success("Display name updated");
    } catch {
      toast.error("Failed to update display name");
    } finally {
      setSavingName(false);
    }
  }

  async function handleUpdateEmail() {
    setSavingEmail(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        email: newEmail.trim(),
      });
      if (error) throw error;
      toast.success("Confirmation sent to your new email");
    } catch {
      toast.error("Failed to update email");
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleUpdatePassword() {
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setSavingPassword(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated");
      setPassword("");
      setConfirmPassword("");
    } catch {
      toast.error("Failed to update password");
    } finally {
      setSavingPassword(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/80 placeholder-white/30 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.06]";
  const buttonClass =
    "inline-flex shrink-0 items-center rounded-md bg-white/[0.08] px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.12] hover:text-white/90 disabled:opacity-40 disabled:pointer-events-none";

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-light tracking-tight text-white/90">
          Settings
        </h1>
        <p className="mt-1 text-sm text-white/40">
          Manage your Resonance experience
        </p>
      </div>

      {/* Profile */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-white/30">
          Profile
        </h2>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
              <User className="h-5 w-5 text-white/50" />
            </div>
            <div className="flex-1 space-y-3">
              <div className="space-y-1.5">
                <h3 className="text-sm font-medium text-white/80">
                  Display name
                </h3>
                <p className="text-sm text-white/40">
                  This is how your name appears on shared journeys
                </p>
              </div>
              <div className="flex gap-3">
                <input
                  id="settings-display-name"
                  name="displayName"
                  type="text"
                  autoComplete="name"
                  aria-label="Display name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={handleSaveName}
                  disabled={savingName || name.trim() === displayName}
                  className={buttonClass}
                >
                  {savingName ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Email */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-white/30">
          Email
        </h2>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
              <Mail className="h-5 w-5 text-white/50" />
            </div>
            <div className="flex-1 space-y-3">
              <div className="space-y-1.5">
                <h3 className="text-sm font-medium text-white/80">
                  Email address
                </h3>
                <p className="text-sm text-white/40">
                  A confirmation will be sent to your new email
                </p>
              </div>
              <div className="flex gap-3">
                <input
                  id="settings-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  aria-label="Email address"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={handleUpdateEmail}
                  disabled={
                    savingEmail || newEmail.trim() === email || !newEmail.trim()
                  }
                  className={buttonClass}
                >
                  {savingEmail ? "Updating…" : "Update"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Password */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-white/30">
          Password
        </h2>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
              <Lock className="h-5 w-5 text-white/50" />
            </div>
            <div className="flex-1 space-y-3">
              <div className="space-y-1.5">
                <h3 className="text-sm font-medium text-white/80">
                  Change password
                </h3>
                <p className="text-sm text-white/40">
                  Must be at least 6 characters
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  id="settings-new-password"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  aria-label="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="New password"
                  className={inputClass}
                />
                <input
                  id="settings-confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  aria-label="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={handleUpdatePassword}
                  disabled={savingPassword || !password}
                  className={buttonClass}
                >
                  {savingPassword ? "Updating…" : "Update"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Desktop App */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-white/30">
          Desktop App
        </h2>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
              <Monitor className="h-5 w-5 text-white/50" />
            </div>
            <div className="flex-1 space-y-1.5">
              <h3 className="text-sm font-medium text-white/80">
                Resonance for macOS
              </h3>
              <p className="text-sm leading-relaxed text-white/40">
                Native desktop app with true kiosk mode — no browser chrome, no
                &ldquo;Press Escape&rdquo; overlays. Ideal for full-screen
                playback, installation mode, and live performance.
              </p>
            </div>
            <a
              href={DESKTOP_DOWNLOAD_URL}
              className="inline-flex shrink-0 items-center gap-2 rounded-md bg-white/[0.08] px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.12] hover:text-white/90"
            >
              Download
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
