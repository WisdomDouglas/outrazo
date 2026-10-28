import { EVENTS, getOrganizer, type OutrazoEvent } from "@/showcase/sample-data";
import { normalizePlace, shortStateLabel, stateMatchesEventCity } from "./locations";

/**
 * Natural-language discovery matching.
 *
 * Pure helpers shared by the interpretation server function (date math) and
 * the Explore page (filtering + display). Matching always runs against loaded
 * event records: the AI only ever produces filter values, never event data.
 */

export interface NLDiscoveryFilters {
  /** Explicitly requested place, or null when the query names none. */
  location: string | null;
  /**
   * "city" matches one city exactly; "state" matches every known city in
   * the state. Ignored when location is null.
   */
  locationKind: "city" | "state";
  category: string;
  /** Inclusive YYYY-MM-DD bounds in Africa/Lagos. Both set or both null. */
  dateFrom: string | null;
  dateTo: string | null;
  price: "any" | "free" | "paid";
  keywords: string[];
}

/**
 * Africa/Lagos is UTC+1 year-round with no daylight saving, so every local
 * day is exactly 24 hours and date math below is exact without a timezone
 * library. Stored event times are UTC ISO strings (e.g. "2026-09-12T19:00:00Z").
 */
const LAGOS_OFFSET_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar date (YYYY-MM-DD) of an instant in Africa/Lagos. */
export function lagosDayOfInstant(instant: Date): string {
  return new Date(instant.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** Weekday in Africa/Lagos: 0 = Sunday … 6 = Saturday. */
export function lagosWeekday(instant: Date): number {
  const lagosDays = Math.floor((instant.getTime() + LAGOS_OFFSET_MS) / DAY_MS);
  // 1970-01-01 was a Thursday.
  return (((lagosDays + 4) % 7) + 7) % 7;
}

export function lagosWeekdayName(instant: Date): string {
  return WEEKDAY_NAMES[lagosWeekday(instant)] ?? "";
}

/** Calendar date (YYYY-MM-DD) of a day offset from an instant in Lagos. */
export function addLagosDays(instant: Date, days: number): string {
  return lagosDayOfInstant(new Date(instant.getTime() + days * DAY_MS));
}

export function isRealCalendarDate(value: string): boolean {
  if (!ISO_DAY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Lagos calendar date of a stored UTC event start, or null if unparseable. */
export function eventDayInLagos(startsAt: string): string | null {
  if (!startsAt) return null;
  const time = new Date(startsAt).getTime();
  if (Number.isNaN(time)) return null;
  return lagosDayOfInstant(new Date(time));
}

const DEMO_EVENT_IDS = new Set(EVENTS.map((event) => event.id));

/** Demo records use slug ids; real published records use UUIDs. */
export function isDemoEventId(id: string): boolean {
  return DEMO_EVENT_IDS.has(id);
}

/**
 * True when a stored event record satisfies every active NL constraint.
 * Constraints combine with AND; keywords combine with OR. Invalid date
 * bounds are ignored rather than excluding everything.
 */
export function matchNLQuery(event: OutrazoEvent, filters: NLDiscoveryFilters): boolean {
  if (filters.location) {
    if (filters.locationKind === "state") {
      if (!stateMatchesEventCity(filters.location, event.city)) return false;
    } else if (normalizePlace(event.city) !== normalizePlace(filters.location)) {
      return false;
    }
  }
  if (filters.category !== "any" && event.category !== filters.category) {
    return false;
  }
  const { dateFrom, dateTo } = filters;
  if (dateFrom && dateTo) {
    if (isRealCalendarDate(dateFrom) && isRealCalendarDate(dateTo) && dateFrom <= dateTo) {
      const day = eventDayInLagos(event.startsAt ?? "");
      if (!day || day < dateFrom || day > dateTo) return false;
    }
  }
  // Same free/paid meaning as the existing filter panel: free events carry
  // no display price, in both demo and real records.
  if (filters.price === "free" && event.price) return false;
  if (filters.price === "paid" && !event.price) return false;
  if (filters.keywords.length > 0) {
    const organizerName =
      event.organizerDetails?.name ?? getOrganizer(event.organizerId).name;
    const haystack = [
      event.title,
      event.summary ?? "",
      event.description ?? "",
      event.location,
      event.city,
      organizerName,
    ]
      .join(" ")
      .toLowerCase();
    const found = filters.keywords.some(
      (keyword) => keyword.trim() && haystack.includes(keyword.trim().toLowerCase()),
    );
    if (!found) return false;
  }
  return true;
}

function formatDay(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

/** Short display label for an interpreted location, or null when none. */
export function nlLocationLabel(filters: NLDiscoveryFilters): string | null {
  if (!filters.location) return null;
  return filters.locationKind === "state"
    ? shortStateLabel(filters.location)
    : filters.location;
}

/** One-line summary of the active interpretation, composed from validated values. */
export function describeNLFilters(filters: NLDiscoveryFilters): string {
  const parts: string[] = [];
  if (filters.price === "free") parts.push("Free");
  else if (filters.price === "paid") parts.push("Paid");
  if (filters.category !== "any") {
    parts.push(filters.category.charAt(0).toUpperCase() + filters.category.slice(1));
  }
  const locationLabel = nlLocationLabel(filters);
  if (locationLabel) parts.push(`Location: ${locationLabel}, Nigeria`);
  if (filters.dateFrom && filters.dateTo) {
    parts.push(
      filters.dateFrom === filters.dateTo
        ? formatDay(filters.dateFrom)
        : `${formatDay(filters.dateFrom)} – ${formatDay(filters.dateTo)}`,
    );
  }
  if (filters.keywords.length > 0) parts.push(filters.keywords.join(", "));
  return parts.join(" · ");
}

export type ChatContentResult =
  | { ok: true; content: string }
  | { ok: false; reason: "no_choices" | "empty_content" | "refusal" | "length_cutoff" };

/**
 * Pulls the model's text out of a Chat Completions payload, tolerating the
 * documented shape variants (string content, content-part arrays). Never
 * throws; classifies instead so the caller can respond precisely.
 */
export function extractChatContent(payload: unknown): ChatContentResult {
  const choices = (payload as { choices?: unknown } | null | undefined)?.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return { ok: false, reason: "no_choices" };
  }
  const first = (choices[0] ?? {}) as { message?: unknown; finish_reason?: unknown };
  const message = (first.message ?? {}) as { content?: unknown; refusal?: unknown };
  const content = message.content;
  if (typeof content === "string") {
    if (content.trim()) return { ok: true, content };
  } else if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const textPart = (part as { text?: unknown }).text;
          return typeof textPart === "string" ? textPart : "";
        }
        return "";
      })
      .join("");
    if (text.trim()) return { ok: true, content: text };
  }
  if (typeof message.refusal === "string" && message.refusal.trim()) {
    return { ok: false, reason: "refusal" };
  }
  if (first.finish_reason === "length") {
    return { ok: false, reason: "length_cutoff" };
  }
  return { ok: false, reason: "empty_content" };
}

