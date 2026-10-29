import { useEffect, useState, useSyncExternalStore } from "react";

import { supabase } from "@/integrations/supabase/external-client";
import {
  attendeeChannelName,
  attendeeEventFilter,
  COUNTS_CHANNEL,
  extractCountUpdate,
  reduceCountUpdate,
} from "./live-counts";

/**
 * Process-wide live attendee counts.
 *
 * One refcounted Realtime channel serves every mounted consumer, so ten
 * components showing counts still cost a single subscription. Counts are
 * assigned only from authoritative absolute values (initial fetch, Realtime
 * `new.attendee_count`, single-row refetch) — nothing here ever adds or
 * subtracts, so echoes and out-of-order messages converge instead of
 * double-counting.
 *
 * SSR safety: this module state only mutates inside browser event handlers
 * and subscription callbacks, which never run during server rendering, so
 * the map is always empty on the server and no user's counts leak into
 * another user's HTML.
 */

let counts: Map<string, number> = new Map();
const listeners = new Set<() => void>();
let channel: ReturnType<typeof supabase.channel> | null = null;
let consumers = 0;
let warned = false;

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribeToStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getCountsSnapshot(): Map<string, number> {
  return counts;
}

function applyUpdate(eventId: string, count: number): void {
  const next = reduceCountUpdate(counts, { eventId, count });
  if (!next) return;
  counts = next;
  emit();
}

function ensureCountsChannel(): void {
  consumers += 1;
  if (channel) return;
  const next = supabase.channel(COUNTS_CHANNEL, {
    config: { postgres_changes_options: { wait: true } },
  });
  next.on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "events" },
    (payload) => {
      const update = extractCountUpdate(payload);
      if (update) applyUpdate(update.eventId, update.count);
    },
  );
  next.subscribe((status, error) => {
    if (status === "SUBSCRIBED") return;
    if (!warned) {
      warned = true;
      console.warn(
        "[live-counts] realtime status: " +
          status +
          "; counts stay at last-known values. Is the realtime publication migration applied?",
        error ?? "",
      );
    }
  });
  channel = next;
}

function releaseCountsChannel(): void {
  consumers = Math.max(0, consumers - 1);
  if (consumers > 0 || !channel) return;
  const stale = channel;
  channel = null;
  void stale.unsubscribe();
}

/** Live counts snapshot; re-renders the caller whenever any count changes. */
export function useLiveCountsMap(): Map<string, number> {
  useEffect(() => {
    ensureCountsChannel();
    return () => {
      releaseCountsChannel();
    };
  }, []);
  return useSyncExternalStore(subscribeToStore, getCountsSnapshot, getCountsSnapshot);
}

/** Live count for one event, falling back to a seed (e.g. loader data). */
export function useLiveCount(eventId: string | undefined | null, seed: number | undefined): number {
  const liveCounts = useLiveCountsMap();
  if (!eventId) return seed ?? 0;
  return liveCounts.get(eventId) ?? seed ?? 0;
}

/**
 * Refreshes one event's count from the database. Never throws: on any
 * failure it stays silent and the next Realtime echo converges instead.
 */
export async function refreshLiveCount(eventId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("events")
      .select("attendee_count")
      .eq("id", eventId)
      .maybeSingle();
    if (error) {
      console.warn("[live-counts] failed to refresh event count:", error);
      return;
    }
    if (!data) return;
    const count = data.attendee_count;
    if (typeof count !== "number" || !Number.isFinite(count) || count < 0) {
      console.warn("[live-counts] received an invalid event count:", eventId);
      return;
    }
    applyUpdate(eventId, Math.floor(count));
  } catch (caught) {
    console.warn("[live-counts] failed to refresh event count:", caught);
  }
}

/**
 * Ticks whenever RSVPs change for one event. Consumers refetch their list;
 * the returned number is only a change counter, not a count.
 */
export function useLiveAttendeesSignal(eventId: string | null): number {
  const [signal, setSignal] = useState(0);
  useEffect(() => {
    if (!eventId) return;
    const attendeeChannel = supabase.channel(attendeeChannelName(eventId));
    const bump = () => setSignal((current) => current + 1);
    const filter = attendeeEventFilter(eventId);
    attendeeChannel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "event_attendees", filter },
      bump,
    );
    attendeeChannel.on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "event_attendees", filter },
      bump,
    );
    attendeeChannel.subscribe();
    return () => {
      void attendeeChannel.unsubscribe();
    };
  }, [eventId]);
  return signal;
}
