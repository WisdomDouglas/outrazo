import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/design-system/lib/utils";
import { displayLocationLabel } from "@/showcase/discovery/locations";
import { StateSearchList } from "@/showcase/discovery/StateSearchList";

export interface LocationPickerProps {
  location: string;
  onChange: (location: string) => void;
  className?: string;
}

/** Location context chip with a searchable Nigerian state switcher. */
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
        {displayLocationLabel(location)}
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
        <div className="absolute top-[calc(100%+var(--spacing-xs))] left-0 z-20 w-72 max-w-[80vw] rounded-md border border-line bg-card p-sm shadow-card">
          <StateSearchList
            selected={location}
            onSelect={(stateName) => {
              onChange(stateName);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
