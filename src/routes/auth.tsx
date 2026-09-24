import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/showcase/auth/AuthPage";

export const Route = createFileRoute("/auth")({ component: () => <AuthPage initialMode="signin" /> });