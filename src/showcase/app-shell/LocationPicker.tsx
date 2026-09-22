import { Check, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/design-system/lib/utils";

/** Mock location list — replace with a real places source later. */
export const DEMO_LOCATIONS = ["Lagos", "Port Harcourt", "Abuja", "Ibadan"];

export interface LocationPickerProps {
  location: string;
  onChange: (location: string) => void;
  className?: string;
}

/** Location context chip with a small mock location switcher. */
export function LocationPicker({ location, onChange, className }: LocationPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn("relative inline-flex items-center gap-xs", className)}>
      <span className="type-body inline-flex min-h-11 items-center gap-xs text-muted-text">
        <MapPin aria-hidden className="size-4 text-accent" strokeWidth={2} />
        {location}
      </span>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="focus-ring type-caption inline-flex min-h-11 items-center rounded-full px-xs text-accent transition-colors hover:text-primary-text"
      >
        Change
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label="Choose a location"
          className="absolute top-[calc(100%+var(--spacing-xs))] left-0 z-20 w-48 overflow-hidden rounded-md border border-line bg-card p-xs shadow-card"
        >
          {DEMO_LOCATIONS.map((city) => (
            <li key={city}>
              <button
                type="button"
                role="option"
                aria-selected={city === location}
                onClick={() => {
                  onChange(city);
                  setOpen(false);
                }}
                className="focus-ring type-body flex min-h-11 w-full items-center justify-between rounded-sm px-sm text-left transition-colors hover:bg-accent/10"
              >
                {city}
                {city === location ? <Check aria-hidden className="size-4 text-accent" /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
