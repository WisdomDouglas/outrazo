import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell } from "@/showcase/app-shell/AppShell";
import { useAuth } from "@/showcase/auth/auth-context";
import { loadOnboardingRecord } from "@/showcase/onboarding-storage";
import { BrandSplash } from "@/showcase/BrandSplash";
import { ErrorState } from "@/design-system/components/ErrorState";

export const Route = createFileRoute("/app")({ component: ProtectedApp });

function ProtectedApp() {
	const navigate = useNavigate({ from: "/app" });
	const { loading, session, profile, profileError, refreshProfile } = useAuth();
	const [completedDemo, setCompletedDemo] = useState<boolean | null>(null);

	useEffect(() => {
		setCompletedDemo(Boolean(loadOnboardingRecord()));
	}, []);

	useEffect(() => {
		if (loading || completedDemo === null || profileError) return;
		if (!session && !completedDemo) void navigate({ to: "/login", replace: true });
		else if (session && !profile?.onboarding_completed) void navigate({ to: "/onboarding", replace: true });
	}, [completedDemo, loading, navigate, profile, profileError, session]);

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
	if (loading || completedDemo === null || (!session && !completedDemo) || (session && !profile?.onboarding_completed)) {
		return <BrandSplash />;
	}
	return <AppShell />;
}