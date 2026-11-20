import { randomToken } from "./auth";
import { get, nowIso, run } from "./db";
import { DEFAULT_FREE_DEVICE_LIMIT } from "./entitlements";
import { env, isEmailConfigured } from "./env";

export type MailKind =
  | "verify_email"
  | "reset_password"
  | "contact_message"
  | "ticket_update"
  | "contract_request"
  | "subscription"
  | "system";

type QueuedMail = {
  to: string;
  subject: string;
  text: string;
  kind: MailKind;
};

export type DeliveryResult = {
  delivered: boolean;
  queued: boolean;
  id: string;
  reason: "email_not_configured" | "provider_error" | "network_error" | "suppressed" | null;
};

type OutboxRow = {
  id: string;
  to_email: string;
  subject: string;
  body_text: string;
  kind: string;
  status: string;
};

const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 350;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Transactional mail adapter (Resend-compatible HTTP API).
 *
 * Every message is written to `outbox_emails` first, so staff can see exactly
 * what was generated even when the provider fails. Status values:
 * queued -> sent | failed. Delivery events from the provider webhook refine
 * `provider_status` (delivered, bounced, ...). Nothing is ever reported as
 * delivered without a successful provider response.
 *
 * Configure with EMAIL_API_KEY + EMAIL_FROM (see docs/DEPLOYMENT.md).
 */

/* --------------------------------- sending -------------------------------- */

export async function sendMail(mail: QueuedMail): Promise<DeliveryResult> {
  const id = randomToken(9);
  run(
    `INSERT INTO outbox_emails (id, to_email, subject, body_text, kind, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'queued', ?)`,
    id,
    mail.to,
    mail.subject,
    mail.text,
    mail.kind,
    nowIso(),
  );

  if (!isEmailConfigured()) {
    return { delivered: false, queued: true, id, reason: "email_not_configured" };
  }

  return deliver(id);
}

/** Re-attempt delivery of an outbox entry (admin action). */
export async function resendMail(id: string): Promise<DeliveryResult> {
  const row = get<OutboxRow>(`SELECT id, status FROM outbox_emails WHERE id = ?`, id);
  if (!row) return { delivered: false, queued: false, id, reason: "provider_error" };
  if (!isEmailConfigured()) {
    return { delivered: false, queued: true, id, reason: "email_not_configured" };
  }

  run(`UPDATE outbox_emails SET status = 'queued', error = NULL WHERE id = ?`, id);
  return deliver(id);
}

async function deliver(id: string): Promise<DeliveryResult> {
  const row = get<OutboxRow>(
    `SELECT id, to_email, subject, body_text, kind, status FROM outbox_emails WHERE id = ?`,
    id,
  );
  if (!row) return { delivered: false, queued: false, id, reason: "provider_error" };
  if (row.status === "sent") return { delivered: true, queued: false, id, reason: null };

  const suppressed = get<{ reason: string }>(
    `SELECT reason FROM email_suppressions WHERE email = ?`,
    row.to_email.toLowerCase(),
  );
  if (suppressed) {
    run(
      `UPDATE outbox_emails
       SET status = 'suppressed', provider_status = 'suppressed', error = ?, last_attempt_at = ?
       WHERE id = ?`,
      `Adresse gesperrt (${suppressed.reason}) – kein Versand an Hard-Bounces oder Beschwerden.`,
      nowIso(),
      id,
    );
    return { delivered: false, queued: false, id, reason: "suppressed" };
  }

  const html = renderHtml(row.body_text);
  let lastError = "Unbekannter Fehler";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const attemptedAt = nowIso();
    run(
      `UPDATE outbox_emails SET attempts = attempts + 1, last_attempt_at = ? WHERE id = ?`,
      attemptedAt,
      id,
    );

    try {
      const response = await fetch(`${env.email.apiBase}/emails`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.email.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": id,
          "user-agent": "StreamingHub/1.0",
        },
        body: JSON.stringify({
          from: env.email.from,
          to: [row.to_email],
          subject: row.subject,
          text: row.body_text,
          html,
          reply_to: env.email.replyTo,
          tags: [{ name: "kind", value: row.kind }],
        }),
        signal: AbortSignal.timeout(env.email.timeoutMs),
      });

      const payload = await response.text();

      if (!response.ok) {
        lastError = `HTTP ${response.status}: ${payload.slice(0, 400)}`;
        // Retry only transient failures; a 4xx (except 429) will not improve.
        if (response.status !== 429 && response.status < 500) break;
      } else {
        let providerId: string | null = null;
        try {
          providerId = (JSON.parse(payload) as { id?: string }).id ?? null;
        } catch {
          /* provider accepted the mail but returned no JSON id */
        }
        run(
          `UPDATE outbox_emails
           SET status = 'sent', provider_status = 'sent', provider_id = ?, error = NULL,
               sent_at = ?, last_attempt_at = ?
           WHERE id = ?`,
          providerId,
          nowIso(),
          attemptedAt,
          id,
        );
        return { delivered: true, queued: false, id, reason: null };
      }
    } catch (error) {
      lastError =
        error instanceof Error
          ? `${error.name}: ${error.message}`.slice(0, 400)
          : String(error).slice(0, 400);
    }

    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
  }

  run(
    `UPDATE outbox_emails SET status = 'failed', error = ?, last_attempt_at = ? WHERE id = ?`,
    lastError.slice(0, 500),
    nowIso(),
    id,
  );
  return {
    delivered: false,
    queued: true,
    id,
    reason: lastError.startsWith("HTTP") ? "provider_error" : "network_error",
  };
}

