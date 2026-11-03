// Pure narration contracts for Admin Intelligence AI text (safe to import
// anywhere: no secrets, no network, no database).
//
// Grounding rule: the server computes every figure and passes it as JSON;
// the model only narrates. These builders assemble the grounded prompt, the
// schemas validate the model's reply, and significantChange decides which
// movements are trustworthy enough to mention at all.
import { z } from "zod";

import type { IntelligenceSnapshot } from "./intelligence-aggregates.server";

export const eventSummarySchema = z.object({
  summary: z.string().trim().min(1).max(600),
  takeaways: z.array(z.string().trim().min(1).max(160)).max(4),
});

export type EventSummaryText = z.infer<typeof eventSummarySchema>;

export const EVENT_SUMMARY_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    takeaways: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "takeaways"],
};

export const platformBriefSchema = z.object({
  headline: z.string().trim().min(1).max(160),
  highlights: z.array(z.string().trim().min(1).max(200)).max(5),
});

export type PlatformBriefText = z.infer<typeof platformBriefSchema>;

export const PLATFORM_BRIEF_JSON_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    highlights: { type: "array", items: { type: "string" } },
  },
  required: ["headline", "highlights"],
};

export const categoryObservationsSchema = z.object({
  observations: z.array(z.string().trim().min(1).max(200)).max(5),
});

export type CategoryObservationsText = z.infer<typeof categoryObservationsSchema>;

export const CATEGORY_OBSERVATIONS_JSON_SCHEMA = {
  type: "object",
  properties: {
    observations: { type: "array", items: { type: "string" } },
  },
  required: ["observations"],
};

export const anomalyExplanationSchema = z.object({
  explanation: z.string().trim().min(1).max(600),
  limitations: z.array(z.string().trim().min(1).max(160)).max(3),
  nextSteps: z.array(z.string().trim().min(1).max(160)).max(4),
});

export type AnomalyExplanationText = z.infer<typeof anomalyExplanationSchema>;

export const assistantAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(800),
  caveats: z.array(z.string().trim().min(1).max(160)).max(3),
});

export type AssistantAnswerText = z.infer<typeof assistantAnswerSchema>;

export const ASSISTANT_ANSWER_JSON_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    caveats: { type: "array", items: { type: "string" } },
  },
  required: ["answer", "caveats"],
};

export const ANOMALY_EXPLANATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    explanation: { type: "string" },
    limitations: { type: "array", items: { type: "string" } },
    nextSteps: { type: "array", items: { type: "string" } },
  },
  required: ["explanation", "limitations", "nextSteps"],
};

/** Developer instruction prefix shared by every intelligence narration call. */
export function buildGroundedInstruction(task: string): string {
  return [
    `You are Outrazo's admin intelligence narrator. ${task}`,
    "Use ONLY the numbers in the verified figures JSON below. Never invent, estimate, or round figures beyond what is shown, and never state a total that is not in the figures.",
    "If the figures are too thin to support a claim, say the data is insufficient instead of guessing. Prefer fewer, certain sentences over speculation.",
    "Never mention individual users, emails, or reporters: aggregates only.",
    "Reply with JSON only, matching the provided schema.",
  ].join(" ");
}

/** Verified figures block appended to the user message. */
export function buildFiguresBlock(figures: unknown): string {
  return `Verified figures:\n${JSON.stringify(figures)}`;
}

/**
 * A movement worth verbalizing, or null when it must stay unmentioned: thin
 * bases (a 1-to-2 jump is not a "+100% surge"), flat lines, and any invalid
 * input. Callers surface only non-null movements to the model.
 */
export function significantChange(
  current: number,
  previous: number,
): { delta: number; pct: number } | null {
  if (!Number.isInteger(current) || !Number.isInteger(previous)) return null;
  if (current < 0 || previous < 0) return null;
  if (previous < 5) return null;
  const delta = current - previous;
  if (delta === 0) return null;
  return { delta, pct: Math.round((delta / previous) * 100) };
}

