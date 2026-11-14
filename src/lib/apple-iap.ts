/**
 * App-Store-Prüfung für Premium-Abos (StoreKit 2).
 *
 * Die App bekommt von StoreKit eine signierte Transaktion (`jwsRepresentation`).
 * Der Server prüft hier die Signaturkette bis zu Apples Wurzelzertifikat und die
 * Ansprüche der Transaktion – erst danach wird Premium gesetzt. Die App kann
 * sich also nicht selbst freischalten, und ein abgefangener Beleg nützt nichts,
 * weil Signatur und Produkt geprüft werden.
 *
 * Dieselbe Prüfung trägt die App Store Server Notifications V2: Apple schickt
 * ein `signedPayload`, darin stecken eine zweite signierte Transaktion und die
 * Verlängerungsinfo. Beide JWS laufen durch `verifyAppleJws`, damit es nur einen
 * Ort für Kette, Signatur und Zertifikatslaufzeiten gibt.
 *
 * Alles in dieser Datei ist rein: Konfiguration kommt als Argument, die
 * Persistenz liegt in `apple-subscriptions.ts`. Dadurch lässt sich die Prüfung
 * ohne Netz, Datenbank oder Next.js testen (siehe `apple-iap.test.ts`).
 *
 * Format: JWS compact (ES256) mit `x5c`-Kette im Header. Die Signatur ist nach
 * JOSE als rohes r||s kodiert, deshalb `dsaEncoding: "ieee-p1363"`.
 */
import { X509Certificate, verify as verifySignature } from "node:crypto";

export type AppleTransaction = {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  productType: string;
  environment: string;
  purchaseDate: number;
  expiresDate: number | null;
  revocationDate: number | null;
  inAppOwnershipType: string | null;
  appAccountToken: string | null;
};

export type AppleRenewalInfo = {
  originalTransactionId: string | null;
  autoRenewProductId: string | null;
  autoRenewStatus: number | null;
  expirationIntent: number | null;
  gracePeriodExpiresDate: number | null;
};

export type AppleNotification = {
  notificationType: string;
  notificationSubtype: string | null;
  notificationUUID: string;
  version: string | null;
  environment: string;
  signedDate: number;
  transaction: AppleTransaction;
  renewalInfo: AppleRenewalInfo | null;
};

export type AppleErrorCode =
  | "malformed"
  | "bad_signature"
  | "untrusted_chain"
  | "expired_certificate"
  | "wrong_bundle"
  | "wrong_product"
  | "unsupported_type"
  | "sandbox_not_allowed"
  | "revoked"
  | "expired";

export type AppleVerifyResult =
  | { ok: true; transaction: AppleTransaction }
  | { ok: false; code: AppleErrorCode; message: string };

export type AppleNotificationResult =
  | { ok: true; notification: AppleNotification }
  | { ok: false; code: AppleErrorCode; message: string };

export type AppleSubscriptionState = {
  status: "active" | "expired" | "canceled";
  currentPeriodEnd: string | null;
  premiumActive: boolean;
};

export const APPLE_ERROR_MESSAGES: Record<AppleErrorCode, string> = {
  malformed: "Die Transaktion ist unvollständig oder kein gültiges JWS.",
  bad_signature: "Die Signatur der Transaktion ist ungültig.",
  untrusted_chain: "Die Signaturkette führt nicht zu einem vertrauenswürdigen Apple-Zertifikat.",
  expired_certificate: "Ein Zertifikat der Signaturkette ist nicht mehr gültig.",
  wrong_bundle: "Die Transaktion gehört nicht zu dieser App.",
  wrong_product: "Die Transaktion gehört nicht zum Premium-Abo.",
  unsupported_type: "Die Transaktion ist kein Abonnement.",
  sandbox_not_allowed: "Testkäufe werden in dieser Umgebung nicht akzeptiert.",
  revoked: "Dieses Abonnement wurde storniert oder erstattet.",
  expired: "Dieses Abonnement ist abgelaufen.",
};

