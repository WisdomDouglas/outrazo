// Pure Scout search helpers (safe to import anywhere: no secrets, no
// network, no database).
//
// Parses Responses API payloads into validated result rows, and enforces the
// run-budget arithmetic: every web_search_call item counts against the run's
// approved tool-call budget before the next request is issued.
import { z } from "zod";

export const SCOUT_DEFAULT_MAX_TOOL_CALLS = 24;
export const SCOUT_MAX_TOOL_CALLS_CEILING = 100;
export const SCOUT_REQUEST_TOOL_CALL_CAP = 4;
/** List price per search query; billing unit vs tool calls is UNVERIFIED. */
export const SCOUT_SEARCH_PRICE_PER_1000 = 2.5;

const searchResultSchema = z.object({
  title: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  snippet: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
});

const searchCallSchema = z.object({
  type: z.literal("web_search_call"),
  status: z.string().nullable().optional(),
  results: z.array(searchResultSchema).nullable().optional(),
});

const citationSchema = z.object({
  type: z.literal("url_citation"),
  url: z.string(),
  title: z.string().nullable().optional(),
});

export interface ScoutSearchResult {
  title: string | null;
  url: string;
  domain: string;
  snippet: string;
}

export interface ScoutCitation {
  url: string;
  title: string | null;
}

export interface ParsedScoutSearch {
  toolCalls: number;
  results: ScoutSearchResult[];
  citations: ScoutCitation[];
  inputTokens: number;
  outputTokens: number;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function isHttpUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value.startsWith("http://") || value.startsWith("https://"))
  );
}

/**
 * Extracts validated results + citations from a Responses payload.
 * Rows without a usable http(s) URL are dropped (counted as dropped).
 */
export function parseScoutSearch(payload: unknown): ParsedScoutSearch & { dropped: number } {
  const empty: ParsedScoutSearch & { dropped: number } = {
    toolCalls: 0,
    results: [],
    citations: [],
    inputTokens: 0,
    outputTokens: 0,
    dropped: 0,
  };
  if (typeof payload !== "object" || payload === null) return empty;
  const root = payload as Record<string, unknown>;
  const output = Array.isArray(root["output"]) ? root["output"] : [];
  const results: ScoutSearchResult[] = [];
  const citations: ScoutCitation[] = [];
  let toolCalls = 0;
  let dropped = 0;
  for (const item of output) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (record["type"] === "web_search_call") {
      toolCalls += 1;
      const call = searchCallSchema.safeParse(record);
      if (!call.success) continue;
      for (const row of call.data.results ?? []) {
        if (!isHttpUrl(row.url)) {
          dropped += 1;
          continue;
        }
        results.push({
          title: row.title ?? null,
          url: row.url,
          domain: domainOf(row.url),
          snippet: (row.snippet ?? row.text ?? "").slice(0, 2000),
        });
      }
    }
    if (record["type"] === "message" && Array.isArray(record["content"])) {
      for (const block of record["content"] as Array<Record<string, unknown>>) {
        if (typeof block !== "object" || block === null) continue;
        const annotations = (block as Record<string, unknown>)["annotations"];
        if (!Array.isArray(annotations)) continue;
        for (const annotation of annotations) {
          const citation = citationSchema.safeParse(annotation);
          if (citation.success && isHttpUrl(citation.data.url)) {
            citations.push({ url: citation.data.url, title: citation.data.title ?? null });
          }
        }
      }
    }
  }
  const usage = root["usage"] as { input_tokens?: unknown; output_tokens?: unknown } | null;
  return {
    toolCalls,
    results,
    citations,
    inputTokens: typeof usage?.input_tokens === "number" ? usage.input_tokens : 0,
    outputTokens: typeof usage?.output_tokens === "number" ? usage.output_tokens : 0,
    dropped,
  };
}

export interface BudgetCheck {
  allowed: boolean;
  callsAfter: number;
  /** Labeled estimate: billing unit per tool call is UNVERIFIED. */
  estimatedSearchCostCents: number;
}

/**
 * Decides whether the run may issue another request. The runner calls this
 * BEFORE each request using the count from the previous response: a run that
 * already spent its budget halts instead of issuing request N+1.
 */
export function checkScoutBudget(
  callsMade: number,
  callsJustMade: number,
  maxToolCalls: number,
): BudgetCheck {
  const callsAfter = callsMade + callsJustMade;
  return {
    allowed: callsAfter < maxToolCalls,
    callsAfter,
    estimatedSearchCostCents: Math.round(
      (callsAfter * SCOUT_SEARCH_PRICE_PER_1000) / 10,
    ),
  };
}
