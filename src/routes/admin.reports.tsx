import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/reports")({
  component: AdminReportsLayout,
});

function AdminReportsLayout() {
  return <Outlet />;
}
