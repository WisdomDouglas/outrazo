import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "../lib/utils";

const avatarVariants = cva(
  "type-caption inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-elevated font-semibold text-muted-text ring-1 ring-line",
  {
    variants: {
      size: {
        sm: "size-6 text-[10px]",
        md: "size-9",
        lg: "size-12 text-[14px]",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export interface AvatarProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof avatarVariants> {
  /** Person or organizer name; used for the initials fallback and alt text. */
  name: string;
  /** Optional avatar image URL. */
  src?: string;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Identity marker for hosts, organizers, and attendees. */
export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, size, name, src, ...props }, ref) => (
    <span ref={ref} className={cn(avatarVariants({ size }), className)} {...props}>
      {src ? (
        <img src={src} alt={name} className="size-full object-cover" loading="lazy" />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
      {src ? null : <span className="sr-only">{name}</span>}
    </span>
  ),
);
Avatar.displayName = "Avatar";

export { avatarVariants };
