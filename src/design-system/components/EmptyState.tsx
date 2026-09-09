import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../lib/utils";

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional icon rendered in an accent container. */
  icon?: ReactNode;
  /** Short headline, e.g. "Nothing happening here yet." */
  title: string;
  /** Supporting sentence guiding the next step. */
  description?: string;
  /** Optional action, usually a Button. */
  action?: ReactNode;
}

/** Neutral state shown when a list has no results yet. */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon, title, description, action, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-col items-center gap-md rounded-lg border border-line bg-card p-xl text-center shadow-card",
        className,
      )}
      {...props}
    >
      {icon ? (
        <span className="grid size-12 place-items-center rounded-full bg-accent/15 text-accent">
          {icon}
        </span>
      ) : null}
      <div className="flex flex-col gap-xs">
        <h3 className="type-h3">{title}</h3>
        {description ? <p className="type-body text-muted-text">{description}</p> : null}
      </div>
      {action}
    </div>
  ),
);
EmptyState.displayName = "EmptyState";
