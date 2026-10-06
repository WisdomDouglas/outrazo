import { EventCard } from "@/design-system/components/EventCard";
import { useSavedItems } from "@/design-system/lib/use-saved-items";
import { toEventCardProps, type OutrazoEvent } from "@/showcase/sample-data";

export function AppEventGrid({ events }: { events: OutrazoEvent[] }) {
  const { isSaved, toggle } = useSavedItems();
  return (
    <div className="grid items-stretch gap-lg sm:grid-cols-2 xl:grid-cols-3">
      {events.map((event) => (
        <EventCard key={event.id} {...toEventCardProps(event)} saved={isSaved(event.id)} onToggleSave={() => toggle(event.id)} />
      ))}
    </div>
  );
}