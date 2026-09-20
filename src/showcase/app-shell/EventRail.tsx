import { EventCard } from "@/design-system/components/EventCard";
import { useSavedItems } from "@/design-system/lib/use-saved-items";
import { toEventCardProps, type OutrazoEvent } from "@/showcase/sample-data";

/** Horizontally scrollable rail of the shared EventCard. Used for compact sections. */
export function EventRail({ events }: { events: OutrazoEvent[] }) {
  const { isSaved, toggle } = useSavedItems();
  return (
    <div className="-mx-md w-[calc(100%+2*var(--spacing-md))] min-w-0 overflow-x-auto px-md pb-xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex snap-x snap-mandatory gap-lg">
        {events.map((event) => (
          <li
            key={event.id}
            className="w-[78vw] max-w-[340px] shrink-0 snap-start sm:w-[320px] lg:w-[360px]"
          >
            <EventCard
              {...toEventCardProps(event)}
              saved={isSaved(event.id)}
              onToggleSave={() => toggle(event.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
