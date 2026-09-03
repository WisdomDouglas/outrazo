import { MapPin, Navigation } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "../lib/utils";

export interface CityCardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  name: string;
  imageSrc: string;
  /** Secondary line, e.g. "1,234 events". */
  meta?: string;
  /** Distance label when geolocation is known, e.g. "12 km away". */
  distance?: string;
  /** Whether this city is the active discovery location. */
  active?: boolean;
}

/** Location tile used for the "Near you" discovery surface. */
export const CityCard = forwardRef<HTMLButtonElement, CityCardProps>(
  ({ name, imageSrc, meta, distance, active = false, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={active}
      className={cn(
        "focus-ring group relative block w-full overflow-hidden rounded-lg border text-left shadow-card transition-all duration-200 hover:-translate-y-[3px] hover:shadow-glow active:scale-[0.99]",
        active ? "border-accent" : "border-line",
        className,
      )}
      {...props}
    >
      <img
        src={imageSrc}
        alt={`${name} skyline`}
        loading="lazy"
        className="aspect-[16/10] w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <span
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/35 to-transparent"
      />
      {distance ? (
        <span className="type-caption absolute right-sm top-sm inline-flex items-center gap-xs rounded-full bg-canvas/70 px-sm py-[3px] font-semibold text-primary-text backdrop-blur-md">
          <Navigation aria-hidden className="size-3.5 text-accent" />
          {distance}
        </span>
      ) : null}
      <span className="absolute inset-x-md bottom-md flex items-end justify-between gap-sm">
        <span className="min-w-0">
          <span className="type-h3 block truncate text-primary-text">{name}</span>
          {meta ? (
            <span className="type-caption flex items-center gap-xs text-muted-text">
              <MapPin aria-hidden className="size-3.5" />
              {meta}
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "type-caption shrink-0 rounded-full px-sm py-[3px] font-semibold transition-colors",
            active
              ? "bg-accent text-on-accent"
              : "bg-primary-text/10 text-muted-text group-hover:bg-accent/15 group-hover:text-accent",
          )}
        >
          {active ? "Selected" : "Explore"}
        </span>
      </span>
    </button>
  ),
);
CityCard.displayName = "CityCard";
