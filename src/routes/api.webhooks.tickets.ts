import { createFileRoute } from "@tanstack/react-router";

// Provider webhook endpoint: POST /api/webhooks/tickets
// Thin by design — every decision lives in the testable handler module.
// No component: this route only answers machine POSTs from Bachs.
export const Route = createFileRoute("/api/webhooks/tickets")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { handleTicketWebhook } = await import("@/showcase/tickets/ticket-webhook.server");
        return handleTicketWebhook(request);
      },
    },
  },
});
