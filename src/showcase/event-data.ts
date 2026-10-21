import { supabase } from "@/integrations/supabase/external-client";
import {
  EVENTS,
  getAttendees,
  getEvent,
  getOrganizer,
  type CategoryId,
  type EventDetails,
  type Organizer,
  type OutrazoEvent,
  type TicketTier,
} from "./sample-data";

type EventRow = import("@/integrations/supabase/types").Database["public"]["Tables"]["events"]["Row"];
type OrganizerRow = import("@/integrations/supabase/types").Database["public"]["Tables"]["organizers"]["Row"];
type TierRow = import("@/integrations/supabase/types").Database["public"]["Tables"]["event_ticket_tiers"]["Row"];

const EVENT_CATEGORIES: Exclude<CategoryId, "all">[] = [
  "parties",
  "music",
  "tech",
  "business",
  "culture",
  "food",
  "sports",
];

const formatEventDate = (value: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-NG", { ...options, timeZone: "Africa/Lagos" }).format(new Date(value));

const toOrganizer = (row: OrganizerRow | undefined, id: string): Organizer => {
  if (!row) return getOrganizer(id);
  return {
    id: row.id,
    name: row.name,
    community: row.community ?? "Independent organizer",
    ...(row.description ? { description: row.description } : {}),
    ...(row.avatar_url ? { avatarSrc: row.avatar_url } : {}),
    ...(row.location ? { location: row.location } : {}),
    verified: row.verified,
  };
};

const toTicketTier = (row: TierRow): TicketTier => ({
  id: row.id,
  name: row.name,
  price: Number(row.price),
  quantity: row.quantity,
});

function toEvent(row: EventRow, organizer?: OrganizerRow, tiers: TierRow[] = []): EventDetails {
  const city = row.city ?? "";
  const venueName = row.venue_name ?? row.address ?? city;
  const address = row.address ?? venueName;
  const eventOrganizer = toOrganizer(organizer, row.organizer_id);
  const category = EVENT_CATEGORIES.includes(row.category as Exclude<CategoryId, "all">)
    ? (row.category as Exclude<CategoryId, "all">)
    : "culture";
  const ticketTiers = tiers.map(toTicketTier);
  const endsAt = row.ends_at ? new Date(row.ends_at) : null;
  const isPaid = row.event_type === "paid";

  return {
    id: row.id,
    title: row.title,
    imageSrc: row.image_url ?? "",
    date: formatEventDate(row.starts_at, { weekday: "short", day: "numeric", month: "short" }),
    time: formatEventDate(row.starts_at, { hour: "numeric", minute: "2-digit" }),
    startsAt: row.starts_at,
    endTime: endsAt ? formatEventDate(row.ends_at ?? "", { hour: "numeric", minute: "2-digit" }) : undefined,
    location: [venueName, city].filter(Boolean).join(", "),
    city,
    ...(isPaid && row.price_from !== null
      ? { price: `₦${new Intl.NumberFormat("en-NG").format(Number(row.price_from))}` }
      : {}),
    organizerId: row.organizer_id,
    organizerDetails: eventOrganizer,
    category,
    attendeeCount: row.attendee_count,
    attendeeIds: [],
    summary: row.summary ?? "",
    description: row.description ?? "",
    venue: {
      name: venueName,
      address,
      city,
      latitude: row.latitude ?? undefined,
      longitude: row.longitude ?? undefined,
    },
    ticketTiers,
    status: row.status === "cancelled" || row.status === "sold-out" ? row.status : "upcoming",
    organizer: eventOrganizer,
    attendees: getAttendees([]),
    eventType: isPaid ? "paid" : "free",
    capacity: row.capacity,
  };
}

/** Public catalogue: RLS and the explicit published filter both exclude drafts. */
export async function fetchPublishedEvents(): Promise<OutrazoEvent[]> {
  const { data: rows, error } = await supabase
    .from("events")
    .select("*")
    .eq("published", true)
    .order("starts_at", { ascending: true })
    .limit(250);
  if (error) throw new Error(`Could not load published events: ${error.message}`);
  if (!rows.length) return [];

  const organizerIds = [...new Set(rows.map((row) => row.organizer_id))];
  const { data: organizers, error: organizerError } = await supabase
    .from("organizers")
    .select("*")
    .in("id", organizerIds);
  if (organizerError) throw new Error(`Could not load event organizers: ${organizerError.message}`);

  const organizersById = new Map((organizers ?? []).map((organizer) => [organizer.id, organizer]));
  return rows.map((row) => toEvent(row, organizersById.get(row.organizer_id)));
}

export async function fetchPublishedEventDetails(id: string): Promise<EventDetails | undefined> {
  const demoEvent = getEvent(id);
  if (demoEvent) return demoEvent;

  const { data: row, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .eq("published", true)
    .maybeSingle();
  if (error) throw new Error(`Could not load this event: ${error.message}`);
  if (!row) return undefined;

  const [{ data: organizer, error: organizerError }, { data: tiers, error: tiersError }] =
    await Promise.all([
      supabase.from("organizers").select("*").eq("id", row.organizer_id).maybeSingle(),
      supabase.from("event_ticket_tiers").select("*").eq("event_id", row.id).order("price"),
    ]);
  if (organizerError) throw new Error(`Could not load the event organizer: ${organizerError.message}`);
  if (tiersError) throw new Error(`Could not load ticket options: ${tiersError.message}`);

  return toEvent(row, organizer ?? undefined, tiers ?? []);
}

export async function fetchPublishedOrganizerProfile(id: string) {
  const { data: organizer, error } = await supabase
    .from("organizers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load this organizer: ${error.message}`);
  if (!organizer) return undefined;

  const events = await fetchPublishedEvents();
  return {
    organizer: toOrganizer(organizer, id),
    events: events.filter((event) => event.organizerId === id),
  };
}

export function mergeEventCatalog(remote: OutrazoEvent[], local: OutrazoEvent[] = EVENTS) {
  const byId = new Map(local.map((event) => [event.id, event]));
  remote.forEach((event) => byId.set(event.id, event));
  return [...byId.values()];
}