/* ---------------------------------- html ---------------------------------- */

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const linkify = (escaped: string) =>
  escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#2563EB;text-decoration:underline">$1</a>',
  );

export function renderHtml(text: string) {
  const body = linkify(escapeHtml(text)).replace(/\r?\n/g, "<br>");
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>StreamingHub</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e2e8f0">
<tr><td style="padding:28px 28px 8px">
<p style="margin:0 0 20px;font-size:18px;font-weight:700;color:#2563EB">Streaming<span style="color:#06B6D4">Hub</span></p>
<div style="font-size:15px;line-height:1.65;color:#0f172a">${body}</div>
</td></tr>
<tr><td style="padding:20px 28px 26px">
<hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 14px">
<p style="margin:0;font-size:12px;line-height:1.6;color:#64748b">
StreamingHub · streaminghub.org<br>
Support: <a href="mailto:${env.supportEmail}" style="color:#64748b">${env.supportEmail}</a>
</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/* -------------------------------- templates ------------------------------- */

type MailTemplate = { subject: string; text: string };

const signature = (de: boolean) =>
  de
    ? `\n\nBei Fragen antworte einfach auf diese E-Mail oder schreibe an ${env.supportEmail}.`
    : `\n\nIf you have questions, reply to this email or contact ${env.supportEmail}.`;

export function verificationMail(link: string, locale: string): MailTemplate {
  const de = locale !== "en";
  return {
    subject: de ? "Bestätige deine E-Mail-Adresse – StreamingHub" : "Confirm your email – StreamingHub",
    text: de
      ? `Willkommen bei StreamingHub.\n\nBitte bestätige deine E-Mail-Adresse über diesen Link:\n${link}\n\nDer Link ist 48 Stunden gültig. Wenn du kein Konto erstellt hast, ignoriere diese E-Mail.${signature(true)}`
      : `Welcome to StreamingHub.\n\nPlease confirm your email address using this link:\n${link}\n\nThe link is valid for 48 hours. If you did not create an account, please ignore this email.${signature(false)}`,
  };
}

export function resetMail(link: string, locale: string): MailTemplate {
  const de = locale !== "en";
  return {
    subject: de ? "Passwort zurücksetzen – StreamingHub" : "Reset your password – StreamingHub",
    text: de
      ? `Du hast das Zurücksetzen deines Passworts angefordert.\n\nNeues Passwort festlegen:\n${link}\n\nDer Link ist 60 Minuten gültig und kann nur einmal verwendet werden. Falls du diese Anfrage nicht gestellt hast, ist keine Aktion erforderlich.${signature(true)}`
      : `You requested a password reset.\n\nSet a new password:\n${link}\n\nThe link is valid for 60 minutes and can be used once. If you did not request this, no action is needed.${signature(false)}`,
  };
}

export function contactMail(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
  reference: string;
  ip: string;
}): MailTemplate {
  return {
    subject: `[Kontakt] ${input.subject}`.slice(0, 160),
    text: `Neue Kontaktanfrage über streaminghub.org\n\nName: ${input.name}\nE-Mail: ${input.email}\nBetreff: ${input.subject}\n\n${input.message}\n\nReferenz: ${input.reference}\nIP: ${input.ip}`,
  };
}

