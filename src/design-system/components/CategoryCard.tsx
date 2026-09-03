import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "../lib/utils";

export interface CategoryCardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  /** Icon element, typically a lucide icon. */
  icon: ReactNode;
  /** Secondary line, e.g. "412 events". */
  meta?: string;
  /** Whether this category is currently applied as a filter. */
  active?: boolean;
}

/**
 * Selectable category tile with lift, glow and icon micro-motion.
 * Used for discovery filters across the product.
 */
export const CategoryCard = forwardRef<HTMLButtonElement, CategoryCardProps>(
  ({ label, icon, meta, active = false, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={active}
      className={cn(
        "focus-ring group relative flex w-full items-center gap-md overflow-hidden rounded-lg border bg-card p-md text-left shadow-card transition-all duration-200",
        "hover:-translate-y-[3px] hover:border-accent/50 hover:shadow-glow active:scale-[0.99]",
        active ? "border-accent shadow-glow" : "border-line",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-6 -top-8 size-20 rounded-full bg-accent/10 blur-xl transition-opacity duration-200",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      />
      <span
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-md border transition-all duration-200 group-hover:-rotate-6 group-hover:scale-110",
          active
            ? "border-accent/50 bg-accent text-on-accent"
            : "border-line bg-elevated text-accent group-hover:border-accent/40",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="type-body block truncate font-semibold text-primary-text">{label}</span>
        {meta ? (
          <span className="type-caption block truncate text-subtle-text">{meta}</span>
        ) : null}
      </span>
    </button>
  ),
);
CategoryCard.displayName = "CategoryCard";
