/**
 * Server-side environment configuration.
 * Everything sensitive is read from process.env on the server only – never imported
 * into a client component. Missing integrations are surfaced explicitly instead of
 * being simulated.
 */
import path from "node:path";
import { androidRelease } from "@/content/release";

const downloadUrl = (value: string | undefined) =>
  value?.trim() || androidRelease.path;

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
  },
  downloads: {
    fireTv: downloadUrl(process.env.DOWNLOAD_FIRE_TV_URL),
    androidTv: downloadUrl(process.env.DOWNLOAD_ANDROID_TV_URL),
    androidMobile: downloadUrl(process.env.DOWNLOAD_ANDROID_MOBILE_URL),
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
