import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/events")({
  component: EventsLayout,
});

function EventsLayout() {
  return <Outlet />;
}
