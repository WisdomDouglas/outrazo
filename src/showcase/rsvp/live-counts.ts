/**
 * Pure live-count helpers (no Supabase imports, safe for Node tests).
 *
 * Every count flowing through here is an absolute authoritative value.
 * Nothing in the realtime path ever increments or decrements, which is what
 * makes duplicate, delayed, or out-of-order messages converge safely instead
 * of double-counting.
 */

/** Shared channel every count consumer multiplexes onto. */
export const COUNTS_CHANNEL = "event-attendee-counts";

export interface CountUpdate {
  eventId: string;
  count: number;
}

/** Extracts a validated count from a postgres_changes UPDATE payload. */
export function extractCountUpdate(payload: unknown): CountUpdate | null {
  if (typeof payload !== "object" || payload === null) return null;
  const envelope = payload as { eventType?: unknown; new?: unknown };
  if (envelope.eventType !== "UPDATE") return null;
  const row = envelope.new;
  if (typeof row !== "object" || row === null) return null;
  const record = row as { id?: unknown; attendee_count?: unknown };
  if (typeof record.id !== "string" || record.id.length === 0) return null;
  if (
    typeof record.attendee_count !== "number" ||
    !Number.isFinite(record.attendee_count) ||
    record.attendee_count < 0
  ) {
    return null;
  }
  return { eventId: record.id, count: Math.floor(record.attendee_count) };
}

/**
 * Applies an absolute count update. Returns the next map, or null when
 * nothing changed so callers can skip notifying subscribers.
 */
export function reduceCountUpdate(
  current: Map<string, number>,
  update: CountUpdate,
): Map<string, number> | null {
  if (current.get(update.eventId) === update.count) return null;
  const next = new Map(current);
  next.set(update.eventId, update.count);
  return next;
}

/** Per-event channel name + server-side filter for attendee-list signals. */
export function attendeeChannelName(eventId: string): string {
  return `attendees:${eventId}`;
}

export function attendeeEventFilter(eventId: string): string {
  return `event_id=eq.${eventId}`;
}
