import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, MapPin, Ticket, Users } from "lucide-react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { Input } from "@/design-system/components/Input";
import { Reveal } from "@/design-system/components/Reveal";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Post your event — Outrazo" },
      {
        name: "description",
        content:
          "List your party, concert, meetup or dinner on Outrazo and reach people looking for something to do tonight.",
      },
      { property: "og:title", content: "Post your event — Outrazo" },
      {
        property: "og:description",
        content: "List your event on Outrazo and fill the room.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreateEvent,
});

const PERKS = [
  { icon: Users, title: "Reach locals", copy: "Surfaced to people browsing your city." },
  { icon: Ticket, title: "Secure ticketing", copy: "Paid or free entry, your call." },
  { icon: CalendarDays, title: "Easy check-in", copy: "Scan guests in at the door." },
];

function CreateEvent() {
  return (
    <div className="min-h-screen bg-canvas text-primary-text">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-md px-md py-lg lg:px-xl">
          <Link
            to="/"
            className="focus-ring type-body inline-flex items-center gap-xs rounded-full text-muted-text hover:text-primary-text"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Back home
          </Link>
          <Link to="/events" className="focus-ring type-body rounded-full text-accent">
            Explore events
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1080px] gap-2xl px-md py-2xl lg:grid-cols-[1.1fr_0.9fr] lg:px-xl">
        <Reveal className="flex flex-col gap-lg">
          <Badge variant="transactional">Organizers</Badge>
          <h1 className="type-h1 text-[30px] lg:text-[44px]">
            Post your event, fill the room.
          </h1>
          <p className="type-body-lg text-muted-text">
            Tell us the basics and we&apos;ll put it in front of people already looking for
            something to do.
          </p>

          <form className="flex flex-col gap-md" onSubmit={(event) => event.preventDefault()}>
            <Input label="Event title" placeholder="Lagos Night Market" />
            <Input label="Venue" placeholder="Freedom Park, Lagos Island" />
            <div className="grid gap-md sm:grid-cols-2">
              <Input label="Date" placeholder="Fri 12 Sep" />
              <Input label="Start time" placeholder="8:00 PM" />
            </div>
            <Input label="Ticket price" placeholder="₦12,000 or Free" />
            <Button type="submit" size="lg" className="w-full sm:w-auto">
              Continue
            </Button>
            <p className="type-caption text-subtle-text">
              Submissions aren&apos;t live yet — this form is a preview of the organizer flow.
            </p>
          </form>
        </Reveal>

        <Reveal delay={80} className="flex flex-col gap-md">
          {PERKS.map(({ icon: Icon, title, copy }) => (
            <div
              key={title}
              className="flex items-start gap-md rounded-lg border border-line bg-card p-lg shadow-card"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                <Icon aria-hidden className="size-5" strokeWidth={2} />
              </span>
              <span>
                <span className="type-h3 block">{title}</span>
                <span className="type-body text-muted-text">{copy}</span>
              </span>
            </div>
          ))}
          <div className="flex items-center gap-sm rounded-lg border border-line bg-elevated p-lg">
            <MapPin aria-hidden className="size-5 text-accent" />
            <p className="type-body text-muted-text">
              Now live in Lagos, Abuja, Port Harcourt and Ibadan.
            </p>
          </div>
        </Reveal>
      </main>
    </div>
  );
}
