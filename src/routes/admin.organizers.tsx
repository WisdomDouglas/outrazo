import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/organizers")({
  component: AdminOrganizersLayout,
});

function AdminOrganizersLayout() {
  return <Outlet />;
}
