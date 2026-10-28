import { Sparkles } from "lucide-react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { SearchField } from "@/design-system/components/SearchField";
import { MAX_DISCOVERY_QUERY_LENGTH } from "./interpretDiscoveryQuery";

interface NLSearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired only on form submit, never on keystroke. */
  onSubmit: () => void;
  loading: boolean;
  error: string | null;
  /** Null when no interpretation is applied. */
  activeSummary: string | null;
  onClear: () => void;
}

export function NLSearchBox({
  value,
  onChange,
  onSubmit,
  loading,
  error,
  activeSummary,
  onClear,
}: NLSearchBoxProps) {
  return (
    <div className="grid gap-sm">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="max-w-[520px]"
      >
        <div className="flex gap-sm">
          <SearchField
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onClear={onClear}
            maxLength={MAX_DISCOVERY_QUERY_LENGTH}
            label="Describe the event you're looking for"
            placeholder='Try "free tech events in Port Harcourt this weekend"'
            className="min-w-0 flex-1"
          />
          <Button
            type="submit"
            loading={loading}
            disabled={!value.trim()}
            leadingIcon={<Sparkles aria-hidden className="size-4" />}
            className="shrink-0"
          >
            Ask AI
          </Button>
        </div>
      </form>
      {error ? (
        <p
          className="type-body max-w-[520px] rounded-md border border-transactional/40 bg-transactional/10 p-md text-transactional"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {activeSummary !== null ? (
        <div className="flex flex-wrap items-center gap-sm">
          <Badge variant="accent">
            <Sparkles aria-hidden className="size-3.5" />
            {activeSummary || "Showing all events"}
          </Badge>
          <button
            type="button"
            onClick={onClear}
            className="focus-ring type-caption rounded-full text-muted-text hover:text-primary-text"
          >
            Clear AI search
          </button>
        </div>
      ) : null}
    </div>
  );
}
