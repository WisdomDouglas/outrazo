import { BadgeCheck } from "lucide-react";

import { isOfficialOrganizerName } from "@/showcase/organizers";
import { cn } from "../lib/utils";

/**
 * Organizer name with the official-Outrazo verification check. By default the
 * check follows the name rule; pass showBadge to gate it further (for
 * example, the event page requires Scout provenance too).
 */
export function OrganizerName({
  name,
  className,
  showBadge = isOfficialOrganizerName(name),
}: {
  name: string;
  className?: string;
  showBadge?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-xs", className)}>
      <span>{name}</span>
      {showBadge ? (
        <>
          <BadgeCheck aria-hidden className="size-4 shrink-0 text-accent" />
          <span className="sr-only">(Verified organizer)</span>
        </>
      ) : null}
    </span>
  );
}