export interface ChatPayloadDiagnosis {
  choiceCount: number;
  finishReason: string | null;
  contentKind: "missing" | "string" | "array" | "other";
  contentLength: number;
}

/**
 * Structural summary of a Chat Completions payload for server logs.
 * Contains shapes and sizes only: never text, keys, headers, or bodies.
 */
export function describeChatPayload(payload: unknown): ChatPayloadDiagnosis {
  const choices = (payload as { choices?: unknown } | null | undefined)?.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return { choiceCount: 0, finishReason: null, contentKind: "missing", contentLength: 0 };
  }
  const first = (choices[0] ?? {}) as { message?: unknown; finish_reason?: unknown };
  const finishReason =
    typeof first.finish_reason === "string" ? first.finish_reason : null;
  const content = (first.message as { content?: unknown } | null | undefined)?.content;
  if (typeof content === "string") {
    return {
      choiceCount: choices.length,
      finishReason,
      contentKind: "string",
      contentLength: content.length,
    };
  }
  if (Array.isArray(content)) {
    return {
      choiceCount: choices.length,
      finishReason,
      contentKind: "array",
      contentLength: content.length,
    };
  }
  if (content === undefined || content === null) {
    return { choiceCount: choices.length, finishReason, contentKind: "missing", contentLength: 0 };
  }
  return { choiceCount: choices.length, finishReason, contentKind: "other", contentLength: 0 };
}
