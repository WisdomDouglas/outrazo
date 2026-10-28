import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { CATEGORIES } from "@/showcase/discovery/categories";
import { placesPromptReference, resolvePlace } from "@/showcase/discovery/locations";
import {
  addLagosDays,
  describeChatPayload,
  extractChatContent,
  isRealCalendarDate,
  lagosDayOfInstant,
  lagosWeekday,
  lagosWeekdayName,
  type NLDiscoveryFilters,
} from "./nl-matching";

/**
 * Natural-language discovery interpretation.
 *
 * The browser sends a visitor's plain-language request; this function asks
 * the Meta Model API to convert it into structured search filters (city,
 * category, date bounds, price flag, keywords). Matching always happens
 * client-side against loaded event records, so the model can never invent
 * events: its output vocabulary is filter values only.
 *
 * Unlike the organizer Copilot, this function is public (no login required)
 * because Explore is a public page. Abuse is limited with a short input cap,
 * a tiny output budget, and a short timeout.
 *
 * Only the `.handler()` body below runs on the server. MODEL_API_KEY is read
 * inside the handler and sent only in the server-to-Meta Authorization header.
 */

const META_CHAT_COMPLETIONS_URL = "https://api.meta.ai/v1/chat/completions";
const META_MODEL = "muse-spark-1.3";
const META_REQUEST_TIMEOUT_MS = 20_000;
/**
 * Caps cost and latency. Keep generous: reasoning tokens share this budget,
 * and a starved budget makes the model return empty content with
 * finish_reason "length".
 */
const META_MAX_OUTPUT_TOKENS = 2048;

/** A discovery request is a sentence or two. */
export const MAX_DISCOVERY_QUERY_LENGTH = 500;

/** Single sources of truth: the same categories and cities the UI offers. */
const SUPPORTED_CATEGORY_IDS = CATEGORIES.map((category) => category.id).filter(
  (id) => id !== "all",
);
if (SUPPORTED_CATEGORY_IDS.length === 0) {
  throw new Error("Discovery misconfigured: the app defines no event categories.");
}

const DATE_PRESETS = [
  "any",
  "today",
  "this_weekend",
  "next_weekend",
  "this_week",
  "next_7_days",
] as const;

const querySchema = z.object({
  query: z.string().trim().min(1).max(MAX_DISCOVERY_QUERY_LENGTH),
});

const categoryOptions: string[] = [...SUPPORTED_CATEGORY_IDS, "any"];
const categorySchema = z.enum(categoryOptions as [string, ...string[]]);

/**
 * Raw model output. Empty strings mean "not mentioned"; the handler converts
 * them to nulls and computes concrete date bounds, so the client receives
 * only validated, fully resolved filters.
 */
const interpretationSchema = z.object({
  location: z.string().max(80),
  locationKind: z.enum(["city", "state", "none"]),
  category: categorySchema,
  datePreset: z.enum(DATE_PRESETS),
  dateFrom: z.string().max(10),
  dateTo: z.string().max(10),
  price: z.enum(["any", "free", "paid"]),
  keywords: z.array(z.string().max(30)).max(6),
});

const INTERPRETATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    location: { type: "string" },
    locationKind: { type: "string", enum: ["city", "state", "none"] },
    category: { type: "string", enum: [...SUPPORTED_CATEGORY_IDS, "any"] },
    datePreset: { type: "string", enum: [...DATE_PRESETS] },
    dateFrom: { type: "string" },
    dateTo: { type: "string" },
    price: { type: "string", enum: ["any", "free", "paid"] },
    keywords: { type: "array", items: { type: "string" } },
  },
  required: ["location", "locationKind", "category", "datePreset", "dateFrom", "dateTo", "price", "keywords"],
};

