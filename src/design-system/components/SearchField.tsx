import { Loader2, Search, X } from "lucide-react";
import { forwardRef, useId, type InputHTMLAttributes } from "react";

import { cn } from "../lib/utils";

export interface SearchFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Accessible label for the search input. */
  label?: string;
  /** Shows a spinner while results are being fetched. */
  loading?: boolean;
  /** Renders a clear button when the field has a value. */
  onClear?: () => void;
}

/** Search entry point for discovery surfaces: icon, clear action, loading feedback. */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(
  (
    { className, label = "Search events", loading = false, onClear, value, id, ...props },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const hasValue = typeof value === "string" ? value.length > 0 : false;

    return (
      <div
        className={cn(
          "flex h-12 items-center gap-sm rounded-md border border-line bg-card px-md transition-colors focus-within:border-accent",
          className,
        )}
      >
        <Search aria-hidden className="size-[18px] shrink-0 text-subtle-text" />
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          type="search"
          value={value}
          className="type-body w-full bg-transparent text-primary-text outline-none placeholder:text-subtle-text [&::-webkit-search-cancel-button]:hidden"
          {...props}
        />
        {loading ? (
          <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-accent" />
        ) : hasValue && onClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="focus-ring -mr-xs grid size-8 shrink-0 place-items-center rounded-full text-subtle-text hover:text-primary-text"
          >
            <X aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>
    );
  },
);
SearchField.displayName = "SearchField";
