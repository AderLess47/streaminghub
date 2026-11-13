import { randomToken } from "./auth";
import { get, nowIso, run } from "./db";
import { cancelSubscription, effectiveStatus, getSubscription } from "./payments";

/**
 * Widerruf (§ 356a BGB) und Kündigung (§ 312k BGB) über die Website.
 *
 * Beides muss ohne Anmeldung möglich sein und eine Bestätigung in Textform
 * erzeugen. Die Erklärung selbst ist die Anfrage – der Datensatz ist damit der
 * Beleg, wann sie eingegangen ist; die Bestätigungsseite und die E-Mail nennen
 * Datum, Inhalt und Wirkung.
 */

export type ContractRequestKind = "withdrawal" | "cancellation";

export type ContractRequestStatus =
  | "received" // Widerruf eingegangen, wird bearbeitet
  | "canceled_web" // Kündigung ausgeführt, endet zum Periodenende
  | "store_channel" // Abo liegt bei Apple/Amazon, dort zu kündigen
  | "no_subscription" // kein aktives Abo zu diesem Zeitpunkt
  | "no_account" // keine passende Kundennummer
  | "failed"; // Zahlungsanbieter hat abgelehnt

export type ContractRequest = {
  id: string;
  reference: string;
  kind: ContractRequestKind;
  email: string;
  name: string;
  contract: string;
  note: string | null;
  status: ContractRequestStatus;
  channel: string | null;
  effectiveAt: string | null;
  createdAt: string;
};

const COLUMNS = `id, reference, kind, email, name, contract, note, status,
  channel, effective_at AS effectiveAt, created_at AS createdAt`;

export function findContractRequest(reference: string): ContractRequest | undefined {
  if (!reference) return undefined;
  return get<ContractRequest>(
    `SELECT ${COLUMNS} FROM contract_requests WHERE reference = ?`,
    reference,
  );
}

function insert(input: {
  kind: ContractRequestKind;
  email: string;
  name: string;
  contract: string;
  note: string | null;
  status: ContractRequestStatus;
  channel: string | null;
  effectiveAt: string | null;
  ip: string;
}): ContractRequest {
  const id = randomToken(9);
  const reference =
    input.kind === "withdrawal" ? `W-${randomToken(4)}` : `K-${randomToken(4)}`;
  const createdAt = nowIso();

  run(
    `INSERT INTO contract_requests
       (id, reference, kind, email, name, contract, note, status, channel, effective_at, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    reference,
    input.kind,
    input.email.toLowerCase(),
    input.name,
    input.contract,
    input.note,
    input.status,
    input.channel,
    input.effectiveAt,
    input.ip,
    createdAt,
  );

  return {
    id,
    reference,
    kind: input.kind,
    email: input.email.toLowerCase(),
    name: input.name,
    contract: input.contract,
    note: input.note,
    status: input.status,
    channel: input.channel,
    effectiveAt: input.effectiveAt,
    createdAt,
  };
}

export function recordWithdrawal(input: {
  name: string;
  email: string;
  contract: string;
  note: string;
  ip: string;
}): ContractRequest {
  return insert({
    kind: "withdrawal",
    email: input.email,
    name: input.name,
    contract: input.contract,
    note: input.note || null,
    status: "received",
    channel: null,
    effectiveAt: null,
    ip: input.ip,
  });
}

/**
 * Kündigung: Wird das Abo über die Website (Stripe) geführt, wird es sofort
 * zum Periodenende gekündigt. Bei Apple und Amazon liegt der Vertrag beim
 * Store; die Anfrage wird trotzdem belegt und die Bestätigung sagt, wo zu
 * kündigen ist.
 */
export async function recordCancellation(input: {
  email: string;
  ip: string;
}): Promise<ContractRequest> {
  const user = get<{ id: string; email: string; display_name: string }>(
    `SELECT id, email, display_name FROM users WHERE lower(email) = lower(?)`,
    input.email.trim(),
  );

  if (!user) {
    return insert({
      kind: "cancellation",
      email: input.email,
      name: "",
      contract: "unbekannt",
      note: null,
      status: "no_account",
      channel: null,
      effectiveAt: null,
      ip: input.ip,
    });
  }

  const subscription = getSubscription(user.id);
  if (!subscription || effectiveStatus(subscription) !== "active") {
    return insert({
      kind: "cancellation",
      email: user.email,
      name: user.display_name,
      contract: "premium",
      note: null,
      status: "no_subscription",
      channel: subscription?.channel ?? null,
      effectiveAt: null,
      ip: input.ip,
    });
  }

  if (subscription.channel === "amazon" || subscription.channel === "apple") {
    return insert({
      kind: "cancellation",
      email: user.email,
      name: user.display_name,
      contract: "premium",
      note: null,
      status: "store_channel",
      channel: subscription.channel,
      effectiveAt: subscription.current_period_end,
      ip: input.ip,
    });
  }

  const result = await cancelSubscription(user.id);
  const updated = getSubscription(user.id);
  return insert({
    kind: "cancellation",
    email: user.email,
    name: user.display_name,
    contract: "premium",
    note: result.ok ? null : result.message,
    status: result.ok ? "canceled_web" : "failed",
    channel: subscription.channel,
    effectiveAt: updated?.current_period_end ?? subscription.current_period_end,
    ip: input.ip,
  });
}

/** Vertragsbezeichnung für Bestätigung und Mail. */
export function contractLabel(contract: string, locale: string): string {
  const de = locale !== "en";
  switch (contract) {
    case "web":
      return de ? "Premium-Abo über die Website" : "Premium subscription via the website";
    case "apple":
      return de ? "Abo über den App Store" : "Subscription via the App Store";
    case "amazon":
      return de ? "Abo über den Amazon Appstore" : "Subscription via the Amazon Appstore";
    case "premium":
      return de ? "Premium-Abo" : "Premium subscription";
    case "other":
      return de ? "Sonstiger Vertrag" : "Other contract";
    default:
      return de ? "Unbekannter Vertrag" : "Unknown contract";
  }
}