function buildDeveloperInstruction(now: Date): string {
  return [
    "You are Outrazo's discovery assistant. Convert the visitor's request into search filters as JSON matching the schema.",
    `Today is ${lagosWeekdayName(now)}, ${lagosDayOfInstant(now)} in Lagos, Nigeria (Africa/Lagos).`,
    `location: the requested place, or "" when none is mentioned. Use canonical names from this reference:\n${placesPromptReference()}`,
    `locationKind: "city" when a city or town is named; "state" when a state is named, including bare names shared with their capital (Lagos, Enugu, Kano and the like read as the state) and "FCT" for the Federal Capital Territory; "none" together with "" when no place is mentioned, for "near me" (the app already knows the user's location), or when the place is genuinely unclear. If a specific non-Nigerian place is named, return it as kind "city" exactly as written. Never invent or substitute places.`,
    `category: exactly one of: ${[...SUPPORTED_CATEGORY_IDS, "any"].join(", ")}. Pick the closest match ("tech", "developers", "builders", and meetups suggest tech; concerts and live music suggest music; parties and nightlife suggest parties). When unsure, use "any".`,
    `datePreset: "today" for today or tonight; "this_weekend" for this weekend, Saturday, or Sunday; "next_weekend" for next weekend; "this_week" for this week; "next_7_days" for the next 7 days; otherwise "any". For explicit calendar dates (for example "October 31" or "Dec 25"), put them in dateFrom and dateTo as YYYY-MM-DD instead and keep datePreset "any". Never compute relative dates yourself.`,
    `dateFrom and dateTo: "" unless the request names explicit calendar dates or a date range.`,
    `price: "free" when free entry or no cost is requested, "paid" when tickets or paid entry is requested, otherwise "any".`,
    `keywords: up to 6 content words from the request (vibes, activities, music styles, food, audiences such as "developers"). Skip filler words such as find, events, want, and please, plus words already captured as city or category. Lowercase.`,
    "Reply with JSON only, matching the provided schema.",
  ].join(" ");
}

function weekendBounds(now: Date, weekOffset: number): { from: string; to: string } {
  // Monday-start weeks, matching the app's existing weekend definition:
  // Saturday/Sunday of the current week (on a Sunday, that is yesterday+today).
  const sinceMonday = (lagosWeekday(now) + 6) % 7;
  const saturdayOffset = 5 - sinceMonday + weekOffset;
  return {
    from: addLagosDays(now, saturdayOffset),
    to: addLagosDays(now, saturdayOffset + 1),
  };
}

// Exported pure helper so date resolution is directly testable.
export function resolveDateBounds(
  preset: (typeof DATE_PRESETS)[number],
  dateFrom: string,
  dateTo: string,
  now: Date,
): { from: string | null; to: string | null } {
  const explicitFrom = dateFrom.trim();
  const explicitTo = dateTo.trim();
  if (explicitFrom && isRealCalendarDate(explicitFrom)) {
    const end = explicitTo && isRealCalendarDate(explicitTo) ? explicitTo : explicitFrom;
    if (explicitFrom <= end) return { from: explicitFrom, to: end };
  }
  switch (preset) {
    case "today": {
      const day = lagosDayOfInstant(now);
      return { from: day, to: day };
    }
    case "this_weekend":
      return weekendBounds(now, 0);
    case "next_weekend":
      return weekendBounds(now, 7);
    case "this_week": {
      const mondayOffset = (lagosWeekday(now) + 6) % 7;
      return {
        from: addLagosDays(now, -mondayOffset),
        to: addLagosDays(now, -mondayOffset + 6),
      };
    }
    case "next_7_days":
      return { from: lagosDayOfInstant(now), to: addLagosDays(now, 6) };
    default:
      return { from: null, to: null };
  }
}

