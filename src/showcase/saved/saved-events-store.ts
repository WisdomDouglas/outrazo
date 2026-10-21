import { useSyncExternalStore } from "react";

import { supabase } from "@/integrations/supabase/external-client";

/**
 * Shared, account-backed saved-events store. Every Save button reads the same
 * state, so saving on one card updates every card and the Saved page at once.
 * Database event IDs live in `saved_events`; demo-event IDs stay in local storage.
 */
type Status = "idle" | "loading" | "ready" | "error";

interface State {
  userId: string | null;
  keys: string[];
  demoKeys: string[];
  demoStatus: "loading" | "ready";
  status: Status;
  toast: { id: number; message: string } | null;
}

const DEMO_SAVED_EVENTS_KEY = "outrazo-saved-events";
const DATABASE_EVENT_ID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

let state: State = {
  userId: null,
  keys: [],
  demoKeys: [],
  demoStatus: "loading",
  status: "idle",
  toast: null,
};
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

export const isDatabaseEventId = (id: string) => DATABASE_EVENT_ID.test(id);

export function loadLocalSavedEvents() {
  try {
    const stored = window.localStorage.getItem(DEMO_SAVED_EVENTS_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    const demoKeys = Array.isArray(parsed)
      ? [...new Set(parsed.filter((key): key is string => typeof key === "string" && !isDatabaseEventId(key)))]
      : [];
    set({ demoKeys, demoStatus: "ready" });
  } catch {
    set({ demoStatus: "ready" });
    showSavedToast("Couldn’t load locally saved events.");
  }
}

export function toggleLocalSavedEvent(eventId: string) {
  const wasSaved = state.demoKeys.includes(eventId);
  const demoKeys = wasSaved
    ? state.demoKeys.filter((key) => key !== eventId)
    : [eventId, ...state.demoKeys];
  set({ demoKeys, demoStatus: "ready" });
  try {
    window.localStorage.setItem(DEMO_SAVED_EVENTS_KEY, JSON.stringify(demoKeys));
    showSavedToast(wasSaved ? "Removed from saved" : "Saved on this device");
  } catch {
    showSavedToast("Couldn’t save this event on this device.");
  }
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let savedEventsRequest = 0;
const pendingEventIds = new Set<string>();

export function showSavedToast(message: string) {
  clearTimeout(toastTimer);
  set({ toast: { id: Date.now(), message } });
  toastTimer = setTimeout(() => set({ toast: null }), 2600);
}

export async function loadSavedEvents(userId: string | null) {
  const request = ++savedEventsRequest;
  if (!userId) return set({ userId: null, keys: [], status: "idle" });
  set({ userId, status: "loading" });
  try {
    const { data, error } = await supabase
      .from("saved_events")
      .select("event_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (state.userId !== userId || request !== savedEventsRequest) return;
    if (error) {
      set({ status: "error" });
      return;
    }
    set({ keys: data.map((row) => row.event_id), status: "ready" });
  } catch {
    if (state.userId === userId && request === savedEventsRequest) set({ status: "error" });
  }
}

/** Returns false when nobody is signed in so the caller can send them to Login. */
export async function toggleSavedEvent(eventId: string): Promise<boolean> {
  const userId = state.userId;
  if (!userId) return false;
  if (pendingEventIds.has(eventId)) return true;
  pendingEventIds.add(eventId);

  const wasSaved = state.keys.includes(eventId);
  set({
    keys: wasSaved ? state.keys.filter((key) => key !== eventId) : [eventId, ...state.keys],
  });

  try {
    const { error } = wasSaved
      ? await supabase.from("saved_events").delete().eq("user_id", userId).eq("event_id", eventId)
      : await supabase.from("saved_events").upsert(
          { user_id: userId, event_id: eventId },
          { onConflict: "user_id,event_id", ignoreDuplicates: true },
        );
    if (state.userId !== userId) return true;
    if (error) {
      set({
        keys: wasSaved
          ? state.keys.includes(eventId) ? state.keys : [eventId, ...state.keys]
          : state.keys.filter((key) => key !== eventId),
      });
      showSavedToast("Couldn’t update saved events. Try again.");
    } else {
      showSavedToast(wasSaved ? "Removed from saved" : "Event saved");
    }
  } catch {
    if (state.userId === userId) {
      set({
        keys: wasSaved
          ? state.keys.includes(eventId) ? state.keys : [eventId, ...state.keys]
          : state.keys.filter((key) => key !== eventId),
      });
      showSavedToast("Couldn’t update saved events. Try again.");
    }
  } finally {
    pendingEventIds.delete(eventId);
  }
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
