import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";

// localStorage keys — fast local cache
const LS_BLOCKED = "resonance-blocked-shaders";
const LS_LOVED = "resonance-loved-shaders";
const LS_DELETED = "resonance-deleted-shaders";

interface ShaderPreferencesState {
  blocked: Set<string>;
  loved: Set<string>;
  deleted: Set<string>;
  loaded: boolean;

  load: () => void;
  blockShader: (mode: string) => void;
  unblockShader: (mode: string) => void;
  loveShader: (mode: string) => void;
  unloveShader: (mode: string) => void;
  deleteShader: (mode: string) => void;
  undeleteShader: (mode: string) => void;
}

function readLS(key: string): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function writeLS(key: string, set: Set<string>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch { /* storage full */ }
}

function persistLocal() {
  const state = useShaderPreferences.getState();
  // CRITICAL: never write to localStorage from an unloaded store.
  if (!state.loaded) return;
  writeLS(LS_BLOCKED, state.blocked);
  writeLS(LS_LOVED, state.loved);
  writeLS(LS_DELETED, state.deleted);
}

// ─── Supabase sync (fire-and-forget) ───

function supabaseSync(mode: string, status: "blocked" | "loved" | "deleted") {
  const sb = createClient();
  sb.auth.getUser().then(({ data: { user } }) => {
    if (!user) return;
    sb.from("user_shader_preferences")
      .upsert(
        { user_id: user.id, shader_mode: mode, status },
        { onConflict: "user_id,shader_mode" }
      )
      .then(() => {});
  });
}

function supabaseRemove(mode: string) {
  const sb = createClient();
  sb.auth.getUser().then(({ data: { user } }) => {
    if (!user) return;
    sb.from("user_shader_preferences")
      .delete()
      .eq("user_id", user.id)
      .eq("shader_mode", mode)
      .then(() => {});
  });
}

async function supabaseFetchAll(): Promise<{
  blocked: Set<string>;
  loved: Set<string>;
  deleted: Set<string>;
} | null> {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const { data, error } = await sb.from("user_shader_preferences")
      .select("shader_mode, status")
      .eq("user_id", user.id);
    if (error || !data) return null;
    const blocked = new Set<string>();
    const loved = new Set<string>();
    const deleted = new Set<string>();
    for (const row of data) {
      if (row.status === "blocked") blocked.add(row.shader_mode);
      else if (row.status === "loved") loved.add(row.shader_mode);
      else if (row.status === "deleted") deleted.add(row.shader_mode);
    }
    return { blocked, loved, deleted };
  } catch {
    return null;
  }
}

// ─── Persist: localStorage + Supabase ───

function persist(mode: string, newStatus: "blocked" | "loved" | "deleted" | null) {
  persistLocal();
  if (newStatus) {
    supabaseSync(mode, newStatus);
  } else {
    supabaseRemove(mode);
  }
}

// ─── Store ───

