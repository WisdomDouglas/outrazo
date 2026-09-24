import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/showcase/auth/AuthPage";

export const Route = createFileRoute("/signup")({ component: () => <AuthPage initialMode="signup" /> });