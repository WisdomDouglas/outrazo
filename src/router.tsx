import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { ErrorState } from "./design-system/components/ErrorState";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: ({ reset }) => (
      <main className="grid min-h-screen place-items-center bg-canvas px-md">
        <ErrorState onRetry={reset} />
      </main>
    ),
  });

  return router;
};
