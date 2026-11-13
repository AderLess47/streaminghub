/**
 * Server-side environment configuration.
 * Everything sensitive is read from process.env on the server only – never imported
 * into a client component. Missing integrations are surfaced explicitly instead of
 * being simulated.
 */
import path from "node:path";
import { androidRelease } from "./android-release";

const bool = (value: string | undefined) => value === "1" || value?.toLowerCase() === "true";

export const env = {
  appUrl: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  isProduction: process.env.NODE_ENV === "production",
  databasePath:
    process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "streaminghub.db"),
  supportEmail: process.env.SUPPORT_EMAIL ?? "service@streaminghub.org",
  adminEmail: process.env.ADMIN_EMAIL ?? "",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  seedDemo: bool(process.env.SEED_DEMO),
  sessionDays: Number(process.env.SESSION_DAYS ?? 30),
  email: {
    /** Only the Resend-compatible HTTP contract is implemented. */
    provider: (process.env.EMAIL_PROVIDER ?? "resend").toLowerCase(),
    apiKey: process.env.EMAIL_API_KEY ?? process.env.RESEND_API_KEY ?? "",
    from: process.env.EMAIL_FROM ?? "StreamingHub <service@streaminghub.org>",
    replyTo: process.env.EMAIL_REPLY_TO ?? process.env.SUPPORT_EMAIL ?? "service@streaminghub.org",
    apiBase: (process.env.EMAIL_API_BASE ?? "https://api.resend.com").replace(/\/$/, ""),
    webhookSecret: process.env.EMAIL_WEBHOOK_SECRET ?? process.env.RESEND_WEBHOOK_SECRET ?? "",
    timeoutMs: Number(process.env.EMAIL_TIMEOUT_MS ?? 8000),
    /** Dev only: expose verification/reset links in the UI when no mail provider is set. */
    showDevHints: bool(process.env.SHOW_DEV_EMAIL_LINKS) && process.env.NODE_ENV !== "production",
  },
  billing: {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
    stripePriceId: process.env.STRIPE_PRICE_ID ?? "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    stripeApiBase: (process.env.STRIPE_API_BASE ?? "https://api.stripe.com").replace(/\/$/, ""),
    stripeTimeoutMs: Number(process.env.STRIPE_TIMEOUT_MS ?? 10000),
    amazonStoreUrl: process.env.AMAZON_STORE_URL ?? "",
    /** Amazon In-App Purchasing (Appstore SDK) receipt verification. */
    amazonRvsSharedSecret: process.env.AMAZON_RVS_SHARED_SECRET ?? "",
    amazonRvsBase: (process.env.AMAZON_RVS_BASE ?? "https://appstore-sdk.amazon.com").replace(
      /\/$/,
      "",
    ),
    amazonRvsSandbox: bool(process.env.AMAZON_RVS_SANDBOX),
    amazonIapSku: process.env.AMAZON_IAP_SKU ?? "premium_monthly",
    amazonRtnTopicArn: process.env.AMAZON_RTN_TOPIC_ARN ?? "",
    amazonSyncToken: process.env.AMAZON_SYNC_TOKEN ?? "",
    /**
     * Apple App Store (StoreKit 2). Der Server prueft die signierte Transaktion
     * gegen Apples Root CA G3; ohne Bundle-ID bleibt die Anbindung aus.
     */
    appleIapBundleId: process.env.APPLE_IAP_BUNDLE_ID ?? "",
    appleIapProductId: process.env.APPLE_IAP_PRODUCT_ID ?? "premium_monthly",
    appleIapAllowSandbox: bool(process.env.APPLE_IAP_ALLOW_SANDBOX),
  },
  downloads: {
    /**
     * Every platform downloads the same signed build through the stable /app.apk
     * endpoint, so these URLs come from the release metadata instead of separate
     * environment overrides.
     */
    fireTv: androidRelease.path,
    androidTv: androidRelease.path,
    androidMobile: androidRelease.path,
    amazonStore: process.env.AMAZON_STORE_URL ?? "",
  },
  contactTo: process.env.CONTACT_TO_EMAIL ?? "service@streaminghub.org",
} as const;

export const isEmailConfigured = () =>
  env.email.provider === "resend" && Boolean(env.email.apiKey && env.email.from);
export const isBillingConfigured = () =>
  Boolean(
    env.billing.stripeSecretKey &&
      env.billing.stripePriceId &&
      env.billing.stripeWebhookSecret,
  );
export const isAmazonIapConfigured = () =>
  Boolean(env.billing.amazonRvsSharedSecret && env.billing.amazonIapSku);
export const isAppleIapConfigured = () =>
  Boolean(env.billing.appleIapBundleId && env.billing.appleIapProductId);

/** Company / operator details. Placeholders are intentional until confirmed. */
const smallBusiness = bool(process.env.OPERATOR_SMALL_BUSINESS);
const operatorData = {
  legalName: process.env.OPERATOR_LEGAL_NAME ?? "[Betreiberfirma – noch zu bestätigen]",
  representative: process.env.OPERATOR_REPRESENTATIVE ?? "[Vertretungsberechtigte Person – noch zu bestätigen]",
  street: process.env.OPERATOR_STREET ?? "[Straße und Hausnummer – noch zu bestätigen]",
  postalCode: process.env.OPERATOR_POSTAL_CODE ?? "[PLZ]",
  city: process.env.OPERATOR_CITY ?? "[Ort]",
  country: process.env.OPERATOR_COUNTRY ?? "Deutschland",
  email: process.env.OPERATOR_EMAIL ?? "service@streaminghub.org",
  phone: process.env.OPERATOR_PHONE ?? "[Telefonnummer – noch zu bestätigen]",
  vatId: smallBusiness ? "" : (process.env.OPERATOR_VAT_ID ?? "[USt-IdNr. – noch zu bestätigen]"),
  registerCourt: process.env.OPERATOR_REGISTER_COURT ?? "",
  registerNumber: process.env.OPERATOR_REGISTER_NUMBER ?? "",
};

export const operator = {
  ...operatorData,
  smallBusiness,
  hasRegister: Boolean(operatorData.registerCourt || operatorData.registerNumber),
  hasPlaceholders: Object.values(operatorData).some((value) => /\[[^\]]+\]/.test(value)),
  placeholderNotice:
    "Die mit [ ] gekennzeichneten Angaben sind Platzhalter und müssen vor der Veröffentlichung durch die tatsächlichen Betreiberdaten ersetzt werden.",
} as const;
