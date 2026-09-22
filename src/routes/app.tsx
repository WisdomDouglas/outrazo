import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/showcase/app-shell/AppShell";

export const Route = createFileRoute("/app")({ component: AppShell });