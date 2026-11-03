// Server-only Meta Responses API transport for Outrazo Scout.
//
// Separate from the Chat Completions client (client.server.ts), which is
// untouched: Scout needs the Responses-only web_search tool, raw result
// inclusion, and per-request tool-call caps. Shares only the MetaError type
// and the MODEL_API_KEY convention.
//
// SECURITY: reads MODEL_API_KEY. UI code must go through Scout server
// functions instead (ESLint boundary). Logs and errors never carry the key,
// request bodies, or provider response bodies.
import { MetaError } from "./client.server";

export const META_RESPONSES_URL = "https://api.meta.ai/v1/responses";
export const META_SCOUT_MODEL = "muse-spark-1.3";

export interface ScoutUserLocation {
  country: string;
  region?: string;
  city?: string;
  timezone: string;
}

export interface MetaResponsesSearchOptions {
  input: string;
  instructions: string;
  location: ScoutUserLocation;
  /** Hard API-enforced cap on web_search calls for this request. */
  maxToolCalls: number;
  contextSize: "low" | "medium" | "high";
  timeoutMs: number;
  logPrefix: string;
  fetchImpl?: typeof fetch;
}

export interface MetaResponsesSearchResult {
  status: number;
  payload: unknown;
}

export async function metaResponsesSearch(
  options: MetaResponsesSearchOptions,
): Promise<MetaResponsesSearchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = process.env["MODEL_API_KEY"];
  if (!apiKey) {
    console.error(
      `${options.logPrefix} MODEL_API_KEY is not set; refusing to call Meta API.`,
    );
    throw new MetaError("config", "Meta API key is not configured.");
  }
  if (!Number.isInteger(options.maxToolCalls) || options.maxToolCalls < 1) {
    throw new MetaError("bad_request", "maxToolCalls must be a positive integer.");
  }

  let response: Response;
  try {
    response = await fetchImpl(META_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: META_SCOUT_MODEL,
        instructions: options.instructions,
        input: options.input,
        tools: [
          {
            type: "web_search",
            search_context_size: options.contextSize,
            user_location: { type: "approximate", ...options.location },
          },
        ],
        include: ["web_search_call.results"],
        max_tool_calls: options.maxToolCalls,
      }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (caught) {
    console.error(`${options.logPrefix} Meta Responses request failed:`, caught);
    if (caught instanceof DOMException && caught.name === "TimeoutError") {
      throw new MetaError(
        "timeout",
        `Meta API request timed out after ${options.timeoutMs}ms.`,
      );
    }
    throw new MetaError(
      "network",
      "Meta API request failed before a response arrived.",
    );
  }

  if (!response.ok) {
    console.error(
      `${options.logPrefix} Meta API responded with status ${response.status}.`,
    );
    if (response.status === 401 || response.status === 403) {
      throw new MetaError(
        "unauthorized",
        `Meta API refused the request (HTTP ${response.status}).`,
        response.status,
      );
    }
    if (response.status === 429) {
      throw new MetaError(
        "rate_limited",
        "Meta API rate limit reached (HTTP 429).",
        response.status,
      );
    }
    if (response.status >= 500) {
      throw new MetaError(
        "server",
        `Meta API is unavailable (HTTP ${response.status}).`,
        response.status,
      );
    }
    throw new MetaError(
      "bad_request",
      `Meta API rejected the request (HTTP ${response.status}).`,
      response.status,
    );
  }

  try {
    const payload: unknown = await response.json();
    return { status: response.status, payload };
  } catch {
    throw new MetaError(
      "malformed",
      "Meta API returned an unreadable (non-JSON) response.",
    );
  }
}
