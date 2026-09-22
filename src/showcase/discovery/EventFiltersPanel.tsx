import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

import { Button } from "@/design-system/components/Button";
import { cn } from "@/design-system/lib/utils";

export type DateFilter = "any" | "today" | "weekend" | "week";
export type LocationFilter = "any" | "near" | "lagos" | "other";
export type PriceFilter = "any" | "free" | "paid";

export interface EventFilters {
  date: DateFilter;
  location: LocationFilter;
  price: PriceFilter;
}

export const DEFAULT_EVENT_FILTERS: EventFilters = {
  date: "any",
  location: "any",
  price: "any",
};

interface EventFiltersPanelProps {
  open: boolean;
  value: EventFilters;
  resultCount: number;
  onChange: (value: EventFilters) => void;
  onClear: () => void;
  onClose: () => void;
  onApply: () => void;
}

const FILTER_GROUPS = [
  {
    key: "date" as const,
    label: "Date",
    options: [
      ["any", "Any date"],
      ["today", "Today"],
      ["weekend", "This weekend"],
      ["week", "This week"],
    ] as const,
  },
  {
    key: "location" as const,
    label: "Location",
    options: [
      ["any", "Any location"],
      ["near", "Near me"],
      ["lagos", "Lagos"],
      ["other", "Other locations"],
    ] as const,
  },
  {
    key: "price" as const,
    label: "Price",
    options: [
      ["any", "Any price"],
      ["free", "Free"],
      ["paid", "Paid"],
    ] as const,
  },
] as const;

export function EventFiltersPanel({
  open,
  value,
  resultCount,
  onChange,
  onClear,
  onClose,
  onApply,
}: EventFiltersPanelProps) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-lg">
      <button
        type="button"
        aria-label="Close filters"
        className="absolute inset-0 bg-canvas/75 backdrop-blur-sm"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-lg border border-line bg-card shadow-floating sm:max-w-[520px] sm:rounded-lg"
      >
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-md border-b border-line px-lg py-md">
          <div className="flex min-w-0 items-center gap-sm">
            <SlidersHorizontal aria-hidden className="size-5 shrink-0 text-accent" />
            <h2 id={titleId} className="type-h3 truncate">Filters</h2>
          </div>
          <Button
            ref={closeButtonRef}
            type="button"
            variant="ghost"
            size="sm"
            className="size-11 px-0"
            aria-label="Close filters"
            onClick={onClose}
          >
            <X aria-hidden className="size-5" />
          </Button>
        </header>

        <div className="overflow-y-auto px-lg py-md">
          {FILTER_GROUPS.map((group) => (
            <fieldset key={group.key} className="border-b border-line py-md first:pt-0 last:border-0 last:pb-0">
              <legend className="type-caption mb-sm font-semibold uppercase text-muted-text">
                {group.label}
              </legend>
              <div className="grid grid-cols-2 gap-sm">
                {group.options.map(([optionValue, label]) => {
                  const checked = value[group.key] === optionValue;
                  return (
                    <label
                      key={optionValue}
                      className={cn(
                        "focus-within:ring-accent flex min-h-11 cursor-pointer items-center gap-sm rounded-md border px-md py-sm transition-colors focus-within:ring-2",
                        checked
                          ? "border-accent bg-accent/10 text-primary-text"
                          : "border-line bg-canvas text-muted-text hover:border-line-strong hover:text-primary-text",
                      )}
                    >
                      <input
                        type="radio"
                        name={group.key}
                        value={optionValue}
                        checked={checked}
                        onChange={() => onChange({ ...value, [group.key]: optionValue })}
                        className="size-4 shrink-0 accent-accent"
                      />
                      <span className="type-body">{label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>

        <footer className="grid grid-cols-2 gap-sm border-t border-line bg-card px-lg py-md">
          <Button type="button" variant="ghost" onClick={onClear}>
            Clear all
          </Button>
          <Button type="button" onClick={onApply}>
            Show {resultCount} {resultCount === 1 ? "event" : "events"}
          </Button>
        </footer>
      </section>
    </div>
  );
}