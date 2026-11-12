/**
 * Amazon In-App Purchasing (Appstore SDK) receipt verification.
 *
 * Everything here is pure or takes its configuration as an argument, so the
 * receipt rules can be tested without Next.js, a database or network access.
 * Persistence lives in `amazon-subscriptions.ts`, the routes only wire it up.
 *
 * RVS endpoint (Amazon, `verifyReceiptId` operation version 1.0):
 *   {base}/version/1.0/verifyReceiptId/developer/{sharedSecret}/user/{appUserId}/receiptId/{receiptId}
 * The shared secret is a path segment, so the request URL must never be logged.
 */

export type AmazonReceipt = {
  receiptId: string;
  productId: string;
  termSku: string | null;
  productType: string;
  autoRenewing: boolean;
  purchaseDate: number | null;
  renewalDate: number | null;
  cancelDate: number | null;
  gracePeriodEndDate: number | null;
  freeTrialEndDate: number | null;
  testTransaction: boolean;
  betaProduct: boolean;
};

export type AmazonErrorCode =
  | "invalid_receipt"
  | "canceled"
  | "invalid_product"
  | "test_receipt"
  | "provider_busy"
  | "misconfigured"
  | "provider_error";

export type AmazonVerifyResult =
  | { ok: true; receipt: AmazonReceipt }
  | { ok: false; code: AmazonErrorCode; retryAfterSeconds?: number };

export type SubscriptionState = {
  status: "active" | "canceled";
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  premiumActive: boolean;
};

export const AMAZON_ERROR_MESSAGES: Record<AmazonErrorCode, string> = {
  invalid_receipt: "Dieser Kaufbeleg konnte nicht geprüft werden.",
  canceled: "Dieses Abonnement ist nicht mehr aktiv.",
  invalid_product: "Der Kaufbeleg gehört nicht zum Premium-Abo.",
  test_receipt: "Testkäufe werden nur in der Amazon-Testumgebung akzeptiert.",
  provider_busy: "Amazon ist ausgelastet. Bitte versuche es gleich erneut.",
  misconfigured: "Die Amazon-Anbindung ist nicht korrekt konfiguriert.",
  provider_error: "Der Amazon-Dienst ist derzeit nicht erreichbar.",
};

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const iso = (ms: number) => new Date(ms).toISOString();

export function buildVerifyUrl(params: {
  baseUrl: string;
  sandbox: boolean;
  sharedSecret: string;
  appUserId: string;
  receiptId: string;
}): string {
  const base = params.baseUrl.replace(/\/+$/, "");
  const sandbox = params.sandbox ? "/sandbox" : "";
  return (
    `${base}${sandbox}/version/1.0/verifyReceiptId` +
    `/developer/${encodeURIComponent(params.sharedSecret)}` +
    `/user/${encodeURIComponent(params.appUserId)}` +
    `/receiptId/${encodeURIComponent(params.receiptId)}`
  );
}

/**
 * Maps an RVS response to either a usable receipt or a stable error code.
 * Status codes are from the RVS documentation: 400 unknown receipt, 410 no
 * longer valid, 429 throttled, 496/497 bad shared secret or user id.
 */
export function parseRvsResponse(
  status: number,
  body: unknown,
  options: { sandbox: boolean; expectedProductId: string },
): AmazonVerifyResult {
  if (status === 400) return { ok: false, code: "invalid_receipt" };
  if (status === 410) return { ok: false, code: "canceled" };
  if (status === 429) return { ok: false, code: "provider_busy", retryAfterSeconds: 60 };
  if (status === 496 || status === 497) return { ok: false, code: "misconfigured" };
  if (status !== 200) return { ok: false, code: "provider_error" };

  const payload = (body ?? {}) as Record<string, unknown>;
  const receipt: AmazonReceipt = {
    receiptId: asString(payload.receiptId) ?? "",
    productId: asString(payload.productId) ?? "",
    termSku: asString(payload.termSku),
    productType: asString(payload.productType) ?? "",
    autoRenewing: payload.autoRenewing === true,
    purchaseDate: asNumber(payload.purchaseDate),
    renewalDate: asNumber(payload.renewalDate),
    cancelDate: asNumber(payload.cancelDate),
    gracePeriodEndDate: asNumber(payload.gracePeriodEndDate),
    freeTrialEndDate: asNumber(payload.freeTrialEndDate),
    testTransaction: payload.testTransaction === true,
    betaProduct: payload.betaProduct === true,
  };

  if (!receipt.receiptId) return { ok: false, code: "invalid_receipt" };
  if (receipt.productType !== "SUBSCRIPTION") return { ok: false, code: "invalid_product" };
  if (receipt.productId !== options.expectedProductId) return { ok: false, code: "invalid_product" };
  // App Tester receipts must never grant a real entitlement.
  if (receipt.testTransaction && !options.sandbox) return { ok: false, code: "test_receipt" };

  return { ok: true, receipt };
}

