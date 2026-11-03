// Scout review contracts (pure module: attribution wording, approval
// validation. No secrets, no network, no database).
//
// The attribution string is the approved product wording, built server-side
// from provenance — the reviewer only confirms it, never authors it.
import { z } from "zod";

export const SCOUT_EVENT_CATEGORIES = [
  "parties",
  "music",
  "tech",
  "business",
  "culture",
  "food",
  "sports",
] as const;

/** Exact approved wording. Organizer falls back, never blanks. */
export function buildScoutAttribution(input: {
  organizerName: string | null;
  sourceUrl: string;
  reviewDateIso: string;
}): string {
  const organizer = input.organizerName?.trim() || "(unknown organizer)";
  const date = input.reviewDateIso.slice(0, 10);
  return (
    `Community listing discovered by Outrazo Scout. ` +
    `Original organizer: ${organizer}. Source: ${input.sourceUrl}. ` +
    `Source reviewed by Outrazo staff on ${date}.`
  );
}

export const approvalOverridesSchema = z.object({
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().min(10).max(500),
  description: z.string().trim().min(20).max(8000),
  category: z.enum(SCOUT_EVENT_CATEGORIES),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  venueName: z.string().trim().min(2).max(200),
  address: z.string().trim().min(2).max(300),
  city: z.string().trim().min(2).max(100),
  capacity: z.number().int().min(1).max(1_000_000),
  externalTicketUrl: z.string().url().startsWith("https://").max(500).nullable(),
});

export type ApprovalOverrides = z.infer<typeof approvalOverridesSchema>;

export type ApprovalCheck = { ok: true } | { ok: false; reason: string };

/** Mirrors create-event rules: future start, end after start. */
export function checkApprovalDates(startsAt: string, endsAt: string, nowMs: number): ApprovalCheck {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return { ok: false, reason: "Start and end must be valid dates." };
  }
  if (start <= nowMs) return { ok: false, reason: "Start time must be in the future." };
  if (end <= start) return { ok: false, reason: "End time must be after the start time." };
  return { ok: true };
}

/**
 * Draft slug mirroring the create-event convention (title slug + id suffix),
 * because events.slug is NOT NULL UNIQUE with no default. Falls back to
 * "event" when the title has no URL-safe characters.
 */
export function scoutDraftSlug(title: string, eventId: string): string {
  const stem =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "event";
  return `${stem}-${eventId.slice(0, 8)}`;
}

/**
 * Cover must be the reviewer's own upload in the event-covers bucket —
 * never a hotlinked external image.
 */
export function isReviewerCoverUrl(url: string, supabaseUrl: string, userId: string): boolean {
  const prefix = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/event-covers/${userId}/`;
  return url.startsWith(prefix) && url.length < 1000;
}