/**
 * Bestätigung eines Widerrufs in Textform (§ 356a Abs. 4 BGB): Datum, Inhalt
 * der Erklärung und der weitere Ablauf.
 */
export function withdrawalMail(input: {
  reference: string;
  name: string;
  contract: string;
  receivedAt: string;
  locale: string;
}): MailTemplate {
  const de = input.locale !== "en";
  return {
    subject: de
      ? `Bestätigung deines Widerrufs – ${input.reference}`
      : `Confirmation of your withdrawal – ${input.reference}`,
    text: de
      ? `Hallo${input.name ? ` ${input.name}` : ""},\n\nwir bestätigen den Eingang deines Widerrufs.\n\nReferenz: ${input.reference}\nVertrag: ${input.contract}\nEingang: ${input.receivedAt}\n\nDamit hast du den Vertrag widerrufen. Wir erstatten dir alle Zahlungen für diesen Vertrag unverzüglich und spätestens binnen 14 Tagen, gerechnet ab dem Eingang des Widerrufs, über das ursprünglich verwendete Zahlungsmittel. Entgelte für die Rückzahlung berechnen wir nicht.\n\nFalls du zusätzlich eine Kündigung erklären willst, kannst du sie jederzeit über https://streaminghub.org/kuendigung abgeben.${signature(true)}`
      : `Hello${input.name ? ` ${input.name}` : ""},\n\nwe confirm that your withdrawal has reached us.\n\nReference: ${input.reference}\nContract: ${input.contract}\nReceived: ${input.receivedAt}\n\nYou have withdrawn from the contract. We refund every payment for this contract without undue delay and within 14 days of receiving the withdrawal, using the original means of payment. No fees are charged for the refund.\n\nIf you also want to cancel, you can do so at any time via https://streaminghub.org/kuendigung.${signature(false)}`,
  };
}

/**
 * Bestätigung einer Kündigung in Textform (§ 312k Abs. 3 BGB): Datum, Inhalt
 * und – wenn schon bekannt – der Zeitpunkt, zu dem der Vertrag endet.
 */
export function cancellationMail(input: {
  reference: string;
  contract: string;
  receivedAt: string;
  effectiveAt: string | null;
  status: string;
  channel: string | null;
  locale: string;
}): MailTemplate {
  const de = input.locale !== "en";
  const ends = input.effectiveAt
    ? de
      ? `Das Abo endet zum ${input.effectiveAt}.`
      : `The subscription ends on ${input.effectiveAt}.`
    : de
      ? "Zum Zeitpunkt der Kündigung war kein laufendes Abo hinterlegt."
      : "No running subscription was on record at the time of cancellation.";
  const store = input.status === "store_channel"
    ? de
      ? input.channel === "apple"
        ? "Dieses Abo wird über den App Store verwaltet. Bitte kündige es zusätzlich in deinen Apple-Konto-Einstellungen, damit es dort endet."
        : "Dieses Abo wird über den Amazon Appstore verwaltet. Bitte kündige es zusätzlich in deinem Amazon-Konto, damit es dort endet."
      : "This subscription is managed by the store. Please also cancel it in your store account settings so that it ends there."
    : "";
  return {
    subject: de
      ? `Bestätigung deiner Kündigung – ${input.reference}`
      : `Confirmation of your cancellation – ${input.reference}`,
    text: de
      ? `Hallo,\n\nwir bestätigen den Eingang deiner Kündigung.\n\nReferenz: ${input.reference}\nVertrag: ${input.contract}\nEingang: ${input.receivedAt}\n\n${ends}${store ? `\n\n${store}` : ""}${signature(true)}`
      : `Hello,\n\nwe confirm that your cancellation has reached us.\n\nReference: ${input.reference}\nContract: ${input.contract}\nReceived: ${input.receivedAt}\n\n${ends}${store ? `\n\n${store}` : ""}${signature(false)}`,
  };
}

/** Interne Meldung an den Betreiber, damit die Erklärung nicht nur in der Datenbank liegt. */
export function contractRequestNotice(input: {
  kind: "withdrawal" | "cancellation";
  reference: string;
  email: string;
  name: string;
  contract: string;
  status: string;
  note: string | null;
  ip: string;
}): MailTemplate {
  const title = input.kind === "withdrawal" ? "Widerruf" : "Kündigung";
  return {
    subject: `[${title}] ${input.reference}`.slice(0, 160),
    text: `Neue Erklärung über streaminghub.org\n\nArt: ${title}\nReferenz: ${input.reference}\nVertrag: ${input.contract}\nStatus: ${input.status}\nName: ${input.name || "-"}\nE-Mail: ${input.email}\nHinweis: ${input.note ?? "-"}\nIP: ${input.ip}`,
  };
}

