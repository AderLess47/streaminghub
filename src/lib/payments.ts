import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { get, nowIso, run } from "./db";
import { freeDeviceLimit, revokeDevicesOverLimit } from "./device-access";
import { env, isBillingConfigured } from "./env";
import {
  paymentFailedMail,
  paymentFailedSupportNotice,
  paymentRecoveredMail,
  purchaseConfirmationMail,
  sendMail,
  storeSubscriptionEndedMail,
  storeSubscriptionRefundedMail,
  subscriptionEndedMail,
} from "./mail";
import {
  billingIntervalOf,
  cents,
  PREMIUM_PLAN_ID,
  PREMIUM_PRICE_EUR,
} from "./pricing";

// Weiterhin von hier exportiert, damit bestehende Importe unverändert bleiben.
export { PREMIUM_PLAN_ID, PREMIUM_PRICE_EUR };
const STRIPE_TIMEOUT_MS = 10_000;

export type CheckoutOutcome =
  | { ok: true; url: string; sessionId: string }
  | {
      ok: false;
      code: "not_configured" | "already_active" | "unsupported_channel" | "provider_error";
      message: string;
    };

export type SubscriptionStatus =
  | "none"
  | "pending"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

export type Subscription = {
  id: string;
  user_id: string;
  status: SubscriptionStatus;
  channel: "web" | "amazon" | "apple";
  provider: string;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: number;
  updated_at: string;
  // Seit dem Abo-Modell zusätzlich vorhanden (per Migration ergänzt). Der
  // Status bleibt die Laufzeit-Wahrheit; diese Felder beschreiben Tarif,
  // Abrechnung und Trial.
  plan?: string;
  billing_interval?: string | null;
  provider_price_id?: string | null;
  price_cents?: number | null;
  started_at?: string | null;
  canceled_at?: string | null;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  trial_source?: string | null;
  trial_used_at?: string | null;
  trial_converted_at?: string | null;
  trial_reminder_sent_at?: string | null;
  trial_ended_at?: string | null;
  /** Rabatt, der beim Checkout oder für die Kündigungs-Rettung hinterlegt wurde. */
  coupon_id?: string | null;
  retention_outcome?: "accepted" | "declined" | null;
  retention_decided_at?: string | null;
};

type StripeSubscriptionObject = {
  id?: string;
  status?: string;
  customer?: unknown;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string>;
  items?: { data?: { price?: { id?: string; unit_amount?: number | null } }[] };
};

/**
 * Tarif und Abrechnung aus dem abgeschlossenen Preis. Unbekannte Preise (etwa
 * Alt-Abos mit dem frueheren Betrag) bleiben unbenannt, damit dort nichts
 * umgeschrieben wird.
 */
function planPatch(priceId: string | undefined): { plan?: string; billingInterval?: "month" | "year" } {
  if (!priceId) return {};
  if (env.billing.stripeAnnualPriceId && priceId === env.billing.stripeAnnualPriceId) {
    return { plan: "standard_annual", billingInterval: "year" };
  }
  if (priceId === env.billing.stripePriceId) {
    return { plan: "standard_monthly", billingInterval: "month" };
  }
  return {};
}

export function getSubscription(userId: string): Subscription | null {
  return (
    get<Subscription>(`SELECT * FROM subscriptions WHERE user_id = ?`, userId) ?? null
  );
}

export function ensureSubscription(userId: string): Subscription {
  const existing = getSubscription(userId);
  if (existing) return existing;
  const id = randomUUID();
  const now = nowIso();
  run(
    `INSERT INTO subscriptions (id, user_id, plan, status, channel, provider, updated_at, created_at)
     VALUES (?, ?, 'premium', 'none', 'web', 'none', ?, ?)`,
    id,
    userId,
    now,
    now,
  );
  return getSubscription(userId)!;
}

export function effectiveStatus(subscription: Subscription | null): SubscriptionStatus {
  if (!subscription) return "none";
  if (subscription.status === "active" && subscription.current_period_end) {
    const end = new Date(subscription.current_period_end).getTime();
    if (Number.isFinite(end) && end < Date.now()) return "canceled";
  }
  return subscription.status;
}

export const billingConfigured = isBillingConfigured;

/* ------------------------------- stripe api ------------------------------- */

