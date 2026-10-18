import { EventCard } from "@/design-system/components/EventCard";
import { useSavedItems } from "@/design-system/lib/use-saved-items";
import { cn } from "@/design-system/lib/utils";
import { toEventCardProps, type OutrazoEvent } from "@/showcase/sample-data";

export function AppEventGrid({
  events,
  className,
  label,
}: {
  events: OutrazoEvent[];
  className?: string;
  label?: string;
}) {
  const { isSaved, toggle } = useSavedItems();
  return (
    <div
      className={cn(
        "grid items-stretch gap-lg sm:grid-cols-2",
        events.length === 4 ? "xl:grid-cols-2 2xl:grid-cols-4" : "xl:grid-cols-3",
        className,
      )}
      {...(label ? { role: "region", "aria-label": label, tabIndex: 0 } : {})}
    >
      {events.map((event) => (
        <EventCard key={event.id} {...toEventCardProps(event)} saved={isSaved(event.id)} onToggleSave={() => toggle(event.id)} />
      ))}
    </div>
  );
}