export type NarrationContentResult =
  | { ok: true; content: string }
  | {
      ok: false;
      reason: "no_choices" | "refusal" | "length_cutoff" | "empty_content";
    };

/**
 * Extracts model text from a Chat Completions payload, distinguishing every
 * known degenerate outcome. String and content-block array shapes both
 * resolve; anything else reports its precise reason so callers (and logs)
 * can tell an empty answer from a refusal or a truncation.
 */
export function extractNarrationContent(payload: unknown): NarrationContentResult {
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

export interface NarrationPayloadDiagnosis {
  choiceCount: number;
  finishReason: string | null;
  contentKind: "missing" | "string" | "array" | "other";
  contentLength: number;
}

/**
 * Structural summary of a Chat Completions payload for server logs.
 * Shapes and sizes only: never model text, keys, headers, or bodies.
 */
export function describeNarrationPayload(payload: unknown): NarrationPayloadDiagnosis {
  const choices = (payload as { choices?: unknown } | null | undefined)?.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return { choiceCount: 0, finishReason: null, contentKind: "missing", contentLength: 0 };
  }
  const first = (choices[0] ?? {}) as { message?: unknown; finish_reason?: unknown };
  const message = (first.message ?? {}) as { content?: unknown };
  const content = message.content;
  const finishReason =
    typeof first.finish_reason === "string" ? first.finish_reason : null;
  if (typeof content === "string") {
    return { choiceCount: choices.length, finishReason, contentKind: "string", contentLength: content.length };
  }
  if (Array.isArray(content)) {
    return {
      choiceCount: choices.length,
      finishReason,
      contentKind: "array",
      contentLength: content.length,
    };
  }
  return { choiceCount: choices.length, finishReason, contentKind: content === undefined ? "missing" : "other", contentLength: 0 };
}

export type NarrationFailureReason =
  | "no_choices"
  | "refusal"
  | "length_cutoff"
  | "empty_content"
  | "invalid_json";

/**
 * Whether a failed narration attempt deserves one fresh sample. Degenerate
 * model output (cutoffs, empties, missing choices, unparsable JSON) is
 * often transient, so the first failure retries once; deliberate refusals
 * and exhausted retries surface their honest error instead.
 */
export function shouldRetryNarration(reason: NarrationFailureReason, attempt: number): boolean {
  if (attempt >= 1) return false;
  return (
    reason === "length_cutoff" ||
    reason === "empty_content" ||
    reason === "no_choices" ||
    reason === "invalid_json"
  );
}

export interface BriefWindowChange {
  metric: string;
  current: number;
  previous: number;
  delta: number;
  pct: number;
}

/**
 * Compact brief figures: pre-computed totals, window activity, and trusted
 * window changes — no raw daily series. The model narrates verified facts
 * instead of eyeballing hundreds of repetitive points, which keeps the
 * prompt small, cheap, and robust at any window size. Null sections stay
 * null (unpermitted data never reaches the model).
 */
export function buildBriefFigures(
  snapshot: IntelligenceSnapshot,
  changes: BriefWindowChange[],
): Record<string, unknown> {
  const activity = (points: Array<{ count: number }> | undefined): number =>
    (points ?? []).reduce((sum, point) => sum + point.count, 0);
  return {
    windowDays: snapshot.windowDays,
    generatedAt: snapshot.generatedAt,
    events: snapshot.events
      ? {
          total: snapshot.events.total,
          published: snapshot.events.published,
          upcoming: snapshot.events.upcoming,
          newInWindow: activity(snapshot.events.series.points),
        }
      : null,
    rsvps: snapshot.rsvps
      ? { total: snapshot.rsvps.total, newInWindow: activity(snapshot.rsvps.series.points) }
      : null,
    users: snapshot.users
      ? { total: snapshot.users.total, newInWindow: activity(snapshot.users.series.points) }
      : null,
    organizers: snapshot.organizers
      ? {
          total: snapshot.organizers.total,
          newInWindow: activity(snapshot.organizers.series.points),
        }
      : null,
    changes,
  };
}
