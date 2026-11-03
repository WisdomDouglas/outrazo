// Pure promotion-window helpers for Phase 2C-2 (safe to import anywhere,
// including server functions, public UI, and tests).
//
// Display statuses mirror the database range semantics '[)': a promotion is
// active from its start instant up to (not including) its end instant.

/** The four promotion lifecycle states shown in the admin console. */
export const PROMOTION_DISPLAY_STATUSES = [
  "scheduled",
  "active",
  "expired",
  "cancelled",
] as const;

export type PromotionDisplayStatus = (typeof PROMOTION_DISPLAY_STATUSES)[number];

export const PROMOTION_STATUS_LABELS: Record<PromotionDisplayStatus, string> = {
  scheduled: "Scheduled",
  active: "Active now",
  expired: "Expired",
  cancelled: "Cancelled",
};

export interface PromotionWindowLike {
  status: string;
  starts_at: string;
  ends_at: string;
}

// Derives the display state of a promotion row at a reference instant.
// Cancelled rows stay cancelled whatever the window; live rows compare the
// window against now with '[)' bounds, exactly like the database range.
export function computePromotionStatus(
  row: PromotionWindowLike,
  nowIso: string = new Date().toISOString(),
): PromotionDisplayStatus {
  if (row.status === "cancelled") return "cancelled";
  const now = new Date(nowIso).getTime();
  const starts = new Date(row.starts_at).getTime();
  const ends = new Date(row.ends_at).getTime();
  if (Number.isNaN(starts) || Number.isNaN(ends) || Number.isNaN(now)) return "expired";
  if (starts > now) return "scheduled";
  if (ends <= now) return "expired";
  return "active";
}

// Validates a promotion window for creation. Returns a friendly error message,
// or null when the window may be submitted. Pure so the rule matrix is
// unit-testable without a database; the RPC re-validates everything.
export function checkPromotionWindow(
  startsIso: string,
  endsIso: string,
  nowIso: string = new Date().toISOString(),
): string | null {
  if (!startsIso || !endsIso) {
    return "Choose a promotion start and end.";
  }
  const starts = new Date(startsIso).getTime();
  const ends = new Date(endsIso).getTime();
  const now = new Date(nowIso).getTime();
  if (Number.isNaN(starts) || Number.isNaN(ends)) {
    return "Choose a valid date and time for the promotion window.";
  }
  if (starts >= ends) {
    return "The promotion must start before it ends.";
  }
  if (ends <= now) {
    return "That window already ended. Choose an end time in the future.";
  }
  return null;
}

// Fallback for unknown promotion failures. Exported so server bridges can
// tell "mapped, expected" failures (no log needed) from unknown ones.
export const PROMOTION_UNKNOWN_ERROR = "Could not save the promotion. Please try again.";

// Maps promotion RPC failures to safe, staff-friendly messages. Unknown
// database wording is never forwarded: callers show the retry message instead.
// Used by the server RPC bridges so UI and server share one mapping.
export function friendlyPromotionError(message: string): string {
  if (/overlaps an existing promotion|violates exclusion constraint/i.test(message)) {
    return "That window overlaps an existing promotion for this event. Different events can promote at the same time.";
  }
  if (/only published, non-cancelled events/i.test(message)) {
    return "Only published, non-cancelled events can be promoted.";
  }
  if (/no longer exists/i.test(message)) {
    return message.includes("promotion")
      ? "That promotion no longer exists."
      : "That event no longer exists.";
  }
  if (/already cancelled/i.test(message)) {
    return "That promotion was already cancelled. Refresh to see its current state.";
  }
  if (/already ended/i.test(message)) {
    return "That promotion already ended.";
  }
  if (/only a super_admin or moderation_admin/i.test(message)) {
    return "Only moderation staff may manage promotions.";
  }
  if (/sign in is required/i.test(message)) {
    return "Sign in to use the admin console.";
  }
  if (/before it ends/i.test(message)) {
    return "The promotion must start before it ends.";
  }
  if (/already ended|in the future/i.test(message)) {
    return "That window already ended. Choose an end time in the future.";
  }
  if (/valid date|start and end/i.test(message)) {
    return "Choose a valid start and end for the promotion window.";
  }
  return PROMOTION_UNKNOWN_ERROR;
}
