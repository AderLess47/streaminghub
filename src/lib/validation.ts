import { z } from "zod";

const email = z.string().trim().min(5).max(254).email("Bitte gib eine gültige E-Mail-Adresse ein.");

export const passwordSchema = z
  .string()
  .min(10, "Das Passwort muss mindestens 10 Zeichen lang sein.")
  .max(200, "Das Passwort ist zu lang.")
  .refine((value) => /[a-zA-Z]/.test(value) && /[0-9]/.test(value), {
    message: "Das Passwort muss Buchstaben und Zahlen enthalten.",
  });

export const registerSchema = z.object({
  email,
  password: passwordSchema,
  displayName: z.string().trim().min(2, "Bitte gib deinen Namen an.").max(80),
  locale: z.enum(["de", "en", "tr", "ar", "fr", "es", "it", "el"]).default("de"),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "Bitte akzeptiere die Nutzungsbedingungen." }) }),
  marketingOptIn: z.boolean().optional().default(false),
});

export const amazonPurchaseSchema = z.object({
  receiptId: z.string().trim().min(8, "receiptId fehlt.").max(200),
  appUserId: z.string().trim().min(3, "appUserId fehlt.").max(128),
  productId: z.string().trim().min(1, "productId fehlt.").max(120),
});

export const applePurchaseSchema = z.object({
  // StoreKit liefert ein kompaktes JWS; alles darunter ist kein Beleg.
  jws: z.string().trim().min(100, "Der Kaufbeleg fehlt.").max(20_000),
});

export const appleNotificationSchema = z.object({
  // App Store Server Notifications V2 schicken genau ein signiertes Feld.
  signedPayload: z.string().trim().min(100, "signedPayload fehlt.").max(20_000),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
  mfaCode: z.string().trim().max(20).optional(),
});

export const forgotPasswordSchema = z.object({ email });

export const checkoutConfirmSchema = z.object({
  sessionId: z
    .string()
    .trim()
    .min(3)
    .max(200)
    .regex(/^cs_[A-Za-z0-9_]+$/, "Ungültige Checkout-Sitzung."),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(500),
  password: passwordSchema,
});

export const activateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(6, "Bitte gib den vollständigen Kopplungscode ein.")
    .max(20)
    .regex(/^[A-Za-z0-9 -]+$/, "Der Kopplungscode enthält ungültige Zeichen."),
  deviceName: z.string().trim().max(60).optional(),
});

export const m3uPlaylistSchema = z.object({
  deviceId: z.string().trim().min(1, "Bitte wähle ein Gerät aus."),
  url: z
    .string()
    .trim()
    .min(8, "Bitte gib eine M3U-URL ein.")
    .max(4096, "Die M3U-URL ist zu lang.")
    .refine((value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    }, "Bitte gib eine gültige HTTP(S)-M3U-URL ein."),
});

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Bitte gib deinen Namen an.").max(80),
  email,
  subject: z.string().trim().min(3, "Bitte gib einen Betreff an.").max(120),
  message: z.string().trim().min(20, "Bitte beschreibe dein Anliegen mit mindestens 20 Zeichen.").max(4000),
  privacyAccepted: z.literal(true, {
    errorMap: () => ({ message: "Bitte bestätige die Datenschutzhinweise." }),
  }),
  /** Honeypot: must stay empty (bots fill it). */
  website: z.string().max(0).optional().or(z.literal("")),
  /** Timestamp of form render – submissions faster than 3 s are rejected. */
  renderedAt: z.coerce.number().optional(),
});

/** Widerruf über die Website (§ 356a BGB). */
export const withdrawalSchema = z.object({
  name: z.string().trim().min(2, "Bitte gib deinen Namen an.").max(80),
  email,
  contract: z.enum(["web", "apple", "amazon", "other"], {
    errorMap: () => ({ message: "Bitte wähle den Vertrag aus." }),
  }),
  note: z.string().trim().max(1000).optional().default(""),
  privacyAccepted: z.literal(true, {
    errorMap: () => ({ message: "Bitte bestätige die Datenschutzhinweise." }),
  }),
  website: z.string().max(0).optional().or(z.literal("")),
  renderedAt: z.coerce.number().optional(),
});

/** Kündigung über die Schaltfläche „Jetzt kündigen“ (§ 312k BGB). */
export const cancellationSchema = z.object({
  email,
  website: z.string().max(0).optional().or(z.literal("")),
  renderedAt: z.coerce.number().optional(),
});

export const ticketSchema = z.object({
  subject: z.string().trim().min(3, "Bitte gib einen Betreff an.").max(120),
  category: z.enum(["installation", "playlist", "activation", "billing", "playback", "account", "other"]),
  message: z.string().trim().min(20, "Bitte beschreibe dein Anliegen genauer.").max(5000),
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Bitte gib einen Anzeigenamen mit mindestens 2 Zeichen an.").max(80),
  locale: z.enum(["de", "en", "tr", "ar", "fr", "es", "it", "el"]),
  marketingOptIn: z.boolean().optional().default(false),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Bitte gib dein aktuelles Passwort ein."),
  newPassword: passwordSchema,
});

export const pairingRequestSchema = z.object({
  deviceName: z.string().trim().min(1).max(60),
  platform: z.enum(["firetv", "androidtv", "android", "ios", "web"]),
  appVersion: z.string().trim().max(30).optional(),
});

export const mfaVerifySchema = z.object({
  code: z.string().trim().min(6).max(20),
});

export const dataRequestSchema = z.object({
  kind: z.enum(["export", "deletion"]),
  confirm: z.literal(true, {
    errorMap: () => ({ message: "Bitte bestätige die Anfrage." }),
  }),
  password: z.string().min(1, "Bitte bestätige dein Passwort."),
});