export const interpretDiscoveryQuery = createServerFn({ method: "POST" })
  .validator(querySchema)
  .handler(async ({ data }): Promise<NLDiscoveryFilters> => {
    const apiKey = process.env["MODEL_API_KEY"];
    if (!apiKey) {
      console.error("[discovery] MODEL_API_KEY is not set; refusing to call Meta API.");
      throw new Error("AI search is not set up yet. You can still browse and filter events below.");
    }

    let response: Response;
    try {
      response = await fetch(META_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: META_MODEL,
          messages: [
            { role: "developer", content: buildDeveloperInstruction(new Date()) },
            { role: "user", content: data.query },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "DiscoveryFilters", schema: INTERPRETATION_JSON_SCHEMA },
          },
          max_completion_tokens: META_MAX_OUTPUT_TOKENS,
        }),
        signal: AbortSignal.timeout(META_REQUEST_TIMEOUT_MS),
      });
    } catch (caught) {
      console.error("[discovery] Meta API request failed:", caught);
      if (caught instanceof DOMException && caught.name === "TimeoutError") {
        throw new Error("AI search took too long to answer. Please try again.");
      }
      throw new Error("Could not reach the AI service. Check your connection and try again.");
    }

    if (!response.ok) {
      // Log only the status server-side. Provider bodies can echo request
      // details, so they are never forwarded to the browser.
      console.error(`[discovery] Meta API responded with status ${response.status}.`);
      if (response.status === 401 || response.status === 403) {
        throw new Error("AI search rejected its credentials. Please tell the site administrator.");
      }
      if (response.status === 429) {
        throw new Error("AI search is busy right now. Please wait a moment and try again.");
      }
      if (response.status >= 500) {
        throw new Error("AI search is unavailable right now. You can still browse and filter events below.");
      }
      throw new Error("AI search could not complete that request. Please try again.");
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("AI search returned an unreadable response. Please try again.");
    }
    const extracted = extractChatContent(payload);
    if (!extracted.ok) {
      // Structural diagnostics only: HTTP status, failure reason, payload
      // shape, and query length. Never query text, keys, headers, or bodies.
      console.error(
        "[discovery] unusable Meta payload",
        JSON.stringify({
          status: response.status,
          reason: extracted.reason,
          queryLength: data.query.length,
          ...describeChatPayload(payload),
        }),
      );
      if (extracted.reason === "length_cutoff") {
        throw new Error("AI search ran out of room to answer. Please try a shorter request.");
      }
      if (extracted.reason === "refusal") {
        throw new Error("AI search declined that request. Please rephrase and try again.");
      }
      if (extracted.reason === "no_choices") {
        throw new Error("AI search returned no answer. Please try again.");
      }
      throw new Error("AI search returned an empty response. Please try again.");
    }
    const content = extracted.content;

    let interpretation: unknown;
    try {
      interpretation = JSON.parse(content);
    } catch {
      throw new Error("AI search returned an unreadable response. Please try again.");
    }

    const parsed = interpretationSchema.safeParse(interpretation);
    if (!parsed.success) {
      console.error("[discovery] Meta API response failed validation:", parsed.error.flatten());
      throw new Error("AI search returned an incomplete interpretation. Please try again.");
    }

    const now = new Date();
    const bounds = resolveDateBounds(
      parsed.data.datePreset,
      parsed.data.dateFrom,
      parsed.data.dateTo,
      now,
    );
    const keywords = [...new Set(
      parsed.data.keywords.map((keyword) => keyword.trim()).filter(Boolean),
    )].slice(0, 6);
    const placeText = parsed.data.location.trim();
    const placeKind = parsed.data.locationKind;
    let location: string | null = null;
    let locationKind: "city" | "state" = "city";
    if (placeText && placeKind !== "none") {
      const resolved = resolvePlace(placeText);
      if (resolved) {
        location = resolved.name;
        locationKind = resolved.kind;
      } else {
        // Unknown place: echo it through so matching honestly finds nothing
        // rather than substituting an unrelated location.
        location = placeText;
        locationKind = placeKind === "state" ? "state" : "city";
      }
    }
    return {
      location,
      locationKind,
      category: parsed.data.category,
      dateFrom: bounds.from,
      dateTo: bounds.to,
      price: parsed.data.price,
      keywords,
    };
  });
