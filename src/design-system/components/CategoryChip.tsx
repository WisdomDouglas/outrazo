import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "../lib/utils";

export interface CategoryChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Marks the chip as the currently applied filter. */
  active?: boolean;
  /** Icon rendered before the label. */
  icon?: ReactNode;
}

/** Selectable pill used for category and quick filters. */
export const CategoryChip = forwardRef<HTMLButtonElement, CategoryChipProps>(
  ({ className, active = false, icon, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={active}
      className={cn(
        "type-body focus-ring inline-flex h-11 items-center gap-sm rounded-full border px-lg font-medium transition-colors active:scale-[0.98]",
        active
          ? "border-accent bg-accent text-on-accent"
          : "border-line bg-card text-muted-text hover:border-line-strong hover:text-primary-text",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  ),
);
CategoryChip.displayName = "CategoryChip";
