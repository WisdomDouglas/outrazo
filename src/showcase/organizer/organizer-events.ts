import { supabase } from "@/integrations/supabase/external-client";
import { toEvent } from "@/showcase/event-data";
import type { EventDetails } from "@/showcase/sample-data";

/** One database event owned by the signed-in organizer, ready for display. */
export interface OrganizerEvent {
  id: string;
  details: EventDetails;
  published: boolean;
  status: string;
}

/**
 * The signed-in organizer's own events, drafts included. Never returns demo
 * content: every row comes from the database with created_by = userId.
 * Draft rows require the organizer-dashboard SELECT policy to be applied;
 * without it RLS silently hides drafts and only published rows come back.
 */
export async function fetchOrganizerEvents(userId: string): Promise<OrganizerEvent[]> {
  const { data: rows, error } = await supabase
    .from("events")
    .select("*")
    .eq("created_by", userId)
    .order("starts_at", { ascending: true })
    .limit(250);
  if (error) throw new Error(`Could not load your events: ${error.message}`);
  return (rows ?? []).map((row) => ({
    id: row.id,
    details: toEvent(row),
    published: row.published,
    status: row.status,
  }));
}

/**
 * Publishes or unpublishes one owned event. Unpublishing hides it from
 * public discovery without deleting anything. The update is scoped to the
 * caller's own rows; RLS ("Creators update events") enforces ownership.
 */
export async function setEventPublished(
  eventId: string,
  userId: string,
  published: boolean,
): Promise<{ id: string; published: boolean }> {
  const { data, error } = await supabase
    .from("events")
    .update({ published })
    .eq("id", eventId)
    .eq("created_by", userId)
    .select("id, published")
    .single();
  if (error || !data) {
    throw new Error(
      published
        ? `Could not publish this event: ${error?.message ?? "it may belong to another account."}`
        : `Could not unpublish this event: ${error?.message ?? "it may belong to another account."}`,
    );
  }
  return data;
}
