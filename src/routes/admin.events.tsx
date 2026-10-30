import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/events")({
  component: AdminEventsLayout,
});

function AdminEventsLayout() {
  return <Outlet />;
}
