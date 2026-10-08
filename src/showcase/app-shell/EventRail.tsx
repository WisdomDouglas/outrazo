import { Carousel } from "@/design-system/components/Carousel";
import { EventCard } from "@/design-system/components/EventCard";
import { useSavedItems } from "@/design-system/lib/use-saved-items";
import { toEventCardProps, type OutrazoEvent } from "@/showcase/sample-data";

/** Compact scroll rail of the shared EventCard, reusing the design-system carousel. */
export function EventRail({ events, label }: { events: OutrazoEvent[]; label: string }) {
  const { isSaved, toggle } = useSavedItems();
  return (
    <Carousel
      label={label}
      controls
      trackClassName="-mx-md px-md lg:mx-0 lg:px-0"
      slideClassName="w-[82vw] max-w-[340px] sm:w-[320px] lg:w-[340px]"
    >
      {events.map((event) => (
        <EventCard
          key={event.id}
          {...toEventCardProps(event)}
          saved={isSaved(event.id)}
          onToggleSave={() => toggle(event.id)}
        />
      ))}
    </Carousel>
  );
}
