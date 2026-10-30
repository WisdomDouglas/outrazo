import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { AppShell } from "@/showcase/app-shell/AppShell";
import { useAuth } from "@/showcase/auth/auth-context";
import { BrandSplash } from "@/showcase/BrandSplash";
import { ErrorState } from "@/design-system/components/ErrorState";

export const Route = createFileRoute("/app")({ component: ProtectedApp });

function ProtectedApp() {
	const navigate = useNavigate({ from: "/app" });
	const { loading, session, profile, profileError, refreshProfile } = useAuth();

	useEffect(() => {
		if (loading || profileError) return;
		if (!session) void navigate({ to: "/login", replace: true });
		else if (!profile?.onboarding_completed) void navigate({ to: "/onboarding", replace: true });
	}, [loading, navigate, profile, profileError, session]);

	if (profileError && session) {
		return (
			<main className="grid min-h-dvh place-items-center bg-canvas px-md">
				<ErrorState
					title="We couldn’t load your profile."
					description="Your account is still safe. Check your connection and try again."
					onRetry={() => {
						void refreshProfile().catch((error: unknown) => {
							console.error("Unable to retry loading the Outrazo profile.", error);
						});
					}}
				/>
			</main>
		);
	}
	if (loading || !session || !profile?.onboarding_completed) {
		return <BrandSplash />;
	}
	return <AppShell />;
}