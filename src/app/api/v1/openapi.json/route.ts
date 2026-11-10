import { json } from "@/lib/api";

/**
 * Machine-readable contract for the StreamingHub app integration.
 * Keep in sync with src/app/api/v1/** and docs/API.md.
 */
const spec = {
  openapi: "3.1.0",
  info: {
    title: "StreamingHub App API",
    version: "1.0.0",
    description:
      "Pairing and device endpoints used by the StreamingHub Fire TV / Android app. StreamingHub provides no content; an active paired device receives device activation status, account/subscription metadata and the optional admin-managed M3U source URL.",
  },
  servers: [{ url: "/", description: "Same origin as streaminghub.org" }],
  paths: {
    "/api/v1/pairing/request": {
      post: {
        summary: "Create a pairing request",
        description:
          "Called by the app to display a short-lived coupling code. The plaintext code is returned once; only its SHA-256 hash is stored. Rate limit: 15 requests per IP per hour.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["deviceName", "platform"],
                properties: {
                  deviceName: { type: "string", maxLength: 60, example: "Wohnzimmer TV" },
                  platform: { type: "string", enum: ["firetv", "androidtv", "android", "ios", "web"] },
                  appVersion: { type: "string", maxLength: 30, example: "1.4.0" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Pairing request created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    requestId: { type: "string" },
                    code: { type: "string", example: "AB12-CD34" },
                    pollToken: { type: "string" },
                    expiresAt: { type: "string", format: "date-time" },
                    expiresInSeconds: { type: "integer", example: 600 },
                    verificationUrl: { type: "string", example: "/activate" },
                    pollIntervalSeconds: { type: "integer", example: 3 },
                  },
                },
              },
            },
          },
          "429": { description: "Rate limited" },
        },
      },
    },
    "/api/v1/pairing/status": {
      get: {
        summary: "Poll pairing result",
        description: "Bearer pollToken from the pairing request. Returns pending, claimed (with device activation token) or expired.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "requestId", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Pairing status",
            content: {
              "application/json": {
                examples: {
                  pending: { value: { status: "pending", activationStatus: "inactive" } },
                  claimed: {
                    value: {
                      status: "claimed",
                      activationStatus: "active",
                      activationToken: "<signed token>",
                      device: { id: "dev_x", name: "Wohnzimmer TV", platform: "firetv" },
                    },
                  },
                },
              },
            },
          },
          "401": { description: "Missing or invalid poll token" },
        },
      },
    },
    "/api/v1/me": {
      get: {
        summary: "Account, device, subscription and managed playlist status",
        description:
          "Bearer activation token issued after successful pairing. Returns the optional customer-confirmed, admin-managed M3U source URL only to the selected active device (legacy account-wide rows remain readable by all active devices); playlist content remains on the device. Returns 403 once the device has been unlinked, which makes unlinking effective immediately.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Current activation status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    account: { type: "object" },
                    device: { type: "object" },
                    subscription: { type: "object" },
                    playlist: {
                      type: ["object", "null"],
                      properties: {
                        url: { type: "string", format: "uri" },
                        updatedAt: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
                example: {
                  account: { email: "kunde@example.com", displayName: "Kunde" },
                  device: { id: "dev_x", name: "Wohnzimmer TV", platform: "firetv", activationStatus: "active" },
                  subscription: { plan: "premium", status: "none", channel: "web", premiumActive: false },
                  playlist: {
                    url: "https://anbieter.example/playlist.m3u",
                    updatedAt: "2026-11-10T12:00:00.000Z",
                  },
                },
              },
            },
          },
          "403": { description: "Device unlinked" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
    },
  },
} as const;

export async function GET() {
  return json(spec, { headers: { "cache-control": "public, max-age=300" } });
}
