import { json } from "@/lib/api";
import { env, isBillingConfigured } from "@/lib/env";
import { applyStripeEvent, verifyStripeSignature } from "@/lib/payments";

export const runtime = "nodejs";

/**
 * Stripe webhook endpoint. Only events with a valid signature are processed and
 * subscription state is only ever changed here – never from the browser.
 */
export async function POST(request: Request) {
  if (!isBillingConfigured() || !env.billing.stripeWebhookSecret) {
    return json(
      { error: { code: "not_configured", message: "Zahlungsanbieter ist nicht konfiguriert." } },
      { status: 503 },
    );
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!verifyStripeSignature(payload, signature, env.billing.stripeWebhookSecret)) {
    return json({ error: { code: "invalid_signature", message: "Ungültige Signatur." } }, { status: 400 });
  }

  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return json({ error: { code: "invalid_request", message: "Ungültiger Body." } }, { status: 400 });
  }

  const result = await applyStripeEvent(event);
  return json({ received: true, ...result });
}
