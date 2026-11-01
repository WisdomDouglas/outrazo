import { createFileRoute } from "@tanstack/react-router";

// Provider webhook endpoint: POST /api/webhooks/promotions
// Thin by design — every decision lives in the testable handler module.
// No component: this route only answers machine POSTs from Bachs.
export const Route = createFileRoute("/api/webhooks/promotions")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { handleBachsWebhook } = await import(
          "@/showcase/promotions/bachs-webhook.server"
        );
        return handleBachsWebhook(request);
      },
    },
  },
});