/**
 * Hinweis bei fehlgeschlagener Abbuchung. Der Status steht schon auf past_due,
 * Premium ruht also; die Mail nennt Zahlungsmethode und den Weg zum Konto.
 */
export function paymentFailedMail(input: { name: string; locale: string }): MailTemplate {
  const de = input.locale !== "en";
  const link = `${env.appUrl}/dashboard/subscription`;
  return {
    subject: de
      ? "Zahlung fehlgeschlagen – bitte Zahlungsmethode prüfen"
      : "Payment failed – please check your payment method",
    text: de
      ? `Hallo${input.name ? ` ${input.name}` : ""},\n\ndie letzte Zahlung für dein StreamingHub-Premium-Abo ist fehlgeschlagen. Premium ruht deshalb vorerst.\n\nBitte prüfe die Zahlungsmethode, die du beim Abschluss hinterlegt hast, oder schreib dem Support – wir helfen beim Aktualisieren. Sobald die Zahlung erfolgreich ist, wird Premium automatisch wieder freigeschaltet.\n\nDein Abo und den aktuellen Status siehst du hier:\n${link}${signature(true)}`
      : `Hello${input.name ? ` ${input.name}` : ""},\n\nthe last payment for your StreamingHub Premium subscription failed, so Premium is paused for now.\n\nPlease check the payment method you used at checkout or contact support – we can help you update it. Premium is switched back on automatically once the payment succeeds.\n\nYou can see your subscription and its current status here:\n${link}${signature(false)}`,
  };
}

/**
 * Interne Meldung an den Support, wenn eine Zahlung zum zweiten Mal scheitert,
 * damit jemand den Kunden kontaktieren kann. Einmal je Zahlungsplan.
 */
export function paymentFailedSupportNotice(input: {
  name: string;
  email: string;
  customerId: string | null;
  attemptCount: number;
  nextAttemptAt: string | null;
}): MailTemplate {
  return {
    subject: `[Zahlung fehlgeschlagen] ${input.email} – ${input.attemptCount}. Versuch`.slice(0, 160),
    text: `Zahlung wiederholt fehlgeschlagen.\n\nKunde: ${input.name || "-"} <${input.email}>\nStripe-Kunde: ${input.customerId ?? "-"}\nFehlversuche: ${input.attemptCount}\nNächster Versuch: ${input.nextAttemptAt ?? "-"}\n\nPremium ruht, bis die Zahlung eingeht. Bitte Zahlungsmethode prüfen und den Kunden kontaktieren.`,
  };
}

/**
 * Bestätigung des ersten erfolgreichen Checkouts. Der Preis und das
 * Verlängerungsdatum kommen aus dem serverseitig geprüften Stripe-Zustand;
 * die Mail wird pro Checkout-Session nur einmal erzeugt.
 */
