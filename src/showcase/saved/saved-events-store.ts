import { useSyncExternalStore } from "react";

import { supabase } from "@/integrations/supabase/external-client";

/**
 * Shared, account-backed saved-events store. Every Save button reads the same
 * state, so saving on one card updates every card and the Saved page at once.
 * Rows live in `user_saved_events` (user_id, event_key) on the connected project.
 */
type Status = "idle" | "loading" | "ready" | "error";

interface State {
  userId: string | null;
  keys: string[];
  status: Status;
  toast: { id: number; message: string } | null;
}

let state: State = { userId: null, keys: [], status: "idle", toast: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const SERVER_STATE = state;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("user_saved_events");
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showSavedToast(message: string) {
  clearTimeout(toastTimer);
  set({ toast: { id: Date.now(), message } });
  toastTimer = setTimeout(() => set({ toast: null }), 2600);
}

export async function loadSavedEvents(userId: string | null) {
  if (!userId) return set({ userId: null, keys: [], status: "idle" });
  set({ userId, status: "loading" });
  const { data, error } = await table().select("event_key").eq("user_id", userId).order("created_at", { ascending: false });
  if (state.userId !== userId) return;
  if (error) return set({ status: "error" });
  set({ keys: (data as { event_key: string }[]).map((row) => row.event_key), status: "ready" });
}

/** Returns false when nobody is signed in so the caller can send them to Login. */
export async function toggleSavedEvent(eventKey: string): Promise<boolean> {
  const userId = state.userId;
  if (!userId) return false;
  const wasSaved = state.keys.includes(eventKey);
  set({ keys: wasSaved ? state.keys.filter((key) => key !== eventKey) : [eventKey, ...state.keys] });
  const { error } = wasSaved
    ? await table().delete().eq("user_id", userId).eq("event_key", eventKey)
    : await table().upsert({ user_id: userId, event_key: eventKey }, { onConflict: "user_id,event_key", ignoreDuplicates: true });
  if (error) {
    set({ keys: wasSaved ? [eventKey, ...state.keys] : state.keys.filter((key) => key !== eventKey) });
    showSavedToast("Couldn’t update saved events. Try again.");
  } else showSavedToast(wasSaved ? "Removed from saved" : "Event saved");
  return true;
}

export function useSavedEventsState() {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}

export const RETURN_TO_KEY = "outrazo-return-to";
export function rememberReturnTo(path: string) {
  try {
    window.sessionStorage.setItem(RETURN_TO_KEY, path);
  } catch {
    /* storage unavailable */
  }
}
export function takeReturnTo(): string | null {
  try {
    const value = window.sessionStorage.getItem(RETURN_TO_KEY);
    window.sessionStorage.removeItem(RETURN_TO_KEY);
    return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
  } catch {
    return null;
  }
}
