import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "../lib/utils";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {}

/** Loading placeholder. Match the shape of the content it stands in for. */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden
      className={cn("animate-pulse rounded-md bg-primary-text/10", className)}
      {...props}
    />
  ),
);
Skeleton.displayName = "Skeleton";