export function purchaseConfirmationMail(input: {
  name: string;
  locale: string;
  priceEur: number;
  /** Abrechnung des gekauften Tarifs; ohne Angabe monatlich. */
  interval?: "month" | "year";
  periodEnd?: string | null;
}): MailTemplate {
  const de = input.locale !== "en";
  const unit = input.interval === "year" ? (de ? "Jahr" : "year") : de ? "Monat" : "month";
  const link = `${env.appUrl}/dashboard/subscription`;
  const price = new Intl.NumberFormat(de ? "de-DE" : "en-GB", {
    style: "currency",
    currency: "EUR",
  }).format(input.priceEur);
  const renewal = input.periodEnd ? new Date(input.periodEnd) : null;
  const renewalDate =
    renewal && Number.isFinite(renewal.getTime())
      ? new Intl.DateTimeFormat(de ? "de-DE" : "en-GB", {
          dateStyle: "long",
          timeZone: "Europe/Berlin",
        }).format(renewal)
      : null;
  const details = de
    ? [
        `Preis: ${price} / ${unit} (Endpreis; keine USt. gemäß § 19 UStG)`,
        renewalDate ? `Nächste Verlängerung: ${renewalDate}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `Price: ${price} / ${unit} (final price; no VAT under the German small business regulation)`,
        renewalDate ? `Next renewal: ${renewalDate}` : null,
      ]
        .filter(Boolean)
        .join("\n");

  return {
    subject: de ? "Willkommen bei StreamingHub Premium" : "Welcome to StreamingHub Premium",
    text: de
      ? `Hallo${input.name ? ` ${input.name}` : ""},\n\ndein Kauf von StreamingHub Premium war erfolgreich. Dein Abo ist ab jetzt aktiv.\n\n${details}\n\nAbo und Kündigung:\n${link}\n\nDu kannst dein Abo jederzeit zum Ende des Abrechnungszeitraums kündigen.${signature(true)}`
      : `Hello${input.name ? ` ${input.name}` : ""},\n\nyour purchase of StreamingHub Premium was successful. Your subscription is active now.\n\n${details}\n\nSubscription and cancellation:\n${link}\n\nYou can cancel your subscription at any time at the end of the billing period.${signature(false)}`,
  };
}

/**
 * Start des kostenlosen Testzeitraums. Der Text nennt das Ende, damit niemand
 * eine Abbuchung erwartet: ohne Abo endet der Trial automatisch.
 */
export function trialStartedMail(input: {
  name: string;
  locale: string;
  trialEndsAt: string;
  priceEur: number;
}): MailTemplate {
  const de = input.locale !== "en";
  const link = `${env.appUrl}/premium`;
  const end = new Date(input.trialEndsAt);
  const endDate = Number.isFinite(end.getTime())
    ? new Intl.DateTimeFormat(de ? "de-DE" : "en-GB", {
        dateStyle: "long",
        timeZone: "Europe/Berlin",
      }).format(end)
    : null;
  const price = new Intl.NumberFormat(de ? "de-DE" : "en-GB", {
    style: "currency",
    currency: "EUR",
  }).format(input.priceEur);

  return {
    subject: de
      ? "Dein kostenloser Testzeitraum beginnt – StreamingHub"
      : "Your free trial has started – StreamingHub",
    text: de
      ? `Hallo${input.name ? ` ${input.name}` : ""},\n\ndein kostenloser Testzeitraum für StreamingHub Premium hat begonnen.${endDate ? `\n\nTestzeitraum bis: ${endDate}` : ""}\n\nIn dieser Zeit hast du bis zu 5 gekoppelte Geräte und kannst auf allen Geräten weiterschauen. Danach gilt wieder der kostenlose Tarif mit 2 Geräten.\n\nEs wird nichts abgebucht: Ohne Abschluss eines Abos endet der Testzeitraum automatisch. Wenn du Premium behalten willst, kostet es danach ${price} pro Monat und ist monatlich kündbar:\n${link}${signature(true)}`
      : `Hello${input.name ? ` ${input.name}` : ""},\n\nyour free trial of StreamingHub Premium has started.${endDate ? `\n\nTrial ends: ${endDate}` : ""}\n\nDuring the trial you can link up to 5 devices and continue watching on all of them. Afterwards the free plan with 2 devices applies again.\n\nNothing is charged: without a subscription the trial simply ends. If you want to keep Premium, it costs ${price} per month afterwards and can be cancelled monthly:\n${link}${signature(false)}`,
  };
}

/**
 * Erinnerung kurz vor dem Ende des Testzeitraums. Der Text nennt das Datum und
 * den Preis, damit niemand eine Abbuchung erwartet – ohne Abo endet der Trial.
 */
export function trialReminderMail(input: {
  name: string;
  locale: string;
  trialEndsAt: string;
  priceEur: number;
  /** Limit des kostenlosen Tarifs; steht so auch im Fließtext. */
  deviceLimit?: number;
}): MailTemplate {
  const de = input.locale !== "en";
  const link = `${env.appUrl}/premium`;
  const limit = input.deviceLimit ?? DEFAULT_FREE_DEVICE_LIMIT;
  const end = new Date(input.trialEndsAt);
  const endDate = Number.isFinite(end.getTime())
    ? new Intl.DateTimeFormat(de ? "de-DE" : "en-GB", {
        dateStyle: "long",
        timeZone: "Europe/Berlin",
      }).format(end)
    : null;
  const price = new Intl.NumberFormat(de ? "de-DE" : "en-GB", {
    style: "currency",
    currency: "EUR",
  }).format(input.priceEur);

  return {
    subject: de
      ? "Dein Testzeitraum endet bald – StreamingHub"
      : "Your trial ends soon – StreamingHub",
    text: de
      ? `Hallo${input.name ? ` ${input.name}` : ""},\n\ndein kostenloser Testzeitraum für StreamingHub Premium${endDate ? ` endet am ${endDate}` : " endet in Kürze"}. Danach gilt wieder der kostenlose Tarif mit ${limit} Geräten.\n\nEs wird nichts abgebucht: Ohne Abo endet der Testzeitraum automatisch. Aktiv bleiben dann die ${limit} zuletzt genutzten Geräte; alle weiteren werden beim Ablauf abgemeldet. Deine Playlist bleibt gespeichert; ein abgemeldetes Gerät kannst du in der App neu koppeln, sobald du im Konto ein anderes entfernst.\n\nWenn du Premium behalten willst, sind es ${price} pro Monat, monatlich kündbar:\n${link}${signature(true)}`
      : `Hello${input.name ? ` ${input.name}` : ""},\n\nyour free trial of StreamingHub Premium${endDate ? ` ends on ${endDate}` : " ends soon"}. Afterwards the free plan with ${limit} devices applies again.\n\nNothing is charged: without a subscription the trial simply ends. The ${limit} most recently used devices stay active; any others are unlinked when the trial ends. Your playlist stays stored; an unlinked device can be paired again in the app once you remove another one in your account.\n\nIf you want to keep Premium, it costs ${price} per month and can be cancelled monthly:\n${link}${signature(false)}`,
  };
}

/**
 * Abschlussmail nach dem Ende des Testzeitraums. Sie erklärt den Rückfall auf
 * den kostenlosen Tarif und nennt den Preis, ohne zu drängen.
 */
export function trialEndedMail(input: {
  name: string;
  locale: string;
  priceEur: number;
  /** Limit des kostenlosen Tarifs; steht so auch im Fließtext. */
  deviceLimit?: number;
  /** Geräte, die beim Ablauf abgemeldet wurden. */
  devicesRevoked?: number;
}): MailTemplate {
  const de = input.locale !== "en";
  const link = `${env.appUrl}/premium`;
  const limit = input.deviceLimit ?? DEFAULT_FREE_DEVICE_LIMIT;
  const revoked = input.devicesRevoked ?? 0;
  // Zwei Varianten: "nichts abgemeldet" ist eine andere Zusage als eine
  // Abmeldung, und der Satzbau unterscheidet sich.
  const deviceNote = {
    de:
      revoked > 0
        ? `Davon bleiben die ${limit} zuletzt genutzten aktiv; ${revoked === 1 ? "ein weiteres Gerät wurde" : `${revoked} weitere Geräte wurden`} deshalb abgemeldet. Deine Playlist bleibt gespeichert. Brauchst du später wieder mehr Geräte, kannst du im Konto Platz schaffen oder Premium dazunehmen.`
        : "Deine Geräte bleiben gekoppelt, und deine Playlist bleibt gespeichert – du kannst jederzeit weiterschauen.",
    en:
      revoked > 0
        ? `The ${limit} most recently used ones stay active; ${revoked === 1 ? "one other device was" : `${revoked} other devices were`} unlinked for that reason. Your playlist stays stored. If you need more devices again later, you can free up a slot in your account or add Premium.`
        : "Your devices stay linked and your playlist stays stored, so you can keep watching at any time.",
  };
  const price = new Intl.NumberFormat(de ? "de-DE" : "en-GB", {
    style: "currency",
    currency: "EUR",
  }).format(input.priceEur);

  return {
    subject: de ? "Dein Testzeitraum ist beendet – StreamingHub" : "Your trial has ended – StreamingHub",
    text: de
      ? `Hallo${input.name ? ` ${input.name}` : ""},\n\ndein kostenloser Testzeitraum für StreamingHub Premium ist beendet. Es wurde nichts abgebucht, und es läuft kein Abo.\n\nAb jetzt gilt der kostenlose Tarif mit ${limit} Geräten. ${deviceNote.de}\n\nPremium kostet ${price} pro Monat und ist monatlich kündbar:\n${link}${signature(true)}`
      : `Hello${input.name ? ` ${input.name}` : ""},\n\nyour free trial of StreamingHub Premium has ended. Nothing was charged and no subscription is running.\n\nThe free plan with ${limit} devices applies from now on. ${deviceNote.en}\n\nPremium costs ${price} per month and can be cancelled monthly:\n${link}${signature(false)}`,
  };
}

/**
 * Abschlussmail, wenn ein Abo nach fehlgeschlagenen Zahlungen ausläuft. Die
 * normale Kündigung bekommt ihre eigene Bestätigung.
 */
export function subscriptionEndedMail(input: { name: string; locale: string }): MailTemplate {
  const de = input.locale !== "en";
  const link = `${env.appUrl}/dashboard/subscription`;
  return {
    subject: de
      ? "Dein Premium-Abo ist ausgelaufen – Zahlung fehlgeschlagen"
      : "Your Premium subscription has ended – payment failed",
    text: de
      ? `Hallo${input.name ? ` ${input.name}` : ""},\n\ndein StreamingHub-Premium-Abo ist ausgelaufen, weil die offene Zahlung nicht eingegangen ist. Premium ist damit beendet.\n\nDeine Geräte bleiben gekoppelt und deine Playlist bleibt gespeichert. Du kannst Premium jederzeit neu abschließen:\n${link}${signature(true)}`
      : `Hello${input.name ? ` ${input.name}` : ""},\n\nyour StreamingHub Premium subscription has ended because the outstanding payment did not arrive. Premium is therefore switched off.\n\nYour devices stay linked and your playlist stays stored. You can subscribe to Premium again at any time:\n${link}${signature(false)}`,
  };
}

/**
 * Abschlussmail für Store-Abos (App Store, Amazon Appstore). Kündigung und
 * Verlängerung laufen dort, deshalb nennt der Text den Store.
 */
export function storeSubscriptionEndedMail(input: {
  name: string;
  locale: string;
  store: "apple" | "amazon";
}): MailTemplate {
  const de = input.locale !== "en";
  const link = `${env.appUrl}/dashboard/subscription`;
  const store = de
    ? input.store === "apple"
      ? "den App Store"
      : "den Amazon Appstore"
    : input.store === "apple"
      ? "the App Store"
      : "the Amazon Appstore";
  return {
    subject: de ? "Dein Premium-Abo ist ausgelaufen" : "Your Premium subscription has ended",
    text: de
      ? `Hallo${input.name ? ` ${input.name}` : ""},\n\ndein StreamingHub-Premium-Abo über ${store} ist ausgelaufen. Premium ist damit beendet.\n\nDeine Geräte bleiben gekoppelt und deine Playlist bleibt gespeichert. Wenn du Premium weiter nutzen willst, schließe es erneut ab.\n\nStatus und Abrechnungszeitraum siehst du hier:\n${link}${signature(true)}`
      : `Hello${input.name ? ` ${input.name}` : ""},\n\nyour StreamingHub Premium subscription via ${store} has ended. Premium is therefore switched off.\n\nYour devices stay linked and your playlist stays stored. If you want to keep using Premium, subscribe again.\n\nYou can see the status and billing period here:\n${link}${signature(false)}`,
  };
}

/**
 * Abschlussmail für ein erstattetes Store-Abo. Der Text nennt den Grund, weil
 * „ausgelaufen“ bei einer Erstattung falsch wäre.
 */
export function storeSubscriptionRefundedMail(input: {
  name: string;
  locale: string;
  store: "apple" | "amazon";
}): MailTemplate {
  const de = input.locale !== "en";
  const link = `${env.appUrl}/dashboard/subscription`;
  const store = de
    ? input.store === "apple"
      ? "den App Store"
      : "den Amazon Appstore"
    : input.store === "apple"
      ? "the App Store"
      : "the Amazon Appstore";
  return {
    subject: de ? "Dein Premium-Abo wurde erstattet" : "Your Premium subscription was refunded",
    text: de
      ? `Hallo${input.name ? ` ${input.name}` : ""},\n\nder Kauf deines StreamingHub-Premium-Abos über ${store} wurde erstattet. Premium ist damit beendet.\n\nDeine Geräte bleiben gekoppelt und deine Playlist bleibt gespeichert. Wenn du Premium weiter nutzen willst, kannst du es erneut abschließen.\n\nStatus und Abrechnungszeitraum siehst du hier:\n${link}${signature(true)}`
      : `Hello${input.name ? ` ${input.name}` : ""},\n\nyour purchase of the StreamingHub Premium subscription via ${store} was refunded. Premium is therefore switched off.\n\nYour devices stay linked and your playlist stays stored. If you want to keep using Premium, you can subscribe again.\n\nYou can see the status and billing period here:\n${link}${signature(false)}`,
  };
}

/** Bestätigung nach einer Nachzahlung: Premium ist wieder freigeschaltet. */
export function paymentRecoveredMail(input: { name: string; locale: string }): MailTemplate {
  const de = input.locale !== "en";
  const link = `${env.appUrl}/dashboard/subscription`;
  return {
    subject: de
      ? "Zahlung erfolgreich – Premium ist wieder aktiv"
      : "Payment successful – Premium is active again",
    text: de
      ? `Hallo${input.name ? ` ${input.name}` : ""},\n\ndeine ausstehende Zahlung ist eingegangen. Dein StreamingHub-Premium-Abo ist damit wieder aktiv.\n\nAbrechnungszeitraum und Status siehst du hier:\n${link}${signature(true)}`
      : `Hello${input.name ? ` ${input.name}` : ""},\n\nyour outstanding payment has arrived. Your StreamingHub Premium subscription is active again.\n\nYou can see the billing period and status here:\n${link}${signature(false)}`,
  };
}

export function ticketCreatedMail(input: {
  ticketId: string;
  subject: string;
  category: string;
  message: string;
  userName: string;
  userEmail: string;
}): MailTemplate {
  return {
    subject: `[Support] ${input.subject}`.slice(0, 160),
    text: `Neue Support-Anfrage im Kundenportal\n\nReferenz: ${input.ticketId}\nKunde: ${input.userName} <${input.userEmail}>\nKategorie: ${input.category}\nBetreff: ${input.subject}\n\n${input.message}\n\nBearbeiten: ${env.appUrl}/admin/tickets/${input.ticketId}`,
  };
}

export function ticketReceivedMail(input: {
  ticketId: string;
  subject: string;
  locale: string;
}): MailTemplate {
  const de = input.locale !== "en";
  return {
    subject: de
      ? `Wir haben deine Anfrage erhalten – ${input.subject}`.slice(0, 160)
      : `We received your request – ${input.subject}`.slice(0, 160),
    text: de
      ? `Hallo,\n\nvielen Dank für deine Nachricht. Deine Support-Anfrage ist bei uns eingegangen.\n\nReferenz: ${input.ticketId}\nBetreff: ${input.subject}\n\nWir antworten in der Regel innerhalb von 1–2 Werktagen. Du kannst den Verlauf jederzeit in deinem Konto verfolgen:\n${env.appUrl}/dashboard/support/${input.ticketId}${signature(true)}`
      : `Hello,\n\nthank you for your message. Your support request has reached us.\n\nReference: ${input.ticketId}\nSubject: ${input.subject}\n\nWe usually reply within 1–2 business days. You can follow the conversation in your account at any time:\n${env.appUrl}/dashboard/support/${input.ticketId}${signature(false)}`,
  };
}

export function ticketReplyMail(input: {
  ticketId: string;
  subject: string;
  body: string;
  locale: string;
}): MailTemplate {
  const de = input.locale !== "en";
  return {
    subject: de
      ? `Antwort auf deine Anfrage – ${input.subject}`.slice(0, 160)
      : `Reply to your request – ${input.subject}`.slice(0, 160),
    text: de
      ? `Hallo,\n\ndas Support-Team hat auf deine Anfrage geantwortet.\n\nReferenz: ${input.ticketId}\nBetreff: ${input.subject}\n\n${input.body}\n\nDu kannst direkt antworten:\n${env.appUrl}/dashboard/support/${input.ticketId}${signature(true)}`
      : `Hello,\n\nthe support team has replied to your request.\n\nReference: ${input.ticketId}\nSubject: ${input.subject}\n\n${input.body}\n\nYou can reply here:\n${env.appUrl}/dashboard/support/${input.ticketId}${signature(false)}`,
  };
}

export function ticketCustomerReplyMail(input: {
  ticketId: string;
  subject: string;
  body: string;
  userName: string;
  userEmail: string;
}): MailTemplate {
  return {
    subject: `[Support] Neue Antwort – ${input.subject}`.slice(0, 160),
    text: `Der Kunde hat auf die Anfrage geantwortet.\n\nReferenz: ${input.ticketId}\nKunde: ${input.userName} <${input.userEmail}>\nBetreff: ${input.subject}\n\n${input.body}\n\nBearbeiten: ${env.appUrl}/admin/tickets/${input.ticketId}`,
  };
}
