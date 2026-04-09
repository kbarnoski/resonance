import { create } from "zustand";

// localStorage keys — primary persistent store
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

function persist() {
  const state = useShaderPreferences.getState();
  // CRITICAL: never write to localStorage from an unloaded store.
  // HMR resets the module — the store starts empty with loaded=false.
  // Writing empty sets would destroy the user's saved preferences.
  if (!state.loaded) return;
  writeLS(LS_BLOCKED, state.blocked);
  writeLS(LS_LOVED, state.loved);
  writeLS(LS_DELETED, state.deleted);
  syncToServer(state);
}

function syncToServer(state: { blocked: Set<string>; loved: Set<string>; deleted: Set<string> }) {
  if (typeof fetch === "undefined") return;
  fetch("/api/shader-prefs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blocked: [...state.blocked],
      loved: [...state.loved],
      deleted: [...state.deleted],
    }),
  }).catch(() => {});
}

export const useShaderPreferences = create<ShaderPreferencesState>((set, get) => ({
  blocked: new Set(),
  loved: new Set(),
  deleted: new Set(),
  loaded: false,

  load() {
    // Always re-read from localStorage — even if previously loaded.
    // This ensures HMR module resets pick up the persisted data.
    const blocked = readLS(LS_BLOCKED);
    const loved = readLS(LS_LOVED);
    const deleted = readLS(LS_DELETED);
    set({ blocked, loved, deleted, loaded: true });
    syncToServer({ blocked, loved, deleted });
  },

  blockShader(mode: string) {
    if (!get().loaded) get().load();
    const state = get();
    const newBlocked = new Set(state.blocked);
    newBlocked.add(mode);
    const newLoved = new Set(state.loved);
    newLoved.delete(mode);
    set({ blocked: newBlocked, loved: newLoved });
    persist();
  },

  unblockShader(mode: string) {
    if (!get().loaded) get().load();
    const newBlocked = new Set(get().blocked);
    newBlocked.delete(mode);
    set({ blocked: newBlocked });
    persist();
  },

  loveShader(mode: string) {
    if (!get().loaded) get().load();
    const state = get();
    const newLoved = new Set(state.loved);
    newLoved.add(mode);
    const newBlocked = new Set(state.blocked);
    newBlocked.delete(mode);
    set({ loved: newLoved, blocked: newBlocked });
    persist();
  },

  unloveShader(mode: string) {
    if (!get().loaded) get().load();
    const newLoved = new Set(get().loved);
    newLoved.delete(mode);
    set({ loved: newLoved });
    persist();
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
    persist();
  },

  undeleteShader(mode: string) {
    if (!get().loaded) get().load();
    const newDeleted = new Set(get().deleted);
    newDeleted.delete(mode);
    set({ deleted: newDeleted });
    persist();
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