async function stripeRequest(path: string, init: RequestInit = {}) {
  return fetch(`${env.billing.stripeApiBase}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.billing.stripeSecretKey}`,
      "user-agent": "StreamingHub/1.0",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(Number(env.billing.stripeTimeoutMs ?? STRIPE_TIMEOUT_MS)),
  });
}

function idOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
}

function isoFromSeconds(seconds: number | undefined | null) {
  if (!seconds || !Number.isFinite(seconds)) return undefined;
  return new Date(seconds * 1000).toISOString();
}

function mapStripeStatus(status: string | undefined): SubscriptionStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "canceled";
    case "incomplete":
      return "incomplete";
    default:
      return "pending";
  }
}

function patchSubscription(
  userId: string,
  patch: {
    status?: SubscriptionStatus;
    customerId?: string | null;
    subscriptionId?: string | null;
    periodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
    /** Betrag des abgeschlossenen Preises in Cent, damit die Anzeige stimmt. */
    priceCents?: number | null;
    priceId?: string | null;
    /** Tarif und Abrechnung, abgeleitet aus dem abgeschlossenen Preis. */
    plan?: string | null;
    billingInterval?: "month" | "year" | null;
  },
) {
  const current = ensureSubscription(userId);
  run(
    `UPDATE subscriptions SET status = ?, provider = 'stripe', channel = 'web',
       provider_customer_id = ?, provider_subscription_id = ?, current_period_end = ?,
       cancel_at_period_end = ?, price_cents = ?, provider_price_id = ?, plan = ?, billing_interval = ?, updated_at = ?
     WHERE user_id = ?`,
    patch.status ?? current.status,
    patch.customerId === undefined ? current.provider_customer_id : patch.customerId,
    patch.subscriptionId === undefined ? current.provider_subscription_id : patch.subscriptionId,
    patch.periodEnd === undefined ? current.current_period_end : patch.periodEnd,
    patch.cancelAtPeriodEnd === undefined
      ? current.cancel_at_period_end
      : patch.cancelAtPeriodEnd
        ? 1
        : 0,
    patch.priceCents === undefined ? (current.price_cents ?? null) : patch.priceCents,
    patch.priceId === undefined ? (current.provider_price_id ?? null) : patch.priceId,
    patch.plan === undefined ? (current.plan ?? "premium") : (patch.plan ?? "premium"),
    patch.billingInterval === undefined
      ? (current.billing_interval ?? null)
      : patch.billingInterval,
    nowIso(),
    userId,
  );
}

async function fetchSubscription(subscriptionId: string) {
  try {
    const response = await stripeRequest(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
    if (!response.ok) return null;
    return (await response.json()) as StripeSubscriptionObject;
  } catch {
    return null;
  }
}

/**
 * Creates a Stripe-hosted subscription checkout session for the web
 * (sideload) distribution channel.
 *
 * Amazon Appstore builds must not link to external checkout – those
 * subscriptions are handled by Amazon In-App Purchasing and are recorded via
 * the admin/provider sync instead (channel = 'amazon').
 */
export async function createWebCheckout(params: {
  userId: string;
  email: string;
  locale: string;
  /** Optionaler Stripe-Coupon (z. B. Umwandlung nach dem Testzeitraum). */
  couponId?: string | null;
  /** Abrechnung; ohne Angabe monatlich, damit bestehende Aufrufer gleich bleiben. */
  interval?: "month" | "year";
}): Promise<CheckoutOutcome> {
  const subscription = ensureSubscription(params.userId);
  const status = effectiveStatus(subscription);
  if (status === "active") {
    return {
      ok: false,
      code: "already_active",
      message: "Für dieses Konto ist bereits ein aktives Premium-Abonnement hinterlegt.",
    };
  }
  if (!billingConfigured()) {
    return {
      ok: false,
      code: "not_configured",
      message:
        "Die Zahlungsabwicklung ist noch nicht mit einem Zahlungsanbieter verbunden. Es wurde keine Zahlung ausgelöst.",
    };
  }

  const interval = params.interval === "year" ? "year" : "month";
  const priceId = interval === "year" ? env.billing.stripeAnnualPriceId : env.billing.stripePriceId;
  if (!priceId) {
    return {
      ok: false,
      code: "not_configured",
      message: "Der Jahresabschluss ist derzeit nicht verfügbar.",
    };
  }

  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    customer_email: params.email,
    client_reference_id: params.userId,
    "metadata[userId]": params.userId,
    "subscription_data[metadata][userId]": params.userId,
    "subscription_data[metadata][interval]": interval,
    locale: stripeLocale(params.locale),
    success_url: `${env.appUrl}/dashboard/subscription?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.appUrl}/premium?checkout=canceled`,
    allow_promotion_codes: "false",
  });
  if (params.couponId) {
    // Rabatte kommen ausschließlich von hier: kein frei eintippbarer Code im
    // Checkout, und der Betrag wird erst nach serverseitiger Prüfung gesetzt.
    body.set("discounts[0][coupon]", params.couponId);
    body.set("metadata[coupon]", params.couponId);
  }

  try {
    const response = await stripeRequest("/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": `checkout-${params.userId}-${Math.floor(Date.now() / 60_000)}`,
      },
      // Stripe replaces the literal placeholder; keep its braces unescaped.
      body: body.toString().replace(/%7BCHECKOUT_SESSION_ID%7D/g, "{CHECKOUT_SESSION_ID}"),
    });
    const payload = (await response.json()) as {
      id?: string;
      url?: string;
      error?: { message?: string };
    };
    if (!response.ok || !payload.url || !payload.id) {
      console.error("stripe checkout error", response.status, payload.error?.message);
      return {
        ok: false,
        code: "provider_error",
        message: "Der Zahlungsdienstleister hat die Sitzung nicht erstellt. Bitte später erneut versuchen.",
      };
    }

    run(
      `UPDATE subscriptions
       SET status = 'pending', provider = 'stripe', channel = 'web',
           coupon_id = COALESCE(?, coupon_id), updated_at = ?
       WHERE user_id = ?`,
      params.couponId ?? null,
      nowIso(),
      params.userId,
    );
    return { ok: true, url: payload.url, sessionId: payload.id };
  } catch (error) {
    console.error("stripe checkout failed", error);
    return {
      ok: false,
      code: "provider_error",
      message: "Der Zahlungsdienstleister ist derzeit nicht erreichbar.",
    };
  }
}

