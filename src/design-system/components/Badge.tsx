import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "../lib/utils";

const badgeVariants = cva(
  "type-caption inline-flex items-center gap-xs rounded-sm px-sm py-[3px] font-semibold",
  {
    variants: {
      variant: {
        neutral: "bg-primary-text/10 text-primary-text",
        accent: "bg-accent/15 text-accent",
        transactional: "bg-transactional/15 text-transactional",
        outline: "border border-line-strong text-muted-text",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

/** Compact metadata label: category, price, status. */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
  ),
);
Badge.displayName = "Badge";

export { badgeVariants };