export const useShaderPreferences = create<ShaderPreferencesState>((set, get) => ({
  blocked: new Set(),
  loved: new Set(),
  deleted: new Set(),
  loaded: false,

  load() {
    // 1. Read localStorage immediately (fast, synchronous)
    const lsBlocked = readLS(LS_BLOCKED);
    const lsLoved = readLS(LS_LOVED);
    const lsDeleted = readLS(LS_DELETED);
    const lsHasData = lsBlocked.size > 0 || lsLoved.size > 0 || lsDeleted.size > 0;

    // Set from localStorage first so UI renders immediately
    set({ blocked: lsBlocked, loved: lsLoved, deleted: lsDeleted, loaded: true });

    // 2. Fetch from Supabase in background — MERGE, never replace
    supabaseFetchAll().then((remote) => {
      if (!remote) return;

      // Build a merged map: shader → status
      // Start with localStorage entries, then layer Supabase on top.
      // For conflicts (same shader, different status), Supabase wins
      // because it's the shared cross-device state.
      // Shaders that only exist in one source are always kept.
      const merged = new Map<string, "blocked" | "loved" | "deleted">();

      // Local first
      for (const m of lsBlocked) merged.set(m, "blocked");
      for (const m of lsLoved) merged.set(m, "loved");
      for (const m of lsDeleted) merged.set(m, "deleted");

      // Supabase overwrites conflicts, adds new entries
      for (const m of remote.blocked) merged.set(m, "blocked");
      for (const m of remote.loved) merged.set(m, "loved");
      for (const m of remote.deleted) merged.set(m, "deleted");

      // Rebuild sets from merged map
      const blocked = new Set<string>();
      const loved = new Set<string>();
      const deleted = new Set<string>();
      for (const [m, status] of merged) {
        if (status === "blocked") blocked.add(m);
        else if (status === "loved") loved.add(m);
        else if (status === "deleted") deleted.add(m);
      }

      // Update store + localStorage
      set({ blocked, loved, deleted });
      writeLS(LS_BLOCKED, blocked);
      writeLS(LS_LOVED, loved);
      writeLS(LS_DELETED, deleted);

      // Push any local-only entries up to Supabase so they persist
      const newForSupabase: { shader_mode: string; status: string }[] = [];
      for (const [m, status] of merged) {
        const inRemote =
          remote.blocked.has(m) || remote.loved.has(m) || remote.deleted.has(m);
        if (!inRemote) {
          newForSupabase.push({ shader_mode: m, status });
        }
      }
      if (newForSupabase.length > 0) {
        const sb = createClient();
        sb.auth.getUser().then(({ data: { user } }) => {
          if (!user) return;
          const rows = newForSupabase.map((r) => ({
            user_id: user.id,
            ...r,
          }));
          sb.from("user_shader_preferences")
            .upsert(rows, { onConflict: "user_id,shader_mode" })
            .then(() => {});
        });
      }
    });
  },

  blockShader(mode: string) {
    if (!get().loaded) get().load();
    const state = get();
    const newBlocked = new Set(state.blocked);
    newBlocked.add(mode);
    const newLoved = new Set(state.loved);
    newLoved.delete(mode);
    set({ blocked: newBlocked, loved: newLoved });
    persist(mode, "blocked");
  },

  unblockShader(mode: string) {
    if (!get().loaded) get().load();
    const newBlocked = new Set(get().blocked);
    newBlocked.delete(mode);
    set({ blocked: newBlocked });
    persist(mode, null);
  },

  loveShader(mode: string) {
    if (!get().loaded) get().load();
    const state = get();
    const newLoved = new Set(state.loved);
    newLoved.add(mode);
    const newBlocked = new Set(state.blocked);
    newBlocked.delete(mode);
    set({ loved: newLoved, blocked: newBlocked });
    persist(mode, "loved");
  },

  unloveShader(mode: string) {
    if (!get().loaded) get().load();
    const newLoved = new Set(get().loved);
    newLoved.delete(mode);
    set({ loved: newLoved });
    persist(mode, null);
  },

  deleteShader(mode: string) {
    if (!get().loaded) get().load();
    const state = get();
    const newDeleted = new Set(state.deleted);
    newDeleted.add(mode);
    const newBlocked = new Set(state.blocked);
    newBlocked.delete(mode);
    const newLoved = new Set(state.loved);
    newLoved.delete(mode);
    set({ deleted: newDeleted, blocked: newBlocked, loved: newLoved });
    persist(mode, "deleted");
  },

  undeleteShader(mode: string) {
    if (!get().loaded) get().load();
    const newDeleted = new Set(get().deleted);
    newDeleted.delete(mode);
    set({ deleted: newDeleted });
    persist(mode, null);
  },
}));

/** Get user-blocked shaders synchronously (reads from Zustand store) */
export function getUserBlockedShaders(): Set<string> {
  return useShaderPreferences.getState().blocked;
}

/** Get user-deleted shaders synchronously (reads from Zustand store) */
export function getUserDeletedShaders(): Set<string> {
  return useShaderPreferences.getState().deleted;
}
