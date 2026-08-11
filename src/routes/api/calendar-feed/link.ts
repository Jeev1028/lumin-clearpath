import { createFileRoute } from "@tanstack/react-router";

import { getPublicOrigin, requireUser } from "@/lib/api-auth";
import { createSignedState } from "@/lib/oauth-state";

export const Route = createFileRoute("/api/calendar-feed/link")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const origin = getPublicOrigin(request);
        const token = createSignedState({ userId: auth.userId });
        const httpsUrl = `${origin}/api/calendar-feed?token=${encodeURIComponent(token)}`;
        // webcal:// tells Apple's Calendar app (and many others) to open
        // this as a subscription directly, rather than downloading a file.
        const webcalUrl = httpsUrl.replace(/^https?:\/\//, "webcal://");

        return Response.json({ httpsUrl, webcalUrl });
      },
    },
  },
});
