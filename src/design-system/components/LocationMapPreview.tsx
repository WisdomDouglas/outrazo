import { MapPin } from "lucide-react";
import { cn } from "../lib/utils";

export interface LocationMapPreviewProps {
  location: string;
  className?: string;
  compact?: boolean;
}

export function LocationMapPreview({
  location,
  className,
  compact = false,
}: LocationMapPreviewProps) {
  return (
    <div
      className={cn("location-map-preview", compact && "location-map-preview--compact", className)}
      role="img"
      aria-label={`Illustrative map preview near ${location}; not to scale`}
    >
      <svg className="location-map-preview__art" viewBox="0 0 640 400" aria-hidden="true">
        <path className="location-map-preview__park" d="M37 45h164l36 45-18 83-73 16-61-32-66 11zM442 253l66-42 94 18 15 105-84 25-64-36z" />
        <path className="location-map-preview__block" d="m283 29 75 13 12 55-70 23-39-34zm122 70 88-19 42 39-17 63-91 8-40-39zM91 240l87-16 36 42-16 67-77 20-46-47zm208 35 73-36 49 26-11 82-91 15-37-43z" />
        <path className="location-map-preview__road-edge" d="M-20 305 184 197l168-49 140-16 177-83M62-25l104 132 95 83 145 79 174 114M-20 96l180 30 134 63 119 93 86 138M340-20l-7 125 48 103 96 81 184 23" />
        <path className="location-map-preview__road" d="M-20 305 184 197l168-49 140-16 177-83M62-25l104 132 95 83 145 79 174 114M-20 96l180 30 134 63 119 93 86 138M340-20l-7 125 48 103 96 81 184 23" />
        <path className="location-map-preview__minor-road" d="m202 0-5 86 43 77 9 89-58 148M510-20l-36 87-78 41-77 73-30 98-30 141M0 215l126-21 118 26 113 53 89 100M583 0l-20 89-48 61-12 87 42 82" />
      </svg>
      <span className="location-map-preview__marker" aria-hidden="true">
        <MapPin className="size-5" />
      </span>
      {!compact ? (
        <span className="location-map-preview__label">
          <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
          <span>{location}</span>
        </span>
      ) : null}
    </div>
  );
}
