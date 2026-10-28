import { supabase } from "@/integrations/supabase/external-client";
import { toEvent } from "@/showcase/event-data";
import type { EventDetails } from "@/showcase/sample-data";

/** One RSVP row belonging to the signed-in user. */
export interface MyReservation {
  eventId: string;
  reservedAt: string;
  event: EventDetails;
}

/** One attendee of an organizer's own event. */
export interface EventAttendee {
  userId: string;
  reservedAt: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export interface ReservationRow {
  id: string;
  reservedAt: string;
}

/**
 * The signed-in user's existing reservation for one event, if any.
 * RLS ("Attendees read own rsvps") restricts this to the caller's own row.
 */
export async function fetchReservation(
  eventId: string,
  userId: string,
): Promise<ReservationRow | null> {
  const { data, error } = await supabase
    .from("event_attendees")
    .select("id, created_at")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, reservedAt: data.created_at };
}

/**
 * Reserves a spot. Throws the raw provider error on failure so the caller
 * can classify it (duplicate 23505/409 means "already going").
 */
export async function createReservation(
  eventId: string,
  userId: string,
): Promise<ReservationRow> {
  const { data, error } = await supabase
    .from("event_attendees")
    .insert({ event_id: eventId, user_id: userId })
    .select("id, created_at")
    .single();
  if (error) throw error;
  return { id: data.id, reservedAt: data.created_at };
}

/** Cancels the caller's own reservation. RLS rejects anyone else's row. */
export async function cancelReservation(eventId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("event_attendees")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", userId);
  if (error) throw error;
}

/**
 * The signed-in user's reservations with event cards. Events are mapped with
 * the same converter as the rest of the app, so cards stay consistent.
 */
export async function fetchMyReservations(userId: string): Promise<MyReservation[]> {
  const { data: rows, error } = await supabase
    .from("event_attendees")
    .select("event_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(250);
  if (error) throw new Error(`Could not load your tickets: ${error.message}`);
  if (!rows.length) return [];

  const eventIds = [...new Set(rows.map((row) => row.event_id))];
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("*")
    .in("id", eventIds);
  if (eventsError) throw new Error(`Could not load your tickets: ${eventsError.message}`);

  const detailsById = new Map((events ?? []).map((row) => [row.id, toEvent(row)]));
  return rows.flatMap((row) => {
    const event = detailsById.get(row.event_id);
    // The event row may be gone (or unreadable); skip it rather than crash.
    if (!event) return [];
    return [{ eventId: row.event_id, reservedAt: row.created_at, event }];
  });
}

/**
 * Attendees of one event. Callers must only pass events the signed-in user
 * organizes; the database policy ("Event organizers read their attendees")
 * enforces the same rule, so other organizers' lists always come back empty.
 */
export async function fetchEventAttendees(eventId: string): Promise<EventAttendee[]> {
  const { data: rows, error } = await supabase
    .from("event_attendees")
    .select("user_id, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) throw new Error(`Could not load attendees: ${error.message}`);
  if (!rows.length) return [];

  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, name, email, avatar_url")
    .in("id", userIds);
  if (profilesError) throw new Error(`Could not load attendees: ${profilesError.message}`);

  const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  return rows.map((row) => {
    const profile = profilesById.get(row.user_id);
    return {
      userId: row.user_id,
      reservedAt: row.created_at,
      name: profile?.name ?? null,
      email: profile?.email ?? null,
      avatarUrl: profile?.avatar_url ?? null,
    };
  });
}
