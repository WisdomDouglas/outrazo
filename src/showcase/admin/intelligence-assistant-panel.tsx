// Admin Intelligence assistant section (Phase 3). Conversational Q&A over
// verified aggregates: the server classifies each question into an allowlisted
// intent, runs one approved aggregation, and returns AI narration beside the
// supporting figures so readers can check every claim against the numbers.
import { useCallback, useState } from "react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { Skeleton } from "@/design-system/components/Skeleton";
import {
  friendlyAdminError,
  useAccessToken,
  useMyAdminRole,
} from "@/showcase/admin/admin-client";
import {
  ASSISTANT_QUESTION_MAX_CHARS,
  suggestedQuestions,
} from "@/showcase/admin/intelligence-assistant";
import {
  askAssistant,
  type AskAssistantResult,
} from "@/showcase/admin/intelligence-functions";

interface Exchange {
  id: number;
  question: string;
  result: AskAssistantResult;
}

function FiguresTable({ figures }: { figures: Array<{ label: string; value: string }> }) {
  if (figures.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded border border-line">
      <table className="type-body w-full border-collapse text-left">
        <caption className="sr-only">Supporting figures from the database</caption>
        <tbody>
          {figures.map((figure) => (
            <tr key={figure.label} className="border-b border-line last:border-0">
              <th scope="row" className="px-sm py-xs font-normal text-muted-text">
                {figure.label}
              </th>
              <td className="px-sm py-xs text-right font-semibold whitespace-nowrap">
                {figure.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnswerCard({ exchange }: { exchange: Exchange }) {
  const { result } = exchange;
  if (result.status === "refused") {
    return (
      <div className="grid gap-sm rounded-lg border border-dashed border-line bg-card p-md">
        <p className="type-body font-semibold">{exchange.question}</p>
        <p className="type-body text-muted-text">{result.message}</p>
      </div>
    );
  }
  return (
    <div className="grid gap-sm rounded-lg border border-line bg-card p-md shadow-card sm:p-lg">
      <p className="type-body font-semibold">{exchange.question}</p>
      <div className="flex flex-wrap items-center gap-sm">
        <Badge variant="accent">{result.intentLabel}</Badge>
        <span className="type-caption text-muted-text">Last {result.windowDays} days</span>
      </div>
      <p className="type-body">{result.answer}</p>
      {result.caveats.length > 0 ? (
        <ul className="type-body list-disc space-y-2xs pl-md text-muted-text">
          {result.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      ) : null}
      <FiguresTable figures={result.figures} />
      <p className="type-caption text-muted-text">
        Figures from the database as of {new Date(result.snapshotAt).toLocaleString()}.
      </p>
    </div>
  );
}

export function AssistantSection() {
  const token = useAccessToken();
  const { role } = useMyAdminRole();
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextId, setNextId] = useState(1);

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || loading) return;
      if (!token) {
        setError("Sign in to use the admin console.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await askAssistant({
          data: { question: trimmed.slice(0, ASSISTANT_QUESTION_MAX_CHARS) },
          headers: { Authorization: `Bearer ${token}` },
        });
        setExchanges((prior) => [...prior, { id: nextId, question: trimmed, result }]);
        setNextId((id) => id + 1);
        setDraft("");
      } catch (caught) {
        setError(friendlyAdminError(caught));
      } finally {
        setLoading(false);
      }
    },
    [token, loading, nextId],
  );

  const suggestions = suggestedQuestions(role);

  return (
    <section aria-label="Intelligence assistant" className="grid gap-md">
      <div>
        <h3 className="type-h3">Intelligence assistant</h3>
        <p className="type-body mt-xs text-muted-text">
          Ask about platform activity in plain language. Every answer is written from
          live database aggregates — the figures are shown alongside so you can verify
          each claim.
        </p>
      </div>

      {exchanges.length === 0 && !loading ? (
        <div className="grid gap-sm">
          <p className="type-body text-muted-text">Try one of these:</p>
          <div className="flex flex-wrap gap-sm">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void ask(suggestion)}
                className="focus-ring type-body rounded-full border border-line bg-card px-md py-xs text-left text-accent transition-colors hover:border-accent"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {exchanges.length > 0 ? (
        <ol className="grid gap-md" aria-label="Conversation">
          {exchanges.map((exchange) => (
            <li key={exchange.id}>
              <AnswerCard exchange={exchange} />
            </li>
          ))}
        </ol>
      ) : null}

      {loading ? (
        <div className="grid gap-xs rounded-lg border border-line bg-card p-md" aria-label="Answering">
          <Skeleton className="h-4 w-1/3 rounded" />
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-5/6 rounded" />
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-line bg-card p-md">
          <p className="type-body text-transactional">{error}</p>
        </div>
      ) : null}

      <form
        className="grid gap-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(draft);
        }}
      >
        <label htmlFor="assistant-question" className="type-body font-semibold">
          Ask a question
        </label>
        <div className="grid gap-sm sm:grid-cols-[1fr_auto] sm:items-end">
          <textarea
            id="assistant-question"
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, ASSISTANT_QUESTION_MAX_CHARS))}
            rows={2}
            maxLength={ASSISTANT_QUESTION_MAX_CHARS}
            placeholder="e.g. Which event categories receive the most engagement?"
            className="focus-ring type-body min-h-16 w-full resize-y rounded-lg border border-line-strong bg-canvas px-md py-sm"
          />
          <Button type="submit" variant="outline" disabled={loading || draft.trim().length < 3}>
            {loading ? "Answering…" : "Ask"}
          </Button>
        </div>
        <p className="type-caption text-muted-text">
          {draft.length}/{ASSISTANT_QUESTION_MAX_CHARS} · Questions stay in this session;
          only the topic is audit-logged, never your words.
        </p>
      </form>
    </section>
  );
}
