import { createPrivateKey, randomUUID, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Testmaterial für die App-Store-Prüfung: signierte Transaktionen und
 * Notifications gegen die eigens erzeugte Kette in diesem Ordner.
 */
export const fixture = (name: string) => readFileSync(path.join(import.meta.dirname, name), "utf8");

export const rootPem = fixture("root.pem");
export const intermediatePem = fixture("intermediate.pem");
export const leafPem = fixture("leaf.pem");
export const leafKey = createPrivateKey(fixture("leaf.key.pem"));

export const b64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");

export const pemToDer = (pem: string) =>
  Buffer.from(
    pem
      .replace(/-----BEGIN CERTIFICATE-----/, "")
      .replace(/-----END CERTIFICATE-----/, "")
      .replace(/\s+/g, ""),
    "base64",
  );

export function buildJws(
  payload: Record<string, unknown>,
  options: { chain?: string[]; key?: ReturnType<typeof createPrivateKey> } = {},
): string {
  const chain = options.chain ?? [leafPem, intermediatePem];
  const header = {
    alg: "ES256",
    x5c: chain.map((pem) => pemToDer(pem).toString("base64")),
  };
  const headerPart = b64url(JSON.stringify(header));
  const payloadPart = b64url(JSON.stringify(payload));
  const signature = sign("sha256", Buffer.from(`${headerPart}.${payloadPart}`, "ascii"), {
    key: options.key ?? leafKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${headerPart}.${payloadPart}.${b64url(signature)}`;
}

export function appleTransactionPayload(overrides: Record<string, unknown> = {}, now = Date.now()) {
  return {
    transactionId: "2000000123456789",
    originalTransactionId: "1000000987654321",
    bundleId: "org.streaminghub.app",
    productId: "premium_monthly",
    type: "Auto-Renewable Subscription",
    environment: "Production",
    purchaseDate: now - 60_000,
    expiresDate: now + 30 * 86_400_000,
    inAppOwnershipType: "PURCHASED",
    ...overrides,
  };
}

/**
 * Baut ein `signedPayload` wie Apple es schickt: außen eine Notification-JWS,
 * darin eine signierte Transaktion (und optional die Verlängerungsinfo).
 */
export function buildNotification(options: {
  notificationType: string;
  notificationSubtype?: string;
  transaction?: Record<string, unknown>;
  renewalInfo?: Record<string, unknown>;
  bundleId?: string;
  environment?: string;
  data?: Record<string, unknown>;
  chain?: string[];
  outerChain?: string[];
  key?: ReturnType<typeof createPrivateKey>;
  now?: number;
  notificationUUID?: string;
}): string {
  const now = options.now ?? Date.now();
  const chain = options.chain;

  const data: Record<string, unknown> = {
    appAppleId: 1234567890,
    bundleId: options.bundleId ?? "org.streaminghub.app",
    bundleVersion: "1.0",
    environment: options.environment ?? "Production",
    signedTransactionInfo: buildJws(appleTransactionPayload(options.transaction, now), {
      chain,
      key: options.key,
    }),
    ...(options.renewalInfo
      ? {
          signedRenewalInfo: buildJws(options.renewalInfo, {
            chain,
            key: options.key,
          }),
        }
      : {}),
    ...options.data,
  };

  return buildJws(
    {
      notificationType: options.notificationType,
      notificationSubtype: options.notificationSubtype,
      // Jede Meldung hat bei Apple eine eigene ID; das ist auch unser Duplikat-Schutz.
      notificationUUID: options.notificationUUID ?? randomUUID(),
      notificationVersion: "2.0",
      version: "2.0",
      signedDate: now,
      data,
    },
    { chain: options.outerChain ?? chain, key: options.key },
  );
}
