import { ArrowRight, Search, Sparkles, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { cn } from "@/design-system/lib/utils";
import { MAX_DISCOVERY_QUERY_LENGTH } from "./interpretDiscoveryQuery";

interface ExploreSearchBarProps {
  keywordValue: string;
  onKeywordChange: (val: string) => void;
  onKeywordSubmit: (event: FormEvent) => void;
  onKeywordClear: () => void;

  nlValue: string;
  onNlChange: (val: string) => void;
  onNlSubmit: () => void;
  nlLoading: boolean;
  nlError: string | null;
  nlActiveSummary: string | null;
  onNlClear: () => void;

  className?: string;
}

export function ExploreSearchBar({
  keywordValue,
  onKeywordChange,
  onKeywordSubmit,
  onKeywordClear,
  nlValue,
  onNlChange,
  onNlSubmit,
  nlLoading,
  nlError,
  nlActiveSummary,
  onNlClear,
  className,
}: ExploreSearchBarProps) {
  const [showAi, setShowAi] = useState(Boolean(nlActiveSummary));

  return (
    <div className={cn("w-full max-w-[640px] mx-auto", className)}>
      {/* Balanced, Prominent Mode Switcher */}
      <div className="mb-2.5 sm:mb-3 flex justify-center">
        <div
          role="tablist"
          aria-label="Search mode"
          className="inline-flex items-center rounded-full border border-line bg-card/80 backdrop-blur-md p-1 shadow-sm"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!showAi}
            onClick={() => setShowAi(false)}
            className={cn(
              "focus-ring inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 sm:px-4 sm:py-1.5 text-xs font-semibold transition-all",
              !showAi
                ? "bg-accent text-on-accent shadow-sm"
                : "text-muted-text hover:text-primary-text",
            )}
          >
            <Search aria-hidden="true" className="size-3.5" />
            <span>Search</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={showAi}
            onClick={() => setShowAi(true)}
            className={cn(
              "focus-ring inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 sm:px-4 sm:py-1.5 text-xs font-semibold transition-all",
              showAi
                ? "bg-accent text-on-accent shadow-sm"
                : "text-muted-text hover:text-primary-text",
            )}
          >
            <Sparkles aria-hidden="true" className="size-3.5" />
            <span>Ask AI</span>
            {nlActiveSummary ? (
              <span
                className="size-1.5 rounded-full bg-transactional"
                aria-label="Filter active"
              />
            ) : null}
          </button>
        </div>
      </div>

      {/* Primary Search Console */}
      {!showAi ? (
        <form
          onSubmit={onKeywordSubmit}
          className="relative flex items-center rounded-2xl border border-line-strong bg-card/90 backdrop-blur-md p-1.5 shadow-card transition-colors focus-within:border-accent"
        >
          <div className="relative flex min-w-0 flex-1 items-center">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 size-4 text-muted-text"
            />
            <input
              type="text"
              value={keywordValue}
              onChange={(e) => onKeywordChange(e.target.value)}
              placeholder="Search by event title, venue, or artist..."
              aria-label="Search events"
              className="w-full rounded-xl bg-transparent py-2 pl-9 pr-8 text-xs sm:text-sm text-primary-text placeholder:text-subtle-text focus:outline-none"
            />
            {keywordValue ? (
              <button
                type="button"
                onClick={onKeywordClear}
                className="focus-ring absolute right-2 grid size-6 place-items-center rounded-full text-muted-text hover:text-primary-text"
                aria-label="Clear search input"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            ) : null}
          </div>

          <Button
            type="submit"
            variant="primary"
            size="sm"
            className="shrink-0 rounded-xl px-3 py-1.5 text-xs sm:px-4 sm:text-sm font-semibold"
          >
            <span>Search</span>
          </Button>
        </form>
      ) : (
        /* AI Natural Language Prompt Console */
        <div className="rounded-2xl border border-line-strong bg-card/90 backdrop-blur-md p-1.5 sm:p-2 shadow-card">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onNlSubmit();
            }}
            className="flex items-center gap-1.5 sm:gap-2"
          >
            <div className="relative flex min-w-0 flex-1 items-center">
              <Sparkles
                aria-hidden="true"
                className="pointer-events-none absolute left-3 size-4 text-accent"
              />
              <input
                type="text"
                value={nlValue}
                onChange={(e) => onNlChange(e.target.value)}
                maxLength={MAX_DISCOVERY_QUERY_LENGTH}
                placeholder='Describe your vibe, e.g. "tech meetups in Lagos this weekend"'
                aria-label="Describe the event you are looking for"
                className="w-full rounded-xl bg-transparent py-2 pl-9 pr-8 text-xs sm:text-sm text-primary-text placeholder:text-subtle-text focus:outline-none"
              />
              {nlValue ? (
                <button
                  type="button"
                  onClick={onNlClear}
                  className="focus-ring absolute right-2 grid size-6 place-items-center rounded-full text-muted-text hover:text-primary-text"
                  aria-label="Clear AI prompt"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              ) : null}
            </div>

            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={nlLoading}
              disabled={!nlValue.trim()}
              leadingIcon={<Sparkles aria-hidden="true" className="size-3.5" />}
              className="shrink-0 rounded-xl px-3 py-1.5 text-xs sm:px-4 sm:text-sm font-semibold"
            >
              Ask AI
            </Button>
          </form>

          {nlError ? (
            <p className="mt-2 text-xs text-transactional px-2" role="alert">
              {nlError}
            </p>
          ) : null}

          {nlActiveSummary ? (
            <div className="mt-2 flex items-center justify-between border-t border-line/50 pt-2 px-1">
              <Badge variant="accent" className="text-xs py-0.5">
                {nlActiveSummary}
              </Badge>
              <button
                type="button"
                onClick={onNlClear}
                className="focus-ring text-xs text-muted-text hover:text-primary-text underline"
              >
                Reset AI
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
