import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/showcase/auth/AuthPage";

export const Route = createFileRoute("/login")({ component: () => <AuthPage initialMode="signin" /> });