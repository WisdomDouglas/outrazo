import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { CATEGORIES } from "@/showcase/discovery/categories";
import {
  MAX_NOTES_LENGTH,
  generateEventSuggestions,
  type CopilotSuggestion,
} from "./generateSuggestions";

export interface CopilotFields {
  title: string;
  summary: string;
  description: string;
  category: string;
}

interface CopilotPanelProps {
  /** Supabase session token, sent so the server can verify the organizer. */
  accessToken: string | null;
  /** Called only when the organizer clicks Apply. Writes the four form fields. */
  onApply: (fields: CopilotFields) => void;
}

const friendlyError = (caught: unknown): string => {
  const message = caught instanceof Error ? caught.message : "";
  if (/failed to fetch|network|load failed/i.test(message)) {
    return "Could not reach the server. Check your connection and try again.";
  }
  return message || "Something went wrong. Please try again.";
};

export function CopilotPanel({ accessToken, onApply }: CopilotPanelProps) {
  const [notes, setNotes] = useState("");
  const [suggestion, setSuggestion] = useState<CopilotSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [applied, setApplied] = useState(false);

  const generate = async () => {
    if (!accessToken) {
      setError("Sign in to use the AI copilot.");
      return;
    }
    const trimmed = notes.trim();
    if (!trimmed) {
      setError("Describe your event in a few sentences first.");
      return;
    }
    if (trimmed.length > MAX_NOTES_LENGTH) {
      setError(`Keep your notes under ${MAX_NOTES_LENGTH} characters.`);
      return;
    }
    setGenerating(true);
    setError(null);
    setApplied(false);
    try {
      const result = await generateEventSuggestions({
        data: { notes: trimmed },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setSuggestion(result);
    } catch (caught) {
      setSuggestion(null);
      setError(friendlyError(caught));
    } finally {
      setGenerating(false);
    }
  };

  const apply = () => {
    if (!suggestion) return;
    onApply({
      title: suggestion.title,
      summary: suggestion.summary,
      description: suggestion.description,
      category: suggestion.category,
    });
    setApplied(true);
  };

  const discard = () => {
    // Discarding only clears the preview. Form fields are never touched here.
    setSuggestion(null);
    setApplied(false);
    setError(null);
  };

  const categoryLabel = suggestion
    ? (CATEGORIES.find((category) => category.id === suggestion.category)?.label ??
      suggestion.category)
    : "";

  return (
    <section
      aria-labelledby="copilot-heading"
      className="grid gap-md rounded-lg border border-line bg-card p-md shadow-card sm:p-lg"
    >
      <div>
        <h2 id="copilot-heading" className="type-h3">
          AI Event Copilot
        </h2>
        <p className="type-body mt-xs text-muted-text">
          Describe your event in your own words and the copilot will draft a title, summary,
          description, category, and tags. Nothing changes until you review and apply.
        </p>
      </div>

      <div className="grid gap-sm">
        <label className="type-caption text-muted-text" htmlFor="copilot-notes">
          Your event notes
        </label>
        <textarea
          id="copilot-notes"
          value={notes}
          rows={4}
          maxLength={MAX_NOTES_LENGTH}
          placeholder="e.g. A night market with 20 food stalls, live afrobeats, and art vendors. Family friendly, outdoors."
          className="type-body min-h-28 w-full resize-y rounded-md border border-line bg-card p-md text-primary-text outline-none placeholder:text-subtle-text focus:border-accent"
          onChange={(event) => setNotes(event.currentTarget.value)}
        />
        <p className="type-caption text-subtle-text">
          {notes.length} / {MAX_NOTES_LENGTH} characters
        </p>
      </div>

      <div>
        <Button
          type="button"
          onClick={() => void generate()}
          loading={generating}
          disabled={!notes.trim()}
          leadingIcon={<Sparkles aria-hidden className="size-4" />}
        >
          Generate suggestions
        </Button>
      </div>

      {error ? (
        <p
          className="type-body rounded-md border border-transactional/40 bg-transactional/10 p-md text-transactional"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {suggestion ? (
        <div
          className="grid gap-md rounded-md border border-line bg-accent/10 p-md"
          role="status"
          aria-label="AI suggestions"
        >
          <PreviewRow label="Title" value={suggestion.title} />
          <PreviewRow label="Summary" value={suggestion.summary} />
          <PreviewRow label="Description" value={suggestion.description} />
          <div>
            <p className="type-caption font-semibold text-muted-text">Category</p>
            <p className="mt-xs">
              <Badge variant="accent">{categoryLabel}</Badge>
            </p>
          </div>
          <div>
            <p className="type-caption font-semibold text-muted-text">Tags</p>
            <p className="mt-xs flex flex-wrap gap-xs">
              {suggestion.tags.length ? (
                suggestion.tags.map((tag) => (
                  <Badge key={tag} variant="neutral">
                    {tag}
                  </Badge>
                ))
              ) : (
                <span className="type-body text-muted-text">No tags suggested.</span>
              )}
            </p>
          </div>
          <p className="type-caption text-muted-text">
            Review carefully: the copilot only uses facts from your notes. Tags are ideas only
            and are not saved.
          </p>
          {applied ? (
            <p className="type-body text-primary-text">
              Applied to your form below. You can keep editing there.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-sm">
            <Button type="button" onClick={apply} disabled={applied}>
              Apply to form
            </Button>
            <Button type="button" variant="outline" onClick={discard}>
              Discard
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="type-caption font-semibold text-muted-text">{label}</p>
      <p className="type-body mt-xs whitespace-pre-line text-primary-text">{value}</p>
    </div>
  );
}
