// Natural-language intelligence assistant: intent allowlist + deterministic
// classifier (pure module, safe to import anywhere: no secrets, no network,
// no database).
//
//Routing is keyword scoring over a fixed allowlist — never the model — so
// there is no prompt-injection path into query choice: instruction-like text
// in a question can only fail to match, never select a capability. Anything
// outside the allowlist, or matching two intents equally, is refused with an
// honest reason instead of guessed at.
import { roleHasPermission, type AdminPermission, type AdminRole } from "./permissions";

export const ASSISTANT_QUESTION_MAX_CHARS = 500;

export const ASSISTANT_INTENTS = [
  "engagement_by_category",
  "events_created",
  "top_rsvp_events",
  "activity_summary",
  "reports_trend",
  "needs_attention",
] as const;

export type AssistantIntent = (typeof ASSISTANT_INTENTS)[number];

export interface AssistantIntentMeta {
  label: string;
  description: string;
  permissions: AdminPermission[];
  suggested: string[];
}

export const ASSISTANT_INTENT_META: Record<AssistantIntent, AssistantIntentMeta> = {
  engagement_by_category: {
    label: "Engagement by category",
    description: "Which event categories draw the most RSVPs and saves.",
    permissions: ["events.read"],
    suggested: ["Which event categories receive the most engagement?"],
  },
  events_created: {
    label: "Events created",
    description: "How many events were created in a recent window.",
    permissions: ["events.read"],
    suggested: ["How many events were created in the last 30 days?"],
  },
  top_rsvp_events: {
    label: "Top RSVP events",
    description: "Events with the highest RSVP activity.",
    permissions: ["events.read", "attendees.read"],
    suggested: ["Which events have the highest RSVP activity?"],
  },
  activity_summary: {
    label: "Activity summary",
    description: "Platform activity overview for a recent window.",
    permissions: [],
    suggested: ["Summarize platform activity this month."],
  },
  reports_trend: {
    label: "Reports trend",
    description: "Whether filed event reports are rising or falling.",
    permissions: ["reports.read"],
    suggested: ["Are event reports increasing?"],
  },
  needs_attention: {
    label: "Needs attention",
    description: "Current anomalies and advisory recommendations.",
    permissions: [],
    suggested: ["Which events deserve administrative attention?"],
  },
};

export function assistantAllowed(intent: AssistantIntent, role: AdminRole): boolean {
  return ASSISTANT_INTENT_META[intent].permissions.every((permission) =>
    roleHasPermission(role, permission),
  );
}

// Weighted keyword sets. Specific multi-word phrases outscore single generic
// words so "events created" beats a bare "events" every time.
const INTENT_SIGNALS: Record<AssistantIntent, Array<{ phrase: string; weight: number }>> = {
  engagement_by_category: [
    { phrase: "which categor", weight: 3 },
    { phrase: "categor", weight: 2 },
    { phrase: "engagement", weight: 3 },
    { phrase: "most rsvp", weight: 2 },
    { phrase: "popular categor", weight: 3 },
    { phrase: "by category", weight: 2 },
    { phrase: "performs best", weight: 2 },
  ],
  events_created: [
    { phrase: "how many events", weight: 3 },
    { phrase: "events created", weight: 3 },
    { phrase: "events were created", weight: 3 },
    { phrase: "new events", weight: 2 },
    { phrase: "event growth", weight: 2 },
    { phrase: "how many", weight: 1 },
  ],
  top_rsvp_events: [
    { phrase: "highest rsvp", weight: 3 },
    { phrase: "most rsvps", weight: 3 },
    { phrase: "top events", weight: 3 },
    { phrase: "top rsvp", weight: 3 },
    { phrase: "rsvp activity", weight: 2 },
    { phrase: "best performing", weight: 2 },
    { phrase: "most popular events", weight: 2 },
  ],
  activity_summary: [
    { phrase: "summar", weight: 3 },
    { phrase: "overview", weight: 2 },
    { phrase: "platform activity", weight: 3 },
    { phrase: "how is the platform", weight: 3 },
    { phrase: "this month", weight: 1 },
    { phrase: "this week", weight: 1 },
    { phrase: "overall", weight: 1 },
  ],
  reports_trend: [
    { phrase: "report", weight: 3 },
    { phrase: "increasing", weight: 1 },
    { phrase: "decreasing", weight: 1 },
    { phrase: "reports filed", weight: 2 },
    { phrase: "abuse", weight: 2 },
    { phrase: "flagged", weight: 2 },
  ],
  needs_attention: [
    { phrase: "attention", weight: 3 },
    { phrase: "anomal", weight: 3 },
    { phrase: "deserve", weight: 2 },
    { phrase: "wrong", weight: 1 },
    { phrase: "suspicious", weight: 2 },
    { phrase: "watchlist", weight: 3 },
    { phrase: "recommendation", weight: 2 },
    { phrase: "should i review", weight: 3 },
    { phrase: "should we review", weight: 3 },
  ],
};

export const ASSISTANT_MIN_SCORE = 2;

export type AssistantClassification =
  | { intent: AssistantIntent; score: number; windowDays: number }
  | { intent: null; reason: "unsupported" | "ambiguous"; windowDays: number };

/** Extracts 7/30/90 from day/week/month mentions; defaults to 30. */
export function parseAssistantWindow(question: string): number {
  const text = question.toLowerCase();
  const dayMatch = text.match(/(\d+)\s*days?/);
  if (dayMatch) {
    const days = Number.parseInt(dayMatch[1], 10);
    if (days <= 7) return 7;
    if (days <= 45) return 30;
    return 90;
  }
  if (/\b(week|7 days|seven days)\b/.test(text)) return 7;
  if (/\b(quarter|90 days|three months)\b/.test(text)) return 90;
  if (/\b(month|30 days|this month)\b/.test(text)) return 30;
  return 30;
}

export function classifyAssistantQuestion(question: string): AssistantClassification {
  const text = question.toLowerCase();
  const windowDays = parseAssistantWindow(question);
  const scored = (ASSISTANT_INTENTS as readonly AssistantIntent[]).map((intent) => ({
    intent,
    score: INTENT_SIGNALS[intent].reduce(
      (sum, signal) => sum + (text.includes(signal.phrase) ? signal.weight : 0),
      0,
    ),
  }));
  scored.sort((a, b) => b.score - a.score);
  const [best, runnerUp] = scored;
  if (best.score < ASSISTANT_MIN_SCORE) {
    return { intent: null, reason: "unsupported", windowDays };
  }
  if (runnerUp.score === best.score) {
    return { intent: null, reason: "ambiguous", windowDays };
  }
  return { intent: best.intent, score: best.score, windowDays };
}

/** Suggested questions for the UI: one per intent, permission-filtered by role. */
export function suggestedQuestions(role: AdminRole | null): string[] {
  return (ASSISTANT_INTENTS as readonly AssistantIntent[])
    .filter((intent) => role === null || assistantAllowed(intent, role))
    .map((intent) => ASSISTANT_INTENT_META[intent].suggested[0]);
}
