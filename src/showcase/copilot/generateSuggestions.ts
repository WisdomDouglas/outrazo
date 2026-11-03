import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { MetaError, metaChatJson } from "@/integrations/meta/client.server";
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

/**
 * Maps shared-transport failures to this feature's exact user-facing
 * messages. Every string below predates the shared helper: migrating the
 * transport must never change what organizers see.
 */
function mapMetaError(caught: unknown): Error {
  if (caught instanceof MetaError) {
    switch (caught.code) {
      case "config":
        return new Error("The AI copilot is not set up yet. Please try again later.");
      case "timeout":
        return new Error("The AI copilot took too long to answer. Please try again.");
      case "network":
        return new Error("Could not reach the AI service. Check your connection and try again.");
      case "unauthorized":
        return new Error("The AI service rejected its credentials. Please tell the site administrator.");
      case "rate_limited":
        return new Error("The AI copilot is busy right now. Please wait a moment and try again.");
      case "server":
        return new Error("The AI service is unavailable right now. Please try again later.");
      case "malformed":
        return new Error("The AI service returned an unreadable response. Please try again.");
      case "bad_request":
        return new Error("The AI copilot could not complete that request. Please try again.");
    }
  }
  return caught instanceof Error
    ? caught
    : new Error("The AI copilot could not complete that request. Please try again.");
}

export const generateEventSuggestions = createServerFn({ method: "POST" })
  .validator(notesSchema)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }): Promise<CopilotSuggestion> => {
    let payload: unknown;
    try {
      ({ payload } = await metaChatJson({
        messages: [
          { role: "developer", content: DEVELOPER_INSTRUCTION },
          { role: "user", content: data.notes },
        ],
        schemaName: "EventSuggestion",
        jsonSchema: SUGGESTION_JSON_SCHEMA,
        maxTokens: META_MAX_OUTPUT_TOKENS,
        timeoutMs: META_REQUEST_TIMEOUT_MS,
        logPrefix: "[copilot]",
      }));
    } catch (caught) {
      throw mapMetaError(caught);
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
