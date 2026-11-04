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

// ── Promotion pricing (pure; shared by the admin UI, server, and tests) ──────
// Money travels as integer kobo everywhere. The 10000 floor mirrors the
// set_promotion_price() RPC (NGN 100 minimum transaction, 1-day minimum);
// the ceiling is a typo guard only — the RPC enforces the floor again.
/** Minimum daily rate in kobo (NGN 100). Mirrors the database RPC. */
export const PROMOTION_MIN_DAILY_KOBO = 10_000;
/** Maximum daily rate in kobo (NGN 1,000,000). Typo guard, not a promise. */
export const PROMOTION_MAX_DAILY_KOBO = 100_000_000;

export type ParsedPriceKobo =
  | { ok: true; kobo: number }
  | { ok: false; error: string };

// Parses staff naira input ("2000", "2,000", "₦2,000.50") into integer kobo.
// Returns a friendly error instead of throwing so the form can show it inline.
export function parsePriceNairaToKobo(input: string): ParsedPriceKobo {
  const cleaned = input.replace(/[₦,\s]/g, "").trim();
  if (!cleaned) {
    return { ok: false, error: "Enter a daily price in naira." };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { ok: false, error: "Enter a plain amount like 2000 or 2500.50." };
  }
  const kobo = Math.round(Number(cleaned) * 100);
  if (!Number.isSafeInteger(kobo)) {
    return { ok: false, error: "That amount is too large to save safely." };
  }
  if (kobo < PROMOTION_MIN_DAILY_KOBO) {
    return { ok: false, error: "The daily price must be at least ₦100." };
  }
  if (kobo > PROMOTION_MAX_DAILY_KOBO) {
    return { ok: false, error: "The daily price cannot exceed ₦1,000,000." };
  }
  return { ok: true, kobo };
}

// Formats integer kobo for staff display: "₦2,000" for whole naira,
// "₦2,500.50" when kobo remain (always two digits, never "₦2,500.5").
export function formatKoboToNaira(kobo: number): string {
  const decimals = kobo % 100 === 0 ? 0 : 2;
  return `₦${(kobo / 100).toLocaleString("en-NG", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

// Maps set_promotion_price() RPC failures to safe, staff-friendly messages.
// Sign-in is checked first: the RPC's own sign-in message also mentions
// "manage promotion pricing", so the role pattern would swallow it otherwise.
export function friendlyPricingError(message: string): string {
  if (/sign in is required/i.test(message)) {
    return "Sign in to use the admin console.";
  }
  if (/super_admin.*finance_admin|manage promotion pricing/i.test(message)) {
    return "Only a super admin or finance admin may change promotion pricing.";
  }
  if (/at least 10000 kobo|at least ₦100/i.test(message)) {
    return "The daily price must be at least ₦100.";
  }
  return "Could not save the new price. Please try again.";
}
