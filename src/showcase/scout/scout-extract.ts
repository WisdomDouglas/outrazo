// Scout extraction contracts (pure module: zod schemas + prompt builder).
//
// The model extracts one structured candidate per source and grades every
// field as confirmed / missing / ambiguous. Missing stays missing: the
// schema allows nulls everywhere so the model is never tempted to invent.
import { z } from "zod";

import { normalizeScoutUrl } from "./scout-validate";

export const fieldProvenance = z.enum(["confirmed", "missing", "ambiguous"]);

const provenanceSchema = z.object({
  title: fieldProvenance,
  startsAt: fieldProvenance,
  venue: fieldProvenance,
  city: fieldProvenance,
  organizer: fieldProvenance,
});

const extractionBaseFields = {
  notEventReason: z.string().max(300).nullish(),
  title: z.string().max(200).nullish(),
  summary: z.string().max(500).nullish(),
  startsAt: z.string().nullish(),
  endsAt: z.string().nullish(),
  venueName: z.string().max(200).nullish(),
  address: z.string().max(300).nullish(),
  city: z.string().max(100).nullish(),
  state: z.string().max(100).nullish(),
  category: z.string().max(60).nullish(),
  eventType: z.enum(["free", "paid", "unknown"]),
  priceHint: z.string().max(200).nullish(),
  externalTicketUrl: z.string().max(500).nullish(),
  organizerName: z.string().max(200).nullish(),
};

// Provenance is required only when an event was actually found: a model
// correctly answering isUpcomingEvent=false for a listing, article, or venue
// page has no field grades to give, and rejecting that answer as "unusable"
// burns real candidates. The true branch keeps full provenance mandatory.
export const scoutExtractionSchema = z.discriminatedUnion("isUpcomingEvent", [
  z.object({ ...extractionBaseFields, isUpcomingEvent: z.literal(true), provenance: provenanceSchema }),
  z.object({ ...extractionBaseFields, isUpcomingEvent: z.literal(false), provenance: provenanceSchema.nullish() }),
]);

export type ScoutExtraction = z.infer<typeof scoutExtractionSchema>;

export const SCOUT_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    isUpcomingEvent: { type: "boolean" },
    notEventReason: { type: ["string", "null"] },
    title: { type: ["string", "null"] },
    summary: { type: ["string", "null"] },
    startsAt: { type: ["string", "null"] },
    endsAt: { type: ["string", "null"] },
    venueName: { type: ["string", "null"] },
    address: { type: ["string", "null"] },
    city: { type: ["string", "null"] },
    state: { type: ["string", "null"] },
    category: { type: ["string", "null"] },
    eventType: { type: "string", enum: ["free", "paid", "unknown"] },
    priceHint: { type: ["string", "null"] },
    externalTicketUrl: { type: ["string", "null"] },
    organizerName: { type: ["string", "null"] },
    provenance: {
      type: ["object", "null"],
      properties: {
        title: { type: "string" },
        startsAt: { type: "string" },
        venue: { type: "string" },
        city: { type: "string" },
        organizer: { type: "string" },
      },
      required: ["title", "startsAt", "venue", "city", "organizer"],
    },
  },
  required: ["isUpcomingEvent", "eventType"],
};

export function buildExtractionPrompt(source: {
  url: string;
  title: string | null;
  text: string;
  todayIso: string;
}): { instructions: string; input: string } {
  return {
    instructions:
      `Today is ${source.todayIso.slice(0, 10)}. Extract at most ONE upcoming event ` +
      `from the source below. If it is not an event page (venue, article, course ` +
      `catalog, category listing), set isUpcomingEvent=false and explain why; ` +
      `provenance may be omitted in that case. ` +
      `Never invent dates, venues, prices, or organizers: use null plus ` +
      `"missing" provenance for anything not stated. When it IS an upcoming ` +
      `event, provenance is required: grade each listed field as ` +
      `confirmed (stated), ambiguous (unclear), or missing (absent).`,
    input: `SOURCE URL: ${source.url}\nTITLE: ${source.title ?? "(none)"}\n\n${source.text}`,
  };
}

export interface ScoutCandidatePick {
  url: string;
  title: string | null;
  domain: string;
  snippet: string;
}

/**
 * Picks up to `limit` unprocessed candidate URLs across done steps, in plan
 * order, deduped by normalized URL — both against already-processed rows and
 * within the batch itself. Rows without a usable URL are skipped. Stops
 * entirely once `maxSources` rows are already processed (the run's cap).
 */
export function pickUnprocessedCandidates(
  stepsResults: Array<Array<{ url: string; title: string | null; domain: string; snippet: string }>>,
  processedUrls: ReadonlySet<string>,
  limit: number,
  maxSources: number,
): ScoutCandidatePick[] {
  if (processedUrls.size >= maxSources) return [];
  const picks: ScoutCandidatePick[] = [];
  const seen = new Set<string>();
  for (const results of stepsResults) {
    for (const row of results ?? []) {
      if (picks.length >= limit) return picks;
      const normalized = normalizeScoutUrl(row.url);
      if (!normalized || seen.has(normalized) || processedUrls.has(normalized)) continue;
      seen.add(normalized);
      picks.push({ url: normalized, title: row.title, domain: row.domain, snippet: row.snippet });
    }
  }
  return picks;
}
