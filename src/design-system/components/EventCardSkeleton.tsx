import { forwardRef, type HTMLAttributes } from "react";

import { Skeleton } from "./Skeleton";
import { cn } from "../lib/utils";

export interface EventCardSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Image proportion, matching EventCard. */
  aspect?: "16/9" | "1/1";
}

/** Loading placeholder shaped like an EventCard. */
export const EventCardSkeleton = forwardRef<HTMLDivElement, EventCardSkeletonProps>(
  ({ className, aspect = "16/9", ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        "flex h-full flex-col gap-md rounded-lg border border-line bg-card p-md shadow-card",
        className,
      )}
      {...props}
    >
      <Skeleton className={cn("w-full", aspect === "1/1" ? "aspect-square" : "aspect-video")} />
      <div className="flex min-h-2xl flex-col gap-sm lg:min-h-3xl">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <div className="mt-auto flex items-center justify-between gap-md border-t border-line pt-md">
        <Skeleton className="h-6 w-1/2 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-sm" />
      </div>
      <div className="flex items-center gap-sm">
        <Skeleton className="size-7 rounded-full" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  ),
);
EventCardSkeleton.displayName = "EventCardSkeleton";

/** Convenience grid of skeleton cards for list-level loading states. */
export function EventCardSkeletonGrid({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-lg", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <EventCardSkeleton key={index} />
      ))}
    </div>
  );
}
