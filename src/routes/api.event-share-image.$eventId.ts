import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/event-share-image/$eventId")({
  server: {
    handlers: {
      GET: async ({
        request,
        params,
      }: {
        request: Request;
        params: { eventId: string };
      }) => {
        const { handleEventSocialPreview } = await import(
          "@/showcase/event-social-preview.server"
        );
        return handleEventSocialPreview(request, params.eventId);
      },
    },
  },
});