/**
 * Subscription state for a verified receipt (see §4 of docs/IAP-AMAZON.md).
 * A grace period keeps premium active, because the customer paid and Amazon is
 * only retrying the charge.
 */
export function receiptState(receipt: AmazonReceipt, now = Date.now()): SubscriptionState {
  if (receipt.cancelDate !== null && receipt.cancelDate <= now) {
    return {
      status: "canceled",
      currentPeriodEnd: iso(receipt.cancelDate),
      cancelAtPeriodEnd: false,
      premiumActive: false,
    };
  }

  if (receipt.gracePeriodEndDate !== null && receipt.gracePeriodEndDate > now) {
    return {
      status: "active",
      currentPeriodEnd: iso(receipt.gracePeriodEndDate),
      cancelAtPeriodEnd: !receipt.autoRenewing,
      premiumActive: true,
    };
  }

  const dates = [receipt.renewalDate, receipt.freeTrialEndDate, receipt.cancelDate].filter(
    (value): value is number => value !== null,
  );
  const end = dates.length > 0 ? Math.max(...dates) : null;

  if (end !== null && end > now) {
    return {
      status: "active",
      currentPeriodEnd: iso(end),
      cancelAtPeriodEnd: !receipt.autoRenewing || receipt.cancelDate !== null,
      premiumActive: true,
    };
  }

  return {
    status: "canceled",
    currentPeriodEnd: end === null ? null : iso(end),
    cancelAtPeriodEnd: false,
    premiumActive: false,
  };
}

export type ExistingSubscription = {
  channel: string;
  status: string;
  providerCustomerId: string | null;
};

export type ApplicationDecision =
  | { ok: true }
  | { ok: false; code: "already_active_web" | "receipt_owned_by_other_account" };

/**
 * Deterministic conflict rule for a verified receipt. There is no silent merge
 * between the web and the Amazon channel: whoever already pays keeps the row
 * until support moves it.
 */
export function decideReceiptApplication(
  existing: ExistingSubscription | null,
  amazonUserId: string,
): ApplicationDecision {
  if (!existing) return { ok: true };

  if (existing.channel === "amazon") {
    if (existing.providerCustomerId && existing.providerCustomerId !== amazonUserId) {
      return { ok: false, code: "receipt_owned_by_other_account" };
    }
    return { ok: true };
  }

  if (existing.status === "active" || existing.status === "past_due") {
    return { ok: false, code: "already_active_web" };
  }

  return { ok: true };
}

/** A receipt verified moments ago is replayed instead of hitting RVS again. */
export function isReplayable(verifiedAt: string | null, now = Date.now(), windowMs = 10 * 60_000) {
  if (!verifiedAt) return false;
  const at = new Date(verifiedAt).getTime();
  if (!Number.isFinite(at)) return false;
  return now - at >= 0 && now - at < windowMs;
}

export type VerifyReceiptOptions = {
  baseUrl: string;
  sandbox: boolean;
  sharedSecret: string;
  appUserId: string;
  receiptId: string;
  expectedProductId: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Calls RVS. Retries once on throttling and server errors; never logs the URL
 * because it contains the shared secret.
 */
export async function verifyReceipt(options: VerifyReceiptOptions): Promise<AmazonVerifyResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const url = buildVerifyUrl(options);

  let lastStatus = 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await sleep(300);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      });
    } catch {
      return { ok: false, code: "provider_error" };
    }

    lastStatus = response.status;
    if (response.status === 429 || response.status >= 500) continue;

    const body = await response.json().catch(() => null);
    return parseRvsResponse(response.status, body, {
      sandbox: options.sandbox,
      expectedProductId: options.expectedProductId,
    });
  }

  if (lastStatus === 429) return { ok: false, code: "provider_busy", retryAfterSeconds: 60 };
  return { ok: false, code: "provider_error" };
}
