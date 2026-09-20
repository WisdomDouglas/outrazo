import { createFileRoute, redirect } from "@tanstack/react-router";

/** Friendly alias for the existing Explore page at /events. */
export const Route = createFileRoute("/explore")({
  beforeLoad: () => {
    throw redirect({ to: "/events" });
  },
});