const iso = (ms: number) => new Date(ms).toISOString();

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

type JwsHeader = {
  alg?: string;
  x5c?: unknown;
};

function decodeSegment(segment: string): Buffer | null {
  try {
    return Buffer.from(segment, "base64url");
  } catch {
    return null;
  }
}

function parseJson(value: Buffer | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value.toString("utf8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export type AppleJwsResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; code: AppleErrorCode; message: string };

/**
 * Prüft ein Apple-JWS (Transaktion oder Notification) gegen die übergebenen
 * Wurzelzertifikate und gibt die Nutzlast zurück.
 *
 * `trustedRoots` sind PEM-Zeichenketten; produktiv ist das Apples Root CA G3,
 * im Test eine eigens erzeugte Kette.
 */
export function verifyAppleJws(
  jws: string,
  options: { trustedRoots: string[]; now?: number },
): AppleJwsResult {
  const now = options.now ?? Date.now();
  const fail = (code: AppleErrorCode): AppleJwsResult => ({
    ok: false,
    code,
    message: APPLE_ERROR_MESSAGES[code],
  });

  const parts = jws.trim().split(".");
  if (parts.length !== 3) return fail("malformed");
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

  const header = parseJson(decodeSegment(headerPart)) as JwsHeader | null;
  if (!header || header.alg !== "ES256") return fail("malformed");

  const x5c = Array.isArray(header.x5c) ? header.x5c : [];
  if (x5c.length < 2 || !x5c.every((entry) => typeof entry === "string")) {
    return fail("untrusted_chain");
  }

  let chain: X509Certificate[];
  try {
    chain = (x5c as string[]).map((entry) => new X509Certificate(Buffer.from(entry, "base64")));
  } catch {
    return fail("untrusted_chain");
  }

  // 1. Kette: jedes Zertifikat muss vom nächsten ausgestellt und signiert sein.
  try {
    for (let index = 0; index < chain.length - 1; index += 1) {
      const current = chain[index]!;
      const issuer = chain[index + 1]!;
      if (!current.checkIssued(issuer)) return fail("untrusted_chain");
      if (!current.verify(issuer.publicKey)) return fail("untrusted_chain");
    }
  } catch {
    return fail("untrusted_chain");
  }

  // 2. Vertrauen: oberstes Zertifikat ist eine bekannte Wurzel – oder von ihr
  //    ausgestellt, falls Apple die Wurzel nicht in `x5c` mitliefert.
  const parsedRoots = options.trustedRoots.flatMap((pem) => {
    try {
      return [new X509Certificate(pem)];
    } catch {
      return [];
    }
  });
  if (parsedRoots.length === 0) return fail("untrusted_chain");

  const top = chain[chain.length - 1]!;
  const isKnownRoot = parsedRoots.some((root) => root.raw.equals(top.raw));
  if (!isKnownRoot) {
    const signedByKnownRoot = parsedRoots.some((root) => {
      try {
        return top.checkIssued(root) && top.verify(root.publicKey);
      } catch {
        return false;
      }
    });
    if (!signedByKnownRoot) return fail("untrusted_chain");
  }

  // 3. Gültigkeitszeiträume aller Zertifikate.
  for (const certificate of chain) {
    const from = Date.parse(certificate.validFrom);
    const to = Date.parse(certificate.validTo);
    if (!Number.isFinite(from) || !Number.isFinite(to) || now < from || now > to) {
      return fail("expired_certificate");
    }
  }

  // 4. Signatur über "header.payload" mit dem Blattzertifikat (ES256).
  const leaf = chain[0]!;
  const details = leaf.publicKey.asymmetricKeyDetails;
  if (leaf.publicKey.asymmetricKeyType !== "ec" || details?.namedCurve !== "prime256v1") {
    return fail("untrusted_chain");
  }

  const signature = decodeSegment(signaturePart);
  if (!signature) return fail("malformed");
  const signedData = Buffer.from(`${headerPart}.${payloadPart}`, "ascii");
  let signatureValid = false;
  try {
    signatureValid = verifySignature(
      "sha256",
      signedData,
      { key: leaf.publicKey, dsaEncoding: "ieee-p1363" },
      signature,
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) return fail("bad_signature");

  const payload = parseJson(decodeSegment(payloadPart));
  if (!payload) return fail("malformed");
  return { ok: true, payload };
}

/** Liest die Felder einer Transaktion; prüft nur, dass die Kennungen da sind. */
export function parseAppleTransaction(payload: Record<string, unknown>): AppleTransaction | null {
  const transaction: AppleTransaction = {
    transactionId: asString(payload.transactionId) ?? "",
    originalTransactionId: asString(payload.originalTransactionId) ?? "",
    bundleId: asString(payload.bundleId) ?? "",
    productId: asString(payload.productId) ?? "",
    productType: asString(payload.type) ?? "",
    environment: asString(payload.environment) ?? "",
    purchaseDate: asNumber(payload.purchaseDate) ?? 0,
    expiresDate: asNumber(payload.expiresDate),
    revocationDate: asNumber(payload.revocationDate),
    inAppOwnershipType: asString(payload.inAppOwnershipType),
    appAccountToken: asString(payload.appAccountToken),
  };

  if (!transaction.transactionId || !transaction.originalTransactionId || !transaction.productId) {
    return null;
  }
  return transaction;
}

/**
 * Prüft eine StoreKit-Transaktion gegen die übergebenen Wurzelzertifikate.
 *
 * `trustedRoots` sind PEM-Zeichenketten; produktiv ist das Apples Root CA G3,
 * im Test eine eigens erzeugte Kette.
 */
export function verifyAppleTransaction(options: {
  jws: string;
  bundleId: string;
  productId: string;
  trustedRoots: string[];
  allowSandbox: boolean;
  now?: number;
}): AppleVerifyResult {
  const now = options.now ?? Date.now();
  const fail = (code: AppleErrorCode): AppleVerifyResult => ({
    ok: false,
    code,
    message: APPLE_ERROR_MESSAGES[code],
  });

  const verified = verifyAppleJws(options.jws, { trustedRoots: options.trustedRoots, now });
  if (!verified.ok) return fail(verified.code);

  const transaction = parseAppleTransaction(verified.payload);
  if (!transaction) return fail("malformed");

  if (transaction.bundleId !== options.bundleId) return fail("wrong_bundle");
  if (transaction.productId !== options.productId) return fail("wrong_product");
  if (transaction.productType !== "Auto-Renewable Subscription") return fail("unsupported_type");
  if (transaction.environment === "Sandbox" && !options.allowSandbox) {
    return fail("sandbox_not_allowed");
  }
  if (transaction.revocationDate !== null && transaction.revocationDate <= now) {
    return fail("revoked");
  }
  if (transaction.expiresDate !== null && transaction.expiresDate <= now) {
    return fail("expired");
  }

  return { ok: true, transaction };
}

/**
 * Prüft ein `signedPayload` aus App Store Server Notifications V2.
 *
 * Anders als beim Kauf sind abgelaufene und erstattete Transaktionen hier
 * ausdrücklich gültige Nachrichten – genau das teilen sie ja mit. Geprüft
 * werden Signaturkette, Bundle, Produkt, Abo-Typ und die Sandbox-Freigabe.
 */
export function verifyAppleNotification(options: {
  signedPayload: string;
  bundleId: string;
  productId: string;
  trustedRoots: string[];
  allowSandbox: boolean;
  now?: number;
}): AppleNotificationResult {
  const now = options.now ?? Date.now();
  const fail = (code: AppleErrorCode): AppleNotificationResult => ({
    ok: false,
    code,
    message: APPLE_ERROR_MESSAGES[code],
  });

  const outer = verifyAppleJws(options.signedPayload, {
    trustedRoots: options.trustedRoots,
    now,
  });
  if (!outer.ok) return fail(outer.code);

  const payload = outer.payload;
  const data = asObject(payload.data);
  const notificationType = asString(payload.notificationType);
  const notificationUUID = asString(payload.notificationUUID);
  const signedTransactionInfo = data ? asString(data.signedTransactionInfo) : null;
  if (!notificationType || !notificationUUID || !data || !signedTransactionInfo) {
    return fail("malformed");
  }

  // Die Hülle nennt Bundle und Umgebung selbst; beide müssen zur Installation passen.
  const envelopeBundle = asString(data.bundleId);
  if (envelopeBundle && envelopeBundle !== options.bundleId) return fail("wrong_bundle");
  const environment = asString(data.environment) ?? asString(payload.environment) ?? "";
  if (environment === "Sandbox" && !options.allowSandbox) return fail("sandbox_not_allowed");

  const inner = verifyAppleJws(signedTransactionInfo, {
    trustedRoots: options.trustedRoots,
    now,
  });
  if (!inner.ok) return fail(inner.code);

  const transaction = parseAppleTransaction(inner.payload);
  if (!transaction) return fail("malformed");
  if (transaction.bundleId !== options.bundleId) return fail("wrong_bundle");
  if (transaction.productId !== options.productId) return fail("wrong_product");
  if (transaction.productType !== "Auto-Renewable Subscription") return fail("unsupported_type");
  if (transaction.environment === "Sandbox" && !options.allowSandbox) {
    return fail("sandbox_not_allowed");
  }

  // Die Verlängerungsinfo ist optional, aber wenn sie da ist, wird sie geprüft.
  let renewalInfo: AppleRenewalInfo | null = null;
  const signedRenewalInfo = asString(data.signedRenewalInfo);
  if (signedRenewalInfo) {
    const renewal = verifyAppleJws(signedRenewalInfo, {
      trustedRoots: options.trustedRoots,
      now,
    });
    if (!renewal.ok) return fail(renewal.code);
    const info = renewal.payload;
    renewalInfo = {
      originalTransactionId: asString(info.originalTransactionId),
      autoRenewProductId: asString(info.autoRenewProductId),
      autoRenewStatus: asNumber(info.autoRenewStatus),
      expirationIntent: asNumber(info.expirationIntent),
      gracePeriodExpiresDate: asNumber(info.gracePeriodExpiresDate),
    };
  }

  return {
    ok: true,
    notification: {
      notificationType,
      notificationSubtype: asString(payload.subtype),
      notificationUUID,
      version: asString(payload.version),
      environment,
      signedDate: asNumber(payload.signedDate) ?? 0,
      transaction,
      renewalInfo,
    },
  };
}

/**
 * Welche Meldungen den gespeicherten Zustand ändern.
 *
 * `DID_FAIL_TO_RENEW` (Zahlung wird erneut versucht) und
 * `DID_CHANGE_RENEWAL_STATUS` ändern nichts am laufenden Zeitraum; der Ablauf
 * wird weiterhin über `expiresDate` bzw. `EXPIRED` erkannt. Unbekannte Typen
 * werden ignoriert, damit neue Apple-Meldungen keinen Fehler auslösen – Apple
 * würde sonst tagelang erneut zustellen.
 */
export function notificationEffect(
  notification: AppleNotification,
):
  | { kind: "apply" }
  | { kind: "ignore"; reason: "no_state_change" | "unknown_type" } {
  switch (notification.notificationType) {
    case "SUBSCRIBED":
    case "DID_RENEW":
    case "OFFER_REDEEMED":
    case "RENEWAL_EXTENDED":
    case "REFUND":
    case "REFUND_REVERSED":
    case "REVOKE":
    case "EXPIRED":
    case "GRACE_PERIOD_EXPIRED":
    case "TEST":
      return { kind: "apply" };
    case "DID_CHANGE_RENEWAL_STATUS":
    case "DID_FAIL_TO_RENEW":
    case "CONSUMPTION_REQUEST":
    case "PRICE_INCREASE":
      return { kind: "ignore", reason: "no_state_change" };
    default:
      return { kind: "ignore", reason: "unknown_type" };
  }
}

/**
 * Zustand aus einer geprüften Transaktion. Eine Verlängerung kommt als neue
 * Transaktion mit neuer `transactionId`; `originalTransactionId` bleibt gleich
 * und trägt den Ablaufzeitpunkt.
 */
export function transactionState(
  transaction: AppleTransaction,
  now = Date.now(),
): AppleSubscriptionState {
  if (transaction.revocationDate !== null && transaction.revocationDate <= now) {
    return {
      status: "canceled",
      currentPeriodEnd: iso(transaction.revocationDate),
      premiumActive: false,
    };
  }

  if (transaction.expiresDate !== null && transaction.expiresDate > now) {
    return {
      status: "active",
      currentPeriodEnd: iso(transaction.expiresDate),
      premiumActive: true,
    };
  }

  return {
    status: "expired",
    currentPeriodEnd: transaction.expiresDate === null ? null : iso(transaction.expiresDate),
    premiumActive: false,
  };
}

export type ExistingSubscription = {
  channel: string;
  status: string;
  providerCustomerId: string | null;
};

export type AppleApplicationDecision =
  | { ok: true }
  | { ok: false; code: "already_active_other_channel" | "receipt_owned_by_other_account" };

/**
 * Konfliktregel wie beim Amazon-Weg: Es gibt keine stille Zusammenführung
 * zwischen Web-, Amazon- und App-Store-Abo. Wer schon zahlt, behält den Platz,
 * bis der Support umstellt.
 */
export function decideAppleApplication(
  existing: ExistingSubscription | null,
  originalTransactionId: string,
): AppleApplicationDecision {
  if (!existing) return { ok: true };

  if (existing.channel === "apple") {
    if (existing.providerCustomerId && existing.providerCustomerId !== originalTransactionId) {
      // Nach einem Lapse kann Apple fuer denselben Kunden eine neue
      // Original-Transaktion vergeben. Ein abgelaufenes Abo darf deshalb mit
      // der neuen ID weiterlaufen; ein aktives bleibt beim alten Beleg.
      if (existing.status === "active" || existing.status === "past_due") {
        return { ok: false, code: "receipt_owned_by_other_account" };
      }
      return { ok: true };
    }
    return { ok: true };
  }

  if (existing.status === "active" || existing.status === "past_due") {
    return { ok: false, code: "already_active_other_channel" };
  }

  return { ok: true };
}

/**
 * Ein erneuter Aufruf wird nur dann aus dem gespeicherten Beleg beantwortet,
 * wenn dieser noch aktiv ist und die eingehende Transaktion nicht weiter
 * reicht. Beim festgestellten Ablauf wird `verified_at` erneuert – ohne diese
 * Prüfung bekäme ein Kauf direkt danach den alten, abgelaufenen Status zurück.
 */
export function isReplayablePurchase(
  known: { status: string; renewal_date: string | null; verified_at: string | null },
  transaction: AppleTransaction,
  now = Date.now(),
) {
  if (known.status !== "active") return false;
  if (!isReplayable(known.verified_at, now)) return false;
  const storedEnd = known.renewal_date ? Date.parse(known.renewal_date) : Number.NaN;
  if (!Number.isFinite(storedEnd)) return true;
  return transaction.expiresDate !== null && transaction.expiresDate <= storedEnd;
}

/** Eine gerade geprüfte Transaktion wird nicht erneut geprüft. */
export function isReplayable(verifiedAt: string | null, now = Date.now(), windowMs = 10 * 60_000) {
  if (!verifiedAt) return false;
  const at = new Date(verifiedAt).getTime();
  if (!Number.isFinite(at)) return false;
  return now - at >= 0 && now - at < windowMs;
}