function stripeLocale(locale: string) {
  const supported = ["de", "en", "fr", "es", "it", "tr", "el", "ar"];
  return supported.includes(locale) ? locale : "auto";
}

/** Verifies the Stripe-Signature header (t=timestamp,v1=signature). */
export function verifyStripeSignature(payload: string, header: string | null, secret: string) {
  if (!header || !secret) return false;
  const parts = header.split(",").map((part) => part.trim());
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
    .filter(Boolean);
  if (!timestampPart || signatures.length === 0) return false;

  const timestamp = Number(timestampPart.slice(2));
  if (!Number.isFinite(timestamp)) return false;
  const toleranceSeconds = 300;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected);
  return signatures.some((signature) => {
    if (signature.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(signature), expectedBuffer);
  });
}

/* ------------------------------- webhooks -------------------------------- */

export type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

export async function applyStripeEvent(event: StripeEvent) {
  const inserted = run(
    `INSERT OR IGNORE INTO subscription_events (id, user_id, provider, event_type, provider_event_id, payload, created_at)
     VALUES (?, ?, 'stripe', ?, ?, ?, ?)`,
    randomUUID(),
    null,
    event.type,
    event.id,
    JSON.stringify(event.data.object).slice(0, 200_000),
    nowIso(),
  );
  if (inserted.changes === 0) return { handled: true, duplicate: true as const };

  const object = event.data.object;
  const metadata = (object.metadata as Record<string, string> | undefined) ?? {};
  const userId =
    metadata.userId ??
    (typeof object.client_reference_id === "string" ? object.client_reference_id : undefined) ??
    findUserByCustomerId(idOf(object.customer) ?? undefined);

  if (!userId) {
    // The event is stored for reconciliation but cannot be attributed yet.
    return { handled: false, reason: "no_user" as const, duplicate: false as const };
  }

  ensureSubscription(userId);
  let status: SubscriptionStatus | null = null;

  switch (event.type) {
    case "checkout.session.completed": {
      const sessionId = typeof object.id === "string" ? object.id : null;
      const subscriptionId = idOf(object.subscription);
      const customerId = idOf(object.customer);
      // Payment methods such as SEPA may complete later; the subscription event
      // is authoritative. Fetch it when possible so the UI is not stuck.
      const subscription = subscriptionId ? await fetchSubscription(subscriptionId) : null;
      status = subscription ? mapStripeStatus(subscription.status) : "pending";
      const periodEnd = isoFromSeconds(subscription?.current_period_end) ?? null;
      // Betrag und Preis-ID mitschreiben: Ein Abo behaelt den Preis, mit dem es
      // abgeschlossen wurde, auch wenn der Listenpreis spaeter steigt.
      const checkoutPrice = subscription?.items?.data?.[0]?.price;
      patchSubscription(userId, {
        status,
        customerId,
        subscriptionId,
        periodEnd: periodEnd ?? undefined,
        cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
        priceCents: typeof checkoutPrice?.unit_amount === "number" ? checkoutPrice.unit_amount : undefined,
        priceId: checkoutPrice?.id ?? undefined,
        ...planPatch(checkoutPrice?.id),
      });
      if (status === "active" && sessionId) {
        await sendPurchaseConfirmation({ userId, sessionId, subscriptionId, periodEnd });
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = object as StripeSubscriptionObject;
      status = mapStripeStatus(subscription.status);
      const price = subscription.items?.data?.[0]?.price;
      patchSubscription(userId, {
        status,
        customerId: idOf(subscription.customer),
        subscriptionId: subscription.id ?? null,
        periodEnd: isoFromSeconds(subscription.current_period_end) ?? undefined,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        priceCents: typeof price?.unit_amount === "number" ? price.unit_amount : undefined,
        priceId: price?.id ?? undefined,
        ...planPatch(price?.id),
      });
      // "unpaid" ist bei Stripe das Ende der Wiederholungen: Premium ist weg,
      // ohne dass je eine Kündigung erklärt wurde.
      if (subscription.status === "unpaid") {
        await mailSubscriptionEnded(
          userId,
          subscription.id ?? null,
          isoFromSeconds(subscription.current_period_end) ?? null,
        );
      }
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = object as StripeSubscriptionObject;
      // Nur ein Abo, das zuletzt an einer offenen Zahlung hing, verdient die
      // Abschlussmail; eine normale Kündigung hat ihre Bestätigung schon.
      const previousSub = getSubscription(userId);
      const previous = effectiveStatus(previousSub);
      status = "canceled";
      patchSubscription(userId, {
        status,
        customerId: idOf(subscription.customer),
        subscriptionId: subscription.id ?? null,
        cancelAtPeriodEnd: false,
      });
      if (previous === "past_due") {
        await mailSubscriptionEnded(
          userId,
          subscription.id ?? null,
          previousSub?.current_period_end ?? null,
        );
      }
      break;
    }
    case "invoice.paid": {
      const lines = object.lines as
        | { data?: { period?: { end?: number } }[] }
        | undefined;
      // Nur eine Nachzahlung verdient eine Bestätigung; die monatliche
      // Verlängerung läuft ohne Mail weiter.
      const wasPastDue = effectiveStatus(getSubscription(userId)) === "past_due";
      status = "active";
      patchSubscription(userId, {
        status,
        customerId: idOf(object.customer),
        periodEnd: isoFromSeconds(lines?.data?.[0]?.period?.end) ?? undefined,
        cancelAtPeriodEnd: false,
      });
      if (wasPastDue) {
        const user = userContact(userId);
        if (user) {
          await sendMail({
            to: user.email,
            ...paymentRecoveredMail({ name: user.display_name, locale: user.locale }),
            kind: "subscription",
          });
        }
      }
      break;
    }
    case "invoice.payment_failed": {
      status = "past_due";
      patchSubscription(userId, {
        status,
        customerId: idOf(object.customer),
      });
      const attemptCount = typeof object.attempt_count === "number" ? object.attempt_count : 1;
      const user = userContact(userId);
      // Nur der erste Fehlversuch informiert den Kunden; die Wiederholungen
      // innerhalb desselben Zahlungsplans wären dieselbe Nachricht.
      if (user && attemptCount <= 1) {
        await sendMail({
          to: user.email,
          ...paymentFailedMail({ name: user.display_name, locale: user.locale }),
          kind: "subscription",
        });
      }
      // Erst der zweite Fehlversuch verdient eine interne Meldung; jede
      // weitere Wiederholung würde den Support nur erneut zum selben Fall
      // anschreiben.
      if (user && attemptCount === 2) {
        const nextAttempt =
          typeof object.next_payment_attempt === "number"
            ? new Date(object.next_payment_attempt * 1000).toLocaleDateString("de-DE", {
                timeZone: "Europe/Berlin",
                dateStyle: "long",
              })
            : null;
        await sendMail({
          to: env.supportEmail,
          ...paymentFailedSupportNotice({
            name: user.display_name,
            email: user.email,
            customerId: idOf(object.customer),
            attemptCount,
            nextAttemptAt: nextAttempt,
          }),
          kind: "system",
        });
      }
      break;
    }
    default:
      return { handled: false, reason: "ignored" as const, duplicate: false as const };
  }

  run(`UPDATE subscription_events SET user_id = ? WHERE provider_event_id = ?`, userId, event.id);
  return { handled: true, duplicate: false as const, status };
}

/** Markiert eine bereits verschickte Mail, damit spätere Ereignisse sie nicht wiederholen. */
function claimMailMarker(userId: string, key: string) {
  const result = run(
    `INSERT OR IGNORE INTO subscription_events
       (id, user_id, provider, event_type, provider_event_id, payload, created_at)
     VALUES (?, ?, 'stripe', 'mail.sent', ?, '{}', ?)`,
    randomUUID(),
    userId,
    key,
    nowIso(),
  );
  return Number(result.changes ?? 0) > 0;
}

/**
 * Abschlussmail für ein Store-Abo. Wird von den Apple- und Amazon-Pfaden nach
 * dem Statuswechsel gerufen; die Markierung verhindert Doppelmails, wenn
 * Notification und Pull-Refresh denselben Ablauf feststellen. Der Zeitraum
 * gehört zum Schlüssel: Nach einem Wiederkauf endet derselbe Beleg später
 * erneut, und dann soll es wieder eine Mail geben.
 */
export async function notifyStoreSubscriptionEnded(input: {
  userId: string;
  store: "apple" | "amazon";
  subscriptionKey: string;
  periodEnd?: string | null;
  reason?: "ended" | "refunded";
  /**
   * Zeitraum, für den eine Erstattung auch die spätere Ablaufmail abdeckt.
   * Apple kann nach einer Erstattung noch eine EXPIRED-Meldung für dieselbe
   * Periode schicken; der Kunde soll dann nicht zwei Nachrichten bekommen.
   */
  coversPeriodEnd?: string | null;
}) {
  const user = userContact(input.userId);
  if (!user) return false;
  const reason = input.reason ?? "ended";
  const key = `mail:store-subscription-${reason}:${input.subscriptionKey}:${input.periodEnd ?? "unknown"}`;
  if (!claimMailMarker(input.userId, key)) return false;
  if (reason === "refunded" && input.coversPeriodEnd) {
    claimMailMarker(
      input.userId,
      `mail:store-subscription-ended:${input.subscriptionKey}:${input.coversPeriodEnd}`,
    );
  }
  // Wie beim Trial-Ablauf: Nach dem Ende gilt das kostenlose Limit, die
  // zuletzt genutzten Geräte bleiben. Der Marker oben fängt Doppelläufe ab,
  // deshalb passiert die Abmeldung je Ablauf nur einmal.
  const deviceLimit = freeDeviceLimit();
  const devicesRevoked = revokeDevicesOverLimit(input.userId, nowIso(), deviceLimit);
  const template =
    reason === "refunded"
      ? storeSubscriptionRefundedMail({
          name: user.display_name,
          locale: user.locale,
          store: input.store,
          deviceLimit,
          devicesRevoked,
        })
      : storeSubscriptionEndedMail({
          name: user.display_name,
          locale: user.locale,
          store: input.store,
          deviceLimit,
          devicesRevoked,
        });
  await sendMail({ to: user.email, ...template, kind: "subscription" });
  return true;
}

/**
 * Erzeugt die Kaufbestätigung genau einmal pro Checkout. Der Marker liegt in
 * subscription_events und schützt sowohl gegen Stripe-Retries als auch gegen
 * das Zusammentreffen von Webhook und serverseitiger Success-Bestätigung.
 */
async function sendPurchaseConfirmation(params: {
  userId: string;
  sessionId: string;
  subscriptionId: string | null;
  periodEnd: string | null;
}) {
  const user = userContact(params.userId);
  if (!user) return;
  const key = `mail:purchase-confirmation:${params.subscriptionId ?? params.sessionId}`;
  if (!claimMailMarker(params.userId, key)) return;
  // Betrag und Intervall stammen aus dem Abo, das der Webhook gerade
  // geschrieben hat – ein Jahresabo darf nicht als Monatspreis in der
  // Bestätigung stehen.
  const subscription = getSubscription(params.userId);
  const priceCents = subscription?.price_cents ?? cents(PREMIUM_PRICE_EUR);
  const interval =
    billingIntervalOf(subscription?.plan, subscription?.billing_interval) ?? "month";
  await sendMail({
    to: user.email,
    ...purchaseConfirmationMail({
      name: user.display_name,
      locale: user.locale,
      priceEur: priceCents / 100,
      interval,
      periodEnd: params.periodEnd,
    }),
    kind: "subscription",
  });
}

async function mailSubscriptionEnded(
  userId: string,
  subscriptionId: string | null,
  periodEnd: string | null,
) {
  const user = userContact(userId);
  if (!user) return;
  // Der Zeitraum gehört zum Schlüssel: Wird dasselbe Abo nach einer Zahlung
  // wieder aktiv und läuft später erneut aus, soll es wieder eine Mail geben.
  const key = `mail:subscription-ended:${subscriptionId ?? userId}:${periodEnd ?? "unknown"}`;
  if (!claimMailMarker(userId, key)) return;
  const deviceLimit = freeDeviceLimit();
  const devicesRevoked = revokeDevicesOverLimit(userId, nowIso(), deviceLimit);
  await sendMail({
    to: user.email,
    ...subscriptionEndedMail({
      name: user.display_name,
      locale: user.locale,
      deviceLimit,
      devicesRevoked,
    }),
    kind: "subscription",
  });
}

function userContact(userId: string) {
  return get<{ email: string; display_name: string; locale: string }>(
    `SELECT email, display_name, locale FROM users WHERE id = ?`,
    userId,
  );
}

function findUserByCustomerId(customerId: string | undefined) {
  if (!customerId) return undefined;
  return get<{ user_id: string }>(
    `SELECT user_id FROM subscriptions WHERE provider_customer_id = ?`,
    customerId,
  )?.user_id;
}

/* -------------------------- checkout reconciliation ---------------------- */

export type ReconcileOutcome =
  | { ok: true; status: SubscriptionStatus }
  | {
      ok: false;
      code: "not_configured" | "not_found" | "forbidden" | "not_complete" | "provider_error";
      message: string;
    };

/**
 * Server-side confirmation for the success redirect. The session is fetched
 * from Stripe (never trusted from the browser) and must belong to the signed-in
 * user. State is only advanced when Stripe reports the session as complete.
 */
export async function reconcileCheckoutSession(
  sessionId: string,
  userId: string,
): Promise<ReconcileOutcome> {
  if (!billingConfigured()) {
    return {
      ok: false,
      code: "not_configured",
      message: "Die Zahlungsabwicklung ist nicht konfiguriert.",
    };
  }

  let response: Response;
  try {
    response = await stripeRequest(
      `/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`,
    );
  } catch {
    return {
      ok: false,
      code: "provider_error",
      message: "Der Zahlungsanbieter ist derzeit nicht erreichbar.",
    };
  }

  if (response.status === 404) {
    return { ok: false, code: "not_found", message: "Die Checkout-Sitzung wurde nicht gefunden." };
  }
  if (!response.ok) {
    return {
      ok: false,
      code: "provider_error",
      message: "Die Zahlung konnte nicht geprüft werden.",
    };
  }

  const session = (await response.json()) as {
    id?: string;
    status?: string;
    payment_status?: string;
    customer?: unknown;
    subscription?: unknown;
    metadata?: Record<string, string>;
    client_reference_id?: string;
  };

  const owner = session.metadata?.userId ?? session.client_reference_id;
  if (owner !== userId) {
    return { ok: false, code: "forbidden", message: "Diese Sitzung gehört zu einem anderen Konto." };
  }
  if (session.status !== "complete") {
    return {
      ok: false,
      code: "not_complete",
      message: "Die Zahlung ist noch nicht abgeschlossen. Der Status wird automatisch aktualisiert.",
    };
  }

  const subscriptionValue = session.subscription;
  const subscription =
    typeof subscriptionValue === "string"
      ? await fetchSubscription(subscriptionValue)
      : ((subscriptionValue as StripeSubscriptionObject | null) ?? null);
  const subscriptionId =
    typeof subscriptionValue === "string" ? subscriptionValue : idOf(subscriptionValue);

  const status = subscription ? mapStripeStatus(subscription.status) : "pending";
  const periodEnd = isoFromSeconds(subscription?.current_period_end) ?? null;
  patchSubscription(userId, {
    status,
    customerId: idOf(session.customer),
    subscriptionId,
    periodEnd: periodEnd ?? undefined,
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
  });
  if (status === "active" && session.id) {
    await sendPurchaseConfirmation({ userId, sessionId: session.id, subscriptionId, periodEnd });
  }

  return { ok: true, status };
}

/* ------------------------------- cancellation ---------------------------- */

export async function cancelSubscription(userId: string) {
  const subscription = getSubscription(userId);
  if (!subscription || effectiveStatus(subscription) !== "active") {
    return {
      ok: false as const,
      message: "Es ist kein aktives Abonnement vorhanden, das gekündigt werden könnte.",
    };
  }
  if (subscription.channel === "amazon") {
    return {
      ok: false as const,
      message:
        "Dieses Abonnement wurde über den Amazon Appstore abgeschlossen und wird dort verwaltet. Bitte kündige es in deinem Amazon-Konto.",
    };
  }
  if (subscription.channel === "apple") {
    return {
      ok: false as const,
      message:
        "Dieses Abonnement wurde über den App Store abgeschlossen und wird dort verwaltet. Bitte kündige es in deinen Apple-Konto-Einstellungen.",
    };
  }
  if (subscription.provider !== "stripe" || !subscription.provider_subscription_id) {
    return {
      ok: false as const,
      message: "Für dieses Abonnement ist kein aktiver Zahlungsanbieter hinterlegt. Bitte kontaktiere den Support.",
    };
  }

  try {
    const response = await stripeRequest(
      `/v1/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ cancel_at_period_end: "true" }),
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | StripeSubscriptionObject
      | null;
    if (!response.ok) {
      console.error("stripe cancel error", response.status);
      return {
        ok: false as const,
        message: "Die Kündigung konnte nicht übermittelt werden. Bitte kontaktiere den Support.",
      };
    }

    patchSubscription(userId, {
      status: payload?.status ? mapStripeStatus(payload.status) : undefined,
      cancelAtPeriodEnd: payload?.cancel_at_period_end ?? true,
      periodEnd: isoFromSeconds(payload?.current_period_end) ?? undefined,
    });
    return {
      ok: true as const,
      message: "Das Abonnement endet zum Ende des aktuellen Abrechnungszeitraums.",
    };
  } catch {
    return { ok: false as const, message: "Der Zahlungsanbieter ist derzeit nicht erreichbar." };
  }
}

/**
 * Legt einen Coupon auf ein laufendes Abo (Kündigungs-Rettung).
 *
 * Stripe ersetzt damit einen vorhandenen Rabatt, statt ihn zu stapeln – genau
 * das ist hier gewollt. Erst eine erfolgreiche Antwort wird gespeichert, damit
 * ein Fehlversuch wiederholt werden kann.
 */
export async function applySubscriptionCoupon(
  userId: string,
  couponId: string,
): Promise<{ ok: boolean; message?: string }> {
  const subscription = getSubscription(userId);
  if (!subscription || effectiveStatus(subscription) !== "active") {
    return { ok: false, message: "Es ist kein aktives Abonnement vorhanden." };
  }
  if (subscription.channel !== "web") {
    return {
      ok: false,
      message:
        "Dieses Abonnement wird über den Store verwaltet. Ein Rabatt lässt sich dort nicht setzen.",
    };
  }
  if (subscription.provider !== "stripe" || !subscription.provider_subscription_id) {
    return {
      ok: false,
      message: "Für dieses Abonnement ist kein aktiver Zahlungsanbieter hinterlegt.",
    };
  }

  try {
    const response = await stripeRequest(
      `/v1/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ coupon: couponId }),
      },
    );
    if (!response.ok) {
      console.error("stripe coupon error", response.status);
      return {
        ok: false,
        message: "Der Rabatt konnte nicht hinterlegt werden. Bitte versuche es später erneut.",
      };
    }

    run(`UPDATE subscriptions SET coupon_id = ?, updated_at = ? WHERE user_id = ?`, couponId, nowIso(), userId);
    return { ok: true };
  } catch {
    return { ok: false, message: "Der Zahlungsanbieter ist derzeit nicht erreichbar." };
  }
}
