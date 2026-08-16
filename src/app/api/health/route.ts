import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

export async function GET() {
  const requestId = `req_${randomUUID()}`;
  const firebaseConfigured = Boolean(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY,
  );

  return Response.json(
    {
      status: firebaseConfigured ? "ok" : "degraded",
      checks: {
        app: "ok",
        firebaseAdmin: firebaseConfigured ? "configured" : "not_configured",
        localFiles: "browser_directory",
        hwpxTemplate: process.env.HWPX_TEMPLATE_PATH ? "configured" : "not_configured",
        geminiFreeClassification:
          process.env.GEMINI_API_KEY && process.env.GEMINI_FREE_TIER_ONLY === "true"
            ? "free_only_configured"
            : "not_configured",
      },
      requestId,
    },
    { status: firebaseConfigured ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
