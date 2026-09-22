import { forwardRef, type HTMLAttributes } from "react";

import { Avatar, type AvatarProps } from "./Avatar";
import { cn } from "../lib/utils";

export interface AvatarStackPerson {
  name: string;
  src?: string;
}

export interface AvatarStackProps extends HTMLAttributes<HTMLDivElement> {
  /** People to display, in priority order. */
  people: AvatarStackPerson[];
  /** How many avatars to render before collapsing into a count. */
  max?: number;
  /** Avatar scale. */
  size?: AvatarProps["size"];
  /** Total attendees, when it exceeds the avatars provided. */
  totalCount?: number;
  /** Word after the overflow count, e.g. "going". */
  overflowLabel?: string;
}

/** Overlapping avatars used as social proof on event surfaces. */
export const AvatarStack = forwardRef<HTMLDivElement, AvatarStackProps>(
  (
    {
      className,
      people,
      max = 4,
      size = "sm",
      totalCount,
      overflowLabel = "going",
      ...props
    },
    ref,
  ) => {
    const shown = people.slice(0, max);
    const overflow = Math.max(totalCount ?? people.length, people.length) - shown.length;

    return (
      <div ref={ref} className={cn("flex items-center", className)} {...props}>
        <div className="flex items-center -space-x-2">
          {shown.map((person) => (
            <Avatar
              key={person.name}
              name={person.name}
              src={person.src}
              size={size}
              className="ring-2 ring-card"
            />
          ))}
        </div>
        {overflow > 0 ? (
          <span className="type-caption ml-sm text-muted-text">+{overflow} going</span>
        ) : null}
      </div>
    );
  },
);
AvatarStack.displayName = "AvatarStack";
