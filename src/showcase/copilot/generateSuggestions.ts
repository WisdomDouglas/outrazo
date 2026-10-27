import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CATEGORIES } from "@/showcase/discovery/categories";

/**
 * AI Event Copilot server function.
 *
 * The browser sends rough organizer notes; this function calls the Meta Model
 * API and returns structured suggestions (title, summary, description,
 * category, tags) for the organizer to review before applying.
 *
 * Only the `.handler()` body below runs on the server. Everything the client
 * bundle keeps (schemas, prompts, constants) contains no secrets:
 * MODEL_API_KEY is read inside the handler and sent only in the
 * server-to-Meta Authorization header.
 */

const META_CHAT_COMPLETIONS_URL = "https://api.meta.ai/v1/chat/completions";
const META_MODEL = "muse-spark-1.3";
const META_REQUEST_TIMEOUT_MS = 30_000;
/** Caps cost and latency; large enough for the longest allowed description. */
const META_MAX_OUTPUT_TOKENS = 4096;

/** Rough notes are capped so one request stays small and cheap. */
export const MAX_NOTES_LENGTH = 4000;

/** Single source of truth: the same categories the Create Event form offers. */
const SUPPORTED_CATEGORY_IDS = CATEGORIES.map((category) => category.id).filter(
  (id) => id !== "all",
);
if (SUPPORTED_CATEGORY_IDS.length === 0) {
  throw new Error("Copilot misconfigured: the app defines no event categories.");
}

const notesSchema = z.object({
  notes: z.string().trim().min(1).max(MAX_NOTES_LENGTH),
});

const suggestionSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(5000),
  category: z.enum(SUPPORTED_CATEGORY_IDS as [string, ...string[]]),
  tags: z.array(z.string().trim().min(1).max(40)).max(6),
});

export type CopilotSuggestion = z.infer<typeof suggestionSchema>;

const DEVELOPER_INSTRUCTION = [
  "You are Outrazo's event copilot. Turn the organizer's rough notes into polished event copy.",
  "Use only facts stated in the notes. Never invent dates, times, venues, addresses, prices, capacity, lineups, or contact details.",
  "If facts are missing, write copy that does not depend on them. Do not ask questions and do not include placeholders such as TBA.",
  "Title: catchy, 120 characters or fewer.",
  "Summary: one or two sentences, 220 characters or fewer.",
  "Description: two to four short paragraphs of plain text (no markdown headings), 4000 characters or fewer.",
  `Category: exactly one of: ${SUPPORTED_CATEGORY_IDS.join(", ")}. Pick the closest match.`,
  "Tags: two to five short lowercase tags.",
  "Reply with JSON only, matching the provided schema.",
].join(" ");

const SUGGESTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    description: { type: "string" },
    category: { type: "string", enum: SUPPORTED_CATEGORY_IDS },
    tags: { type: "array", items: { type: "string" } },
  },
  required: ["title", "summary", "description", "category", "tags"],
};

export const generateEventSuggestions = createServerFn({ method: "POST" })
  .validator(notesSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }): Promise<CopilotSuggestion> => {
    const apiKey = process.env["MODEL_API_KEY"];
    if (!apiKey) {
      console.error("[copilot] MODEL_API_KEY is not set; refusing to call Meta API.");
      throw new Error("The AI copilot is not set up yet. Please try again later.");
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
            { role: "developer", content: DEVELOPER_INSTRUCTION },
            { role: "user", content: data.notes },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "EventSuggestion", schema: SUGGESTION_JSON_SCHEMA },
          },
          max_completion_tokens: META_MAX_OUTPUT_TOKENS,
        }),
        signal: AbortSignal.timeout(META_REQUEST_TIMEOUT_MS),
      });
    } catch (caught) {
      console.error("[copilot] Meta API request failed:", caught);
      if (caught instanceof DOMException && caught.name === "TimeoutError") {
        throw new Error("The AI copilot took too long to answer. Please try again.");
      }
      throw new Error("Could not reach the AI service. Check your connection and try again.");
    }

    if (!response.ok) {
      // Log only the status server-side. Provider bodies can echo request
      // details, so they are never forwarded to the browser.
      console.error(`[copilot] Meta API responded with status ${response.status}.`);
      if (response.status === 401 || response.status === 403) {
        throw new Error("The AI service rejected its credentials. Please tell the site administrator.");
      }
      if (response.status === 429) {
        throw new Error("The AI copilot is busy right now. Please wait a moment and try again.");
      }
      if (response.status >= 500) {
        throw new Error("The AI service is unavailable right now. Please try again later.");
      }
      throw new Error("The AI copilot could not complete that request. Please try again.");
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("The AI service returned an unreadable response. Please try again.");
    }
    const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })
      .choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("The AI service returned an empty response. Please try again.");
    }

    let suggestion: unknown;
    try {
      suggestion = JSON.parse(content);
    } catch {
      throw new Error("The AI suggestions were unreadable. Please try again.");
    }

    const parsed = suggestionSchema.safeParse(suggestion);
    if (!parsed.success) {
      console.error("[copilot] Meta API response failed validation:", parsed.error.flatten());
      throw new Error("The AI suggestions were incomplete. Please try again.");
    }
    return parsed.data;
  });
