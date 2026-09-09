import { AlertTriangle } from "lucide-react";
import { forwardRef, type HTMLAttributes } from "react";

import { Button } from "./Button";
import { cn } from "../lib/utils";

export interface ErrorStateProps extends HTMLAttributes<HTMLDivElement> {
  /** Headline. Defaults to the product-wide error copy. */
  title?: string;
  /** Supporting sentence explaining what failed. */
  description?: string;
  /** Retry handler; the retry button is hidden when omitted. */
  onRetry?: () => void;
  /** Label for the retry button. */
  retryLabel?: string;
  /** Shows the retry button in its pending state. */
  retrying?: boolean;
}

/** Failure state for any data-backed surface. */
export const ErrorState = forwardRef<HTMLDivElement, ErrorStateProps>(
  (
    {
      className,
      title = "Something went wrong.",
      description = "Unable to load events right now.",
      onRetry,
      retryLabel = "Try Again",
      retrying = false,
      ...props
    },
    ref,
  ) => (
    <div
      ref={ref}
      role="alert"
      className={cn(
        "flex flex-col items-center gap-md rounded-lg border border-line bg-card p-xl text-center shadow-card",
        className,
      )}
      {...props}
    >
      <span className="grid size-12 place-items-center rounded-full bg-transactional/15 text-transactional">
        <AlertTriangle aria-hidden className="size-5" strokeWidth={2} />
      </span>
      <div className="flex flex-col gap-xs">
        <h3 className="type-h3">{title}</h3>
        <p className="type-body text-muted-text">{description}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry} disabled={retrying}>
          {retrying ? "Retrying…" : retryLabel}
        </Button>
      ) : null}
    </div>
  ),
);
ErrorState.displayName = "ErrorState";
