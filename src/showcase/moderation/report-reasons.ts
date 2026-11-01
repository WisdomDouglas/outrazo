// Pure moderation-report helpers for Phase 2C-1 (safe to import anywhere,
// including server functions, public UI, and tests).
//
// These constants mirror the CHECK constraints in migration
// 20261102090000_moderation_reports_v1.sql. Both must be updated together if
// the reason or status lists ever change.

/** The five report reasons, in display order. */
export const REPORT_REASONS = [
  "spam",
  "misleading",
  "inappropriate",
  "scam",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam",
  misleading: "Misleading",
  inappropriate: "Inappropriate",
  scam: "Scam",
  other: "Other",
};

export const REPORT_REASON_DESCRIPTIONS: Record<ReportReason, string> = {
  spam: "Repetitive, irrelevant, or bulk-posted content.",
  misleading: "False or deceptive title, details, or expectations.",
  inappropriate: "Offensive, explicit, or otherwise unsuitable content.",
  scam: "Fraudulent event or suspicious payment request.",
  other: "Something else is wrong with this event.",
};

/** Report lifecycle: pending until staff dismiss or action it (terminal). */
export const REPORT_STATUSES = ["pending", "dismissed", "actioned"] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: "Pending review",
  dismissed: "Dismissed",
  actioned: "Actioned",
};

/** Terminal resolutions staff may apply to a pending report. */
export const REPORT_RESOLUTIONS = ["dismissed", "actioned"] as const;

export type ReportResolution = (typeof REPORT_RESOLUTIONS)[number];

/** Must match the migration: details CHECK (1000) and filing RPC. */
export const REPORT_DETAILS_MAX = 1000;

/** Must match the migration: resolution_note CHECK (500). */
export const REPORT_NOTE_MAX = 500;

/** Must match the migration: filings per reporter per rolling 24 hours. */
export const REPORT_DAILY_LIMIT = 10;

export function isReportReason(value: unknown): value is ReportReason {
  return (
    typeof value === "string" &&
    (REPORT_REASONS as readonly string[]).includes(value)
  );
}

export function isReportStatus(value: unknown): value is ReportStatus {
  return (
    typeof value === "string" &&
    (REPORT_STATUSES as readonly string[]).includes(value)
  );
}

export function isReportResolution(value: unknown): value is ReportResolution {
  return (
    typeof value === "string" &&
    (REPORT_RESOLUTIONS as readonly string[]).includes(value)
  );
}

// Validates a staff resolution request against the report's current status.
// Returns a friendly error message, or null when the transition may proceed.
// Pure so the transition matrix is unit-testable without a database.
export function checkResolutionTransition(status: ReportStatus): string | null {
  if (status !== "pending") {
    return "That report was already resolved. Refresh to see its current state.";
  }
  return null;
}

// Maps filing RPC failures to safe, user-friendly messages. Unknown database
// wording is never forwarded: callers show the retry message instead.
export function friendlyFilingError(message: string): string {
  if (/sign in is required/i.test(message)) {
    return "Sign in to report an event.";
  }
  if (/already reported this event/i.test(message)) {
    return "You have already reported this event. Our team will review it.";
  }
  if (/daily report limit/i.test(message)) {
    return `You have reached the daily report limit (${REPORT_DAILY_LIMIT} per day). Try again tomorrow.`;
  }
  if (/no longer exists/i.test(message)) {
    return "That event no longer exists.";
  }
  if (/too long/i.test(message)) {
    return `Keep details under ${REPORT_DETAILS_MAX} characters.`;
  }
  if (/unknown report reason/i.test(message)) {
    return "Choose a valid reason for the report.";
  }
  if (/no profile exists/i.test(message)) {
    return "Complete your profile setup, then try again.";
  }
  return "Could not submit the report. Please try again.";
}

// Maps resolution RPC failures to safe, staff-friendly messages.
export function friendlyResolutionError(message: string): string {
  if (/already resolved/i.test(message)) {
    return "That report was already resolved. Refresh to see its current state.";
  }
  if (/no longer exists/i.test(message)) {
    return "That report no longer exists. Refresh the list and try again.";
  }
  if (/only a super_admin or moderation_admin/i.test(message)) {
    return "Only moderation staff may resolve reports.";
  }
  if (/sign in is required/i.test(message)) {
    return "Sign in to use the admin console.";
  }
  if (/too long/i.test(message)) {
    return `Keep the resolution note under ${REPORT_NOTE_MAX} characters.`;
  }
  if (/unknown resolution/i.test(message)) {
    return "Choose a valid resolution.";
  }
  if (/cannot unpublish/i.test(message)) {
    return "A dismissed report cannot unpublish an event. Resolve it as actioned instead.";
  }
  return "Could not resolve the report. Please try again.";
}
