/**
 * Pure reservation helpers (no Supabase imports, safe for Node tests).
 *
 * The data layer in `./rsvp` throws raw provider errors; these helpers turn
 * them into the small set of outcomes the UI can act on.
 */

export type ReservationAction = "reserve" | "cancel" | "load";

export type ReservationFailureKind =
  | "already-reserved"
  | "not-found"
  | "denied"
  | "network"
  | "unknown";

export interface ReservationFailure {
  kind: ReservationFailureKind;
  /** Safe, user-facing message. Never includes raw provider details. */
  message: string;
}

interface ErrorShape {
  code?: unknown;
  message?: unknown;
}

/**
 * Maps a failed reservation write/read to one actionable outcome.
 *
 * Duplicate detection relies on the database UNIQUE(event_id, user_id)
 * constraint, which stays correct even when two requests race: Postgres
 * reports unique-violation (SQLSTATE 23505, surfaced by PostgREST as 409).
 */
export function classifyReservationError(caught: unknown, action: ReservationAction): ReservationFailure {
  const shape: ErrorShape =
    typeof caught === "object" && caught !== null ? (caught as ErrorShape) : {};
  const code = typeof shape.code === "string" ? shape.code : "";
  const message = typeof shape.message === "string" ? shape.message : "";
  const haystack = `${code} ${message}`.toLowerCase();

  if (
    code === "23505" ||
    code === "409" ||
    haystack.includes("duplicate") ||
    haystack.includes("already exists") ||
    haystack.includes("unique")
  ) {
    if (action === "reserve") {
      return {
        kind: "already-reserved",
        message: "You're already going to this event. Your spot is saved.",
      };
    }
    return {
      kind: "unknown",
      message:
        action === "cancel"
          ? "We couldn't cancel this reservation. Please try again."
          : "We couldn't load reservations right now. Please try again.",
    };
  }

  if (haystack.includes("pgrst116")) {
    return { kind: "not-found", message: "We couldn't find that reservation." };
  }

  if (
    code === "42501" ||
    code === "403" ||
    haystack.includes("row-level security") ||
    haystack.includes("row level security") ||
    haystack.includes("permission denied") ||
    haystack.includes("not authorized")
  ) {
    return {
      kind: "denied",
      message:
        "Your reservation couldn't be saved because of a permissions issue. " +
        "If this keeps happening, the organizer RSVP database update may not be applied yet.",
    };
  }

  if (
    haystack.includes("failed to fetch") ||
    haystack.includes("fetch failed") ||
    haystack.includes("networkerror") ||
    haystack.includes("network error") ||
    haystack.includes("load failed") ||
    haystack.includes("timeout")
  ) {
    return {
      kind: "network",
      message: "Check your connection and try again.",
    };
  }

  if (action === "reserve") {
    return { kind: "unknown", message: "We couldn't reserve your spot. Please try again." };
  }
  if (action === "cancel") {
    return { kind: "unknown", message: "We couldn't cancel this reservation. Please try again." };
  }
  return { kind: "unknown", message: "We couldn't load reservations right now. Please try again." };
}

/** Short display date for "Reserved on …" labels. Pure and locale-pinned. */
export function formatReservationDate(iso: string): string {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "recently";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(time));
}

/** Best-effort attendee label that never leaks a full email by default. */
export function attendeeDisplayName(profile: { name: string | null; email: string | null } | null): string {
  if (profile?.name?.trim()) return profile.name.trim();
  const emailPrefix = profile?.email?.split("@")[0]?.trim();
  if (emailPrefix) return emailPrefix;
  return "Guest";
}